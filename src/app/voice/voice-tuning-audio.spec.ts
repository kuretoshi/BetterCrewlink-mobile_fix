import { VoiceEffectId, VoiceEffectTuning, voiceEffectDefinitions } from '../common/VoiceEffectTuning';
import { createVoiceEffectPreview } from '../pages/audio-settings/voiceEffectPreview';
import { createBibiriEcho, disconnectBibiriEcho, stopBibiriEcho, updateBibiriEcho } from './bibiriEcho';
import { prepareSourceFilter } from './sourceFilterEffect';
import { createTunedPlayback } from './tunedVoiceEffect';

async function render(id: VoiceEffectId, tuning: VoiceEffectTuning, tone = false, voicePeak = .25): Promise<Float32Array> {
	const length = tone ? 96_000 : 48_000;
	const context = new OfflineAudioContext(1, length, 48_000);
	const effect = await createVoiceEffectPreview(context as unknown as AudioContext, id, tuning);
	const source = context.createBufferSource();
	source.buffer = context.createBuffer(1, length, 48_000);
	const input = source.buffer.getChannelData(0);
	if (tone) {
		const harmonics: [number, number][] = [];
		for (let f = 120; f < 6000; f += 120)
			harmonics.push([f, .03 + Math.exp(-(((f - 700) / 200) ** 2)) + .8 * Math.exp(-(((f - 1800) / 300) ** 2))]);
		let peak = 0;
		for (let i = 0; i < input.length; i++) {
			for (const [f, amount] of harmonics) input[i] += amount * Math.sin(2 * Math.PI * f * i / 48_000);
			peak = Math.max(peak, Math.abs(input[i]));
		}
		for (let i = 0; i < input.length; i++) input[i] *= voicePeak / peak;
	}
	else input[0] = .5;
	source.connect(effect.input); effect.output.connect(context.destination); source.start();
	const result = (await context.startRendering()).getChannelData(0);
	effect.dispose();
	return result;
}

function amplitude(data: Float32Array, frequency: number): number {
	let real = 0, imaginary = 0;
	for (let i = 48_000; i < 72_000; i++) {
		const angle = 2 * Math.PI * frequency * i / 48_000;
		real += data[i] * Math.cos(angle); imaginary += data[i] * Math.sin(angle);
	}
	return real * real + imaginary * imaginary;
}

describe('Three-axis audio previews', () => {
	for (const id of Object.keys(voiceEffectDefinitions) as VoiceEffectId[]) {
		it(`${id} is dry with all axes at zero`, async () => {
			const data = await render(id, { pitch: 0, reverb: 0, echo: 0 });
			expect(data[0]).toBe(.5);
			expect(data.slice(1).every(value => value === 0)).toBeTrue();
		});
	}
	for (const [pitch, frequency] of [[-100, 60], [-50, 120 / Math.sqrt(2)], [0, 120], [50, 120 * Math.sqrt(2)], [100, 240]]) {
		it(`renders signed pitch ${pitch} around ${frequency} Hz without changing tails`, async () => {
			const data = await render('nosRokurokubi', { pitch, reverb: 0, echo: 0 }, true);
			expect(Array.from(data).every(Number.isFinite)).toBeTrue();
			let best = 0, detected = 0;
			for (let f = Math.floor(frequency) - 8; f <= Math.ceil(frequency) + 8; f++) {
				const power = amplitude(data, f);
				if (power > best) { best = power; detected = f; }
			}
			expect(Math.abs(detected - frequency)).toBeLessThanOrEqual(2);
			expect(best).toBeGreaterThan(1);
		});
	}
	it('adjusts echo and convolution independently at native pitch', async () => {
		const echo = await render('nosRainbowStar', { pitch: 0, reverb: 0, echo: 100 });
		expect(echo[0]).toBe(.5);
		expect(echo[8_640]).toBeCloseTo(.06, 5);
		expect(echo.slice(17_280, 18_100).some(value => Math.abs(value) > .01)).toBeTrue();
		const reverb = await render('nosRainbowStar', { pitch: 0, reverb: 100, echo: 0 });
		expect(reverb.slice(12_000, 14_000).some(value => Math.abs(value) > 1e-7)).toBeTrue();
	});
});

