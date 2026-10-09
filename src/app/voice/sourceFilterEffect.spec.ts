import {
	createSourceFilterEffect,
	disconnectProcessingEffect,
	prepareSourceFilter,
	updateSourceFilterEffect,
} from './sourceFilterEffect';

describe('NoS source-filter worklet', () => {
	it('registers, updates, and stops its processor in a browser audio context', async () => {
		const context = new AudioContext();
		try {
			await prepareSourceFilter(context);
			const effect = createSourceFilterEffect(context);
			updateSourceFilterEffect(effect, { pitch: 1.3, formant: 0.8, squash: 0.2 });
			expect(effect.node.parameters.get('pitch')?.value).toBeCloseTo(1.3);
			expect(effect.node.parameters.get('formant')?.value).toBeCloseTo(0.8);
			expect(effect.node.parameters.get('squash')?.value).toBeCloseTo(0.2);
			disconnectProcessingEffect(effect);
		} finally {
			await context.close();
		}
	});
});
