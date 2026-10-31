import AudioController from './AudioController.service';
import { AmongUsState, GameState, Player } from '../common/AmongUsState';
import { CameraLocation, MapType } from '../common/AmongusMap';
import { ISettings } from '../common/ISettings';
import { defaultLobbySettings, PeerAudioNodes } from '../voice/types';
import { createTunedVoiceEffect } from '../voice/tunedVoiceEffect';
import { createVoiceEffectPreview } from '../pages/audio-settings/voiceEffectPreview';

class Node {
	targets: Node[] = [];
	gain = { value: 1, cancelScheduledValues() { return undefined; }, setTargetAtTime(value: number) { this.value = value; } };
	frequency = { value: 0 };
	Q = { value: 0 };
	delayTime = { value: 0 };
	positionX = { setValueAtTime() { return undefined; } };
	positionY = { setValueAtTime() { return undefined; } };
	positionZ = { setValueAtTime() { return undefined; } };
	context = { currentTime: 0 };
	connect(target: Node) { this.targets.push(target); return target; }
	disconnect() { this.targets = []; }
}

describe('NoS role audio graph', () => {
	function setup() {
		const controller = new AudioController(null!, null!);
		const gain = new Node(), reverb = new Node(), destination = new Node();
		gain.connect(destination);
		const peer = { gain, reverb, muffle: new Node(), pan: new Node(), radioEcho: { output: new Node() },
			reverbConnected: false, muffleConnected: false, voiceEffectConnected: false, radioEchoConnected: false } as unknown as PeerAudioNodes;
		const context = { currentTime: 0, createGain: () => new Node(), createWaveShaper: () => new Node() };
		gain.context = context;
		Object.assign(controller, { context, convolverBuffer: {}, masterGain: destination,
			peers: new Map([['peer', peer]]) });
		const state = { mod: 'NoS', gameState: GameState.TASKS, map: MapType.THE_SKELD,
			currentCamera: CameraLocation.NONE, closedDoors: [] } as unknown as AmongUsState;
		const me = { id: 1, isLocal: true, x: 0, y: 0 } as Player;
		const other = { id: 2, x: 1, y: 0, nosRole: { isRainbowStar: true } } as Player;
		const settings = { enableSpatialAudio: true, nosRainbowStarEchoStrength: 100 } as ISettings;
		const apply = (strength = 100, lobby = defaultLobbySettings) => controller.applyVoiceAudio('peer', state,
			{ ...settings, nosRainbowStarEchoStrength: strength }, lobby, me, other, -1);
		return { controller, peer, gain, reverb, destination, state, me, other, apply };
	}
	it('uses one common convolver and changes dry/wet strength without adding a delay', () => {
		const { apply, peer, gain, reverb } = setup();
		expect(apply()).toBeGreaterThan(0);
		expect(peer.reverbConnected).toBeTrue();
		expect(peer.roleReverbConnected).toBeTrue();
		expect(gain.targets).toContain(reverb);
		expect(reverb.targets.length).toBe(1);
		expect(peer.reverbMix!.dry.gain.value).toBe(0);
		expect(peer.reverbMix!.wet.gain.value).toBe(1);
		apply(35);
		expect(peer.reverbMix!.dry.gain.value).toBeCloseTo(.65);
		expect(peer.reverbMix!.wet.gain.value).toBeCloseTo(.35);
		expect(reverb.targets.length).toBe(1);
	});
	for (const reason of ['zero', 'host off', 'role lost', 'dead', 'disconnected', 'muted', 'out of range']) {
		it(`disconnects Star reverb when ${reason}`, () => {
			const fixture = setup();
			fixture.apply();
			if (reason === 'role lost') fixture.other.nosRole!.isRainbowStar = false;
			if (reason === 'dead') fixture.other.isDead = true;
			if (reason === 'disconnected') fixture.other.disconnected = true;
			if (reason === 'muted') fixture.controller.audioMuted = true;
			if (reason === 'out of range') fixture.other.x = 100;
			fixture.apply(reason === 'zero' ? 0 : 100,
				reason === 'host off' ? { ...defaultLobbySettings, nosRainbowStarEcho: false } : defaultLobbySettings);
			expect(fixture.peer.roleReverbConnected).toBeFalse();
			expect(fixture.peer.reverbConnected).toBeFalse();
			expect(fixture.reverb.targets.length).toBe(0);
			expect(fixture.gain.targets).toEqual([fixture.destination]);
		});
	}
	it('preserves an ordinary ghost convolver when Star is absent and spatial result retains it', () => {
		const { apply, peer, other } = setup();
		apply();
		peer.roleReverbConnected = false;
		other.disconnected = true;
		apply();
		expect(peer.reverbConnected).toBeTrue();
	});
	it('keeps speech dry until the shared impulse has loaded, then enables Star', () => {
		const { controller, apply, peer, gain, destination } = setup();
		Object.assign(controller, { convolverBuffer: null });
		expect(apply()).toBeGreaterThan(0);
		expect(peer.reverbConnected).toBeFalse();
		expect(peer.roleReverbConnected).toBeFalse();
		expect(gain.targets).toEqual([destination]);
		Object.assign(controller, { convolverBuffer: {} });
		apply();
		expect(peer.roleReverbConnected).toBeTrue();
	});
	it('mutes the final existing tail gain immediately and restores it on unmute', () => {
		const { controller, apply, peer } = setup();
		apply();
		controller.setPeerGain('peer', 0);
		expect(peer.gain.gain.value).toBe(0);
		expect(peer.reverbMix!.output.gain.value).toBe(0);
		controller.setPeerGain('peer', .5);
		expect(peer.reverbMix!.output.gain.value).toBe(1);
	});

	it('renders a Berserker echo at 180/360 ms and bypasses it at zero strength', async () => {
		async function render(strength: number) {
			const context = new OfflineAudioContext(1, 48_000, 48_000);
			const effect = createTunedVoiceEffect(context as unknown as AudioContext);
			effect.update({ pitch: 0, reverb: 0, echo: strength }, strength, false);
			const source = context.createBufferSource();
			source.buffer = context.createBuffer(1, 48_000, 48_000);
			source.buffer.getChannelData(0)[0] = .5;
			source.connect(effect.input); effect.output.connect(context.destination); source.start();
			const data = (await context.startRendering()).getChannelData(0);
			effect.disconnect();
			return data;
		}
		const data = await render(100), dry = await render(0);
		const energy = (start: number) => data.slice(start, start + 900).reduce((sum, v) => sum + v * v, 0);
		expect(energy(8_640)).toBeGreaterThan(1e-7);
		expect(energy(17_280)).toBeGreaterThan(1e-9);
		expect(energy(17_280)).toBeLessThan(energy(8_640));
		expect(Array.from(data).every(Number.isFinite)).toBeTrue();
		expect(dry[0]).toBe(.5);
		expect(dry.slice(1).every(value => value === 0)).toBeTrue();
	});
	it('previews Star with the released impulse response, dry at zero and cleared after dispose', async () => {
		async function render(strength: number, dispose = false) {
			const context = new OfflineAudioContext(1, 48_000, 48_000);
			const preview = await createVoiceEffectPreview(context as unknown as AudioContext, 'nosRainbowStar', { pitch: 0, reverb: strength, echo: 0 });
			preview.update({ pitch: 0, reverb: strength, echo: 0 });
			const source = context.createBufferSource();
			source.buffer = context.createBuffer(1, 48_000, 48_000);
			source.buffer.getChannelData(0)[0] = .5;
			source.connect(preview.input); preview.output.connect(context.destination); source.start();
			if (dispose) preview.dispose();
			const data = (await context.startRendering()).getChannelData(0);
			preview.dispose();
			return data;
		}
		const data = await render(100), dry = await render(0), blend = await render(35), disposed = await render(100, true);
		// A diffuse IR has energy between the obsolete 75 ms repeat positions.
		expect(data.slice(12_000, 14_000).some(value => Math.abs(value) > 1e-7)).toBeTrue();
		expect(Array.from(data).every(Number.isFinite)).toBeTrue();
		expect(dry[0]).toBe(.5);
		expect(dry.slice(1).every(value => value === 0)).toBeTrue();
		expect(blend[0]).toBeCloseTo(data[0] * .35 + .5 * .65, 5);
		expect(blend[20_000]).toBeCloseTo(data[20_000] * .35, 5);
		expect(disposed.every(value => value === 0)).toBeTrue();
	});
});