describe('Bibiri event tail tuning', () => {
	it('keeps processing idle until a death event, then gates all post-effect audio at expiry', async () => {
		const context = new OfflineAudioContext(1, 48_000 * 4, 48_000);
		const source = context.createBufferSource();
		source.buffer = context.createBuffer(1, 48_000 * 4, 48_000);
		const input = source.buffer.getChannelData(0);
		for (let i = 0; i < input.length; i++) input[i] = .2 * Math.sin(2 * Math.PI * 440 * i / 48_000);
		const impulse = await context.decodeAudioData(await (await fetch('assets/sounds/reverb.ogx')).arrayBuffer());
		await prepareSourceFilter(context);
		const convolver = spyOn(context, 'createConvolver').and.callThrough();
		const effect = createBibiriEcho(context as unknown as AudioContext, source, context.destination);
		const tuning = { pitch: 50, reverb: 100, echo: 0 };
		updateBibiriEcho(effect, true, false, undefined, 1000, tuning, impulse, true);
		expect(effect.peakGuard).toBeUndefined();
		expect(effect.playback.processing.pitch).toBeUndefined();
		expect(effect.playback.processing.echo).toBeUndefined();
		expect(convolver).not.toHaveBeenCalled();
		const suspend = context.suspend(.5);
		source.start();
		const rendering = context.startRendering();
		await suspend;
		updateBibiriEcho(effect, true, true, 1000, 1000, tuning, impulse, true);
		expect(effect.peakGuard).toBeDefined();
		expect(effect.feedback.gain.value).toBe(0);
		expect(effect.playback.processing.pitch).toBeDefined();
		expect(convolver.calls.count()).toBe(1);
		await context.resume();
		const data = (await rendering).getChannelData(0);
		expect(data.slice(24_000, 60_000).some(value => Math.abs(value) > 1e-6)).toBeTrue();
		expect(data.slice(145_000).every(value => value === 0)).toBeTrue();
		stopBibiriEcho(effect);
		expect(effect.peakGuard).toBeUndefined();
		expect(effect.until).toBe(0);
		expect(effect.playback.processing.pitch).toBeUndefined();
		disconnectBibiriEcho(effect);
	});
	it('stops the reverb tail immediately when playback is muted', async () => {
		const context = new OfflineAudioContext(1, 48_000 * 2, 48_000);
		const source = context.createConstantSource();
		source.offset.value = .2;
		const impulse = await context.decodeAudioData(await (await fetch('assets/sounds/reverb.ogx')).arrayBuffer());
		const effect = createBibiriEcho(context as unknown as AudioContext, source, context.destination);
		const tuning = { pitch: 0, reverb: 100, echo: 40 };
		updateBibiriEcho(effect, true, false, undefined, 1000, tuning, impulse, false);
		const death = context.suspend(.5), mute = context.suspend(1);
		source.start();
		const rendering = context.startRendering();
		await death;
		updateBibiriEcho(effect, true, true, 1000, 1000, tuning, impulse, false);
		await context.resume();
		await mute;
		stopBibiriEcho(effect);
		await context.resume();
		const data = (await rendering).getChannelData(0);
		expect(data.slice(26_000, 46_000).some(value => Math.abs(value) > 1e-6)).toBeTrue();
		expect(data.slice(50_000).every(value => value === 0)).toBeTrue();
		disconnectBibiriEcho(effect);
	});
});

