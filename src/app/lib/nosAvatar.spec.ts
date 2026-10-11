import { tintNosAvatar } from './nosAvatar';

describe('NoS avatar tint', () => {
	it('paints a solid mask pixel with the exact host RGB, including non-palette colours', () => {
		const pixels = new Uint8ClampedArray([255, 16, 16, 255]);
		tintNosAvatar(pixels, '#6543d2');
		expect(Array.from(pixels)).toEqual([0x65, 0x43, 0xd2, 255]);
	});

	it('preserves transparent and non-body pixels', () => {
		const pixels = new Uint8ClampedArray([0, 0, 0, 0, 154, 202, 213, 255]);
		tintNosAvatar(pixels, '#6543d2');
		expect(Array.from(pixels)).toEqual([0, 0, 0, 0, 154, 202, 213, 255]);
	});
});
