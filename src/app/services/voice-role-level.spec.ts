import { voiceRoleLevel } from './voice-role-level';

describe('NoS role microphone calibration', () => {
	it('preserves the input for existing settings and at 100%', () => {
		expect(voiceRoleLevel(0.02, undefined)).toBe(0.02);
		expect(voiceRoleLevel(0.02, 100)).toBe(0.02);
	});
	it('adjusts quiet microphones without changing the call audio graph', () => {
		expect(voiceRoleLevel(0.02, 300)).toBeCloseTo(0.06);
		expect(voiceRoleLevel(0.02, 50)).toBeCloseTo(0.01);
		expect(voiceRoleLevel(0, 1000)).toBe(0);
	});
	it('bounds amplified samples and rejects invalid input', () => {
		expect(voiceRoleLevel(0.5, 1000)).toBe(1);
		expect(voiceRoleLevel(NaN, 300)).toBe(0);
		expect(voiceRoleLevel(-1, 300)).toBe(0);
		expect(voiceRoleLevel(0.02, NaN)).toBe(0.02);
	});
});
