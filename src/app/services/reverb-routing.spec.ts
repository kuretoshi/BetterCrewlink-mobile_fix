import { rebuildEffectChain } from './AudioController.service';
import { PeerAudioNodes } from '../voice/types';

describe('SNR reverb audio routing', () => {
	it('connects convolution and dry speech, and disconnects both when disabled', () => {
		const node = () => ({ targets: [] as unknown[], connect(target: unknown) { this.targets.push(target); },
			disconnect() { this.targets = []; } });
		const gain = node(), reverb = node(), dry = node(), wet = node(), output = node(), destination = node();
		const peer = { gain, reverb, muffle: node(), radioEcho: { output: node() },
			reverbMix: { dry, wet, output }, reverbConnected: false, muffleConnected: false,
			voiceEffectConnected: false, radioEchoConnected: false } as unknown as PeerAudioNodes;
		rebuildEffectChain(peer, destination as unknown as AudioNode, true, false, false, false, false);
		expect(gain.targets).toEqual([reverb, dry]);
		expect(reverb.targets).toEqual([wet]);
		expect(output.targets).toEqual([destination]);
		rebuildEffectChain(peer, destination as unknown as AudioNode, false, false, false, false, false);
		expect(gain.targets).toEqual([destination]);
		expect(reverb.targets).toEqual([]);
		expect(output.targets).toEqual([]);
	});
});
