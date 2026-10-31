import { rebuildEffectChain } from './AudioController.service';
import { PeerAudioNodes } from '../voice/types';

describe('SNR reverb audio routing', () => {
	it('connects convolution and dry speech, and disconnects both when disabled', () => {
		const node = () => ({ gain: { value: 1 }, context: undefined as unknown, targets: [] as unknown[],
			connect(target: unknown) { this.targets.push(target); },
			disconnect() { this.targets = []; } });
		const gain = node(), reverb = node(), dry = node(), wet = node(), output = node(), destination = node();
		gain.context = { createGain: node, createWaveShaper: node };
		const peer = { gain, reverb, muffle: node(), radioEcho: { output: node() },
			reverbMix: { dry, wet, output }, reverbConnected: false, muffleConnected: false,
			voiceEffectConnected: false, radioEchoConnected: false } as unknown as PeerAudioNodes;
		rebuildEffectChain(peer, destination as unknown as AudioNode, true, false, false, false);
		expect(gain.targets.length).toBe(2);
		expect(gain.targets[0]).toBe(reverb);
		expect(gain.targets[1]).toBe(dry);
		expect(reverb.targets.length).toBe(1);
		expect(reverb.targets[0]).toBe(wet);
		expect(output.targets.length).toBe(1);
		expect(output.targets[0]).toBe(peer.peakGuard!.input);
		const guard = peer.peakGuard!;
		expect((guard.output as unknown as ReturnType<typeof node>).targets[0]).toBe(destination);
		rebuildEffectChain(peer, destination as unknown as AudioNode, false, false, false, false);
		expect(gain.targets).toEqual([destination]);
		expect(reverb.targets).toEqual([]);
		expect(output.targets).toEqual([]);
		expect(peer.peakGuard).toBeUndefined();
		expect((guard.output as unknown as ReturnType<typeof node>).targets.length).toBe(0);
	});
	it('keeps an unavailable pitch worklet dry, then protects its output when it becomes ready', () => {
		const node = () => ({ gain: { value: 1 }, context: undefined as unknown, targets: [] as unknown[],
			connect(target: unknown) { this.targets.push(target); }, disconnect() { this.targets = []; } });
		const gain = node(), destination = node();
		gain.context = { createGain: node, createWaveShaper: node };
		const effect = { kind: 'tuned', input: node(), output: node(), pitch: undefined as unknown };
		const peer = { gain, reverb: node(), muffle: node(), voiceEffect: effect,
			radioEcho: { output: node() }, reverbConnected: false, muffleConnected: false,
			voiceEffectConnected: false, radioEchoConnected: false } as unknown as PeerAudioNodes;
		rebuildEffectChain(peer, destination as unknown as AudioNode, false, false, false, true);
		expect(peer.peakGuard).toBeUndefined();
		expect(effect.output.targets.length).toBe(1);
		expect(effect.output.targets[0]).toBe(destination);
		effect.pitch = {};
		rebuildEffectChain(peer, destination as unknown as AudioNode, false, false, false, true);
		expect(peer.peakGuard).toBeDefined();
		expect(effect.output.targets.length).toBe(1);
		expect(effect.output.targets[0]).toBe(peer.peakGuard!.input);
	});
});
