import { setEffectGain } from './effectGain';

describe('Effect gain automation', () => {
	it('sets the initial level immediately and does not restart smoothing for identical snapshots', () => {
		const context = new OfflineAudioContext(1, 128, 48_000), node = context.createGain();
		const ramp = spyOn(node.gain, 'setTargetAtTime').and.callThrough();
		setEffectGain(node, .25);
		expect(node.gain.value).toBe(.25);
		expect(ramp).not.toHaveBeenCalled();
		setEffectGain(node, .75);
		setEffectGain(node, .75);
		expect(ramp.calls.count()).toBe(1);
		expect(ramp.calls.mostRecent().args).toEqual([.75, context.currentTime, .01]);
	});
});
