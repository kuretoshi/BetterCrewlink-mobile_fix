import { combineVoiceEffectTunings, getVoiceEffectTuning, normalizeVoiceEffectTuning,
	voiceEffectDefinitions, VoiceEffectId, voicePitchRatio } from './VoiceEffectTuning';

describe('Personal voice effect tunings', () => {
	const ids = Object.keys(voiceEffectDefinitions) as VoiceEffectId[];
	for (const id of ids) {
		it(`keeps independent axes and legacy presets for ${id}`, () => {
			const definition = voiceEffectDefinitions[id];
			const settings = { [definition.strengthKey]: 37 };
			const before = JSON.stringify(settings);
			expect(getVoiceEffectTuning(settings, id)).toEqual({ pitch: definition.pitchSign * 37,
				reverb: definition.reverb ? 37 : 0, echo: definition.echo ? 37 : 0 });
			const tuned = { ...settings, voiceEffectTunings: { [id]: { pitch: -50, reverb: 23, echo: 41 } } };
			expect(getVoiceEffectTuning(tuned, id)).toEqual({ pitch: -50, reverb: 23, echo: 41 });
			expect(getVoiceEffectTuning(JSON.parse(JSON.stringify(tuned)), id)).toEqual({ pitch: -50, reverb: 23, echo: 41 });
			expect(JSON.stringify(settings)).toBe(before);
		});
	}
	it('normalizes each axis and combines pitch independently of effect order', () => {
		expect(ids.length).toBe(11);
		expect(normalizeVoiceEffectTuning({ pitch: NaN, reverb: Infinity, echo: -5 })).toEqual({ pitch: 0, reverb: 0, echo: 0 });
		expect(normalizeVoiceEffectTuning({ pitch: -200, reverb: 999, echo: 55 })).toEqual({ pitch: -100, reverb: 100, echo: 55 });
		const values = [{ pitch: 100, reverb: 15, echo: 3 }, { pitch: 100, reverb: 2, echo: 25 }, { pitch: -100, reverb: 50, echo: 4 }];
		expect(combineVoiceEffectTunings(values)).toEqual({ pitch: 100, reverb: 50, echo: 25 });
		expect(combineVoiceEffectTunings(values.reverse())).toEqual({ pitch: 100, reverb: 50, echo: 25 });
		expect([-100, 0, 100].map(voicePitchRatio)).toEqual([.5, 1, 2]);
	});
});