describe('Effect gain continuity', () => {
	it('smooths Bibiri preview wet and feedback changes without reapplying the same snapshot', async () => {
		const rate = 48_000, context = new OfflineAudioContext(1, rate, rate);
		const preview = await createVoiceEffectPreview(context as unknown as AudioContext, 'nosBibiri',
			{ pitch: 0, reverb: 0, echo: 25 });
		const oscillator = context.createOscillator(), level = context.createGain();
		oscillator.frequency.value = 100;
		level.gain.value = .2;
		oscillator.connect(level); level.connect(preview.input); preview.output.connect(context.destination);
		oscillator.start();
		const paused = context.suspend(.5), rendering = context.startRendering();
		await paused;
		const boundary = Math.round(context.currentTime * rate);
		const ramp = spyOn(AudioParam.prototype, 'setTargetAtTime').and.callThrough();
		preview.update({ pitch: 0, reverb: 0, echo: 75 });
		preview.update({ pitch: 0, reverb: 0, echo: 75 });
		expect(ramp.calls.count()).toBe(2);
		expect(ramp.calls.allArgs().map(args => args[0])).toEqual([(.65 * 75) / 100, (.56 * 75) / 100]);
		await context.resume();
		const data = (await rendering).getChannelData(0);
		expect(Math.abs(data[boundary] - data[boundary - 1])).toBeLessThan(.2 * 2 * Math.PI * 100 / rate * 2);
		expect(Array.from(data).every(Number.isFinite)).toBeTrue();
		preview.dispose();
	});
	for (const kind of ['echo', 'reverb', 'grit']) {
		it(`smooths a live ${kind} strength change without rebuilding its nodes`, async () => {
			const rate = 48_000, context = new OfflineAudioContext(1, rate, rate);
			const impulse = context.createBuffer(1, 241, rate);
			impulse.getChannelData(0)[240] = 1;
			const playback = createTunedPlayback(context as unknown as AudioContext);
			const tuning = (amount: number) => ({ pitch: 0, reverb: kind === 'reverb' ? amount : 0,
				echo: kind === 'echo' ? amount : 0 });
			playback.update(tuning(25), impulse, true, kind === 'grit' ? 25 : 0);
			const previousEcho = playback.processing.echo, previousGrit = playback.processing.berserker;
			const oscillator = context.createOscillator(), level = context.createGain();
			oscillator.frequency.value = 100;
			level.gain.value = .2;
			oscillator.connect(level); level.connect(playback.input); playback.output.connect(context.destination);
			oscillator.start();
			const paused = context.suspend(.5), rendering = context.startRendering();
			await paused;
			const boundary = Math.round(context.currentTime * rate);
			playback.update(tuning(75), impulse, true, kind === 'grit' ? 75 : 0);
			playback.update(tuning(75), impulse, true, kind === 'grit' ? 75 : 0);
			expect(playback.processing.echo).toBe(previousEcho);
			expect(playback.processing.berserker).toBe(previousGrit);
			await context.resume();
			const data = (await rendering).getChannelData(0);
			const jump = Math.abs(data[boundary] - data[boundary - 1]);
			const naturalStep = .2 * 2 * Math.PI * 100 / rate;
			expect(jump).withContext(`instantaneous ${kind} gain jump`).toBeLessThan(naturalStep * 2);
			expect(Array.from(data).every(Number.isFinite)).toBeTrue();
			expect(Math.max(...data.map(Math.abs))).toBeLessThan(1);
			playback.disconnect();
		});
	}
	it('keeps speech audible while a newly enabled pitch processor fills its analysis window', async () => {
		const rate = 48_000, context = new OfflineAudioContext(1, rate, rate);
		await prepareSourceFilter(context);
		const playback = createTunedPlayback(context as unknown as AudioContext);
		const source = context.createBufferSource(), buffer = context.createBuffer(1, rate, rate);
		const input = buffer.getChannelData(0), harmonics: [number, number][] = [];
		for (let f = 120; f < 6000; f += 120)
			harmonics.push([f, .03 + Math.exp(-(((f - 700) / 200) ** 2)) + .8 * Math.exp(-(((f - 1800) / 300) ** 2))]);
		let peak = 0;
		for (let i = 0; i < input.length; i++) {
			for (const [f, amount] of harmonics) input[i] += amount * Math.sin(2 * Math.PI * f * i / rate);
			peak = Math.max(peak, Math.abs(input[i]));
		}
		for (let i = 0; i < input.length; i++) input[i] *= .25 / peak;
		source.buffer = buffer;
		source.connect(playback.input); playback.output.connect(context.destination); source.start();
		const paused = context.suspend(.4), rendering = context.startRendering();
		await paused;
		const boundary = Math.round(context.currentTime * rate);
		playback.update({ pitch: 50, reverb: 0, echo: 0 }, null);
		await context.resume();
		const data = (await rendering).getChannelData(0);
		const rms = (samples: Float32Array, from: number, to: number) =>
			Math.sqrt(samples.slice(from, to).reduce((sum, value) => sum + value * value, 0) / (to - from));
		expect(rms(data, boundary, boundary + 960)).toBeGreaterThan(rms(input, boundary, boundary + 960) * .8);
		expect(rms(data, rate * .7, rate * .8)).toBeGreaterThan(.001);
		playback.disconnect();
	});
});

describe('Effect peak headroom', () => {
	for (const kind of ['neutral', 'echo', 'Bibiri']) {
		it(`keeps high-input ${kind} playback finite and protects only active effects`, async () => {
			const rate = 48_000, context = new OfflineAudioContext(1, rate, rate);
			const tuning = { pitch: 0, reverb: 0, echo: kind === 'neutral' ? 0 : 100 };
			const preview = await createVoiceEffectPreview(context as unknown as AudioContext,
				kind === 'Bibiri' ? 'nosBibiri' : 'nosRainbowStar', tuning);
			const source = context.createBufferSource(), buffer = context.createBuffer(1, rate, rate);
			const input = buffer.getChannelData(0);
			for (let i = 0; i < input.length; i++) input[i] = .95 * Math.sin(2 * Math.PI * 100 * i / rate);
			source.buffer = buffer;
			source.connect(preview.input); preview.output.connect(context.destination); source.start();
			const data = (await context.startRendering()).getChannelData(0);
			expect(Array.from(data).every(Number.isFinite)).toBeTrue();
			if (kind === 'neutral') expect(data.every((value, index) => value === input[index])).toBeTrue();
			else expect(Math.max(...data.map(Math.abs))).toBeLessThanOrEqual(.9801);
			preview.dispose();
		});
	}
	it('softens high voiced pitch-down peaks without a hard-clipped plateau', async () => {
		const data = await render('nosSize', { pitch: -100, reverb: 0, echo: 0 }, true, .95);
		expect(Array.from(data).every(Number.isFinite)).toBeTrue();
		expect(data.some(value => Math.abs(value) >= .999999)).toBeFalse();
		let peak = 0;
		for (const value of data) peak = Math.max(peak, Math.abs(value));
		expect(peak).toBeLessThanOrEqual(.9801);
	});
});
