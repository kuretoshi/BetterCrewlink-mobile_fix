/** Tint the desktop avatar mask with the exact RGB published by NoS. */
export function tintNosAvatar(data: Uint8ClampedArray, hex: string): void {
	const body = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16));
	const visor = [154, 202, 213];
	for (let i = 0; i < data.length; i += 4) {
		const r = data[i];
		const g = data[i + 1];
		const b = data[i + 2];
		const max = Math.max(r, g, b);
		const delta = max - Math.min(r, g, b);
		if (max === 0 || delta / max <= 0.4) continue;
		let hue = 60 * (max === r ? (g - b) / delta : max === g ? 2 + (b - r) / delta : 4 + (r - g) / delta);
		if (hue < 0) hue += 360;
		const near = (target: number, distance: number) => 180 - Math.abs(Math.abs(hue - target) - 180) < distance;
		if (!near(240, 30) && !near(0, 100) && !near(120, 40)) continue;
		const green = r > g && r > b ? Math.max(0, (g - r * (16 / 255)) / (1 - 16 / 255)) : g;
		const blue = r > g && r > b ? Math.max(0, (b - r * (16 / 255)) / (1 - 16 / 255)) : b;
		for (let channel = 0; channel < 3; channel++) {
			const shadow = body[channel] * 0.6;
			const painted = shadow * (blue / 255) * (1 - r / 255) + body[channel] * (r / 255);
			data[i + channel] = Math.round(painted * (1 - green / 255) + visor[channel] * (green / 255));
		}
	}
}

const templates = new Map<boolean, Promise<ImageData>>();
const colored = new Map<string, Promise<string>>();

function loadTemplate(isAlive: boolean): Promise<ImageData> {
	const cached = templates.get(isAlive);
	if (cached) return cached;
	const path = `assets/avatar/nos-${isAlive ? 'player' : 'ghost'}.png`;
	const result = fetch(path)
		.then((response) => {
			if (!response.ok) throw new Error(`NoS avatar template: ${response.status}`);
			return response.blob();
		})
		.then((blob) => createImageBitmap(blob, { colorSpaceConversion: 'none' }))
		.then((image) => {
			try {
				const canvas = document.createElement('canvas');
				canvas.width = image.width;
				canvas.height = image.height;
				const context = canvas.getContext('2d');
				if (!context) throw new Error('Canvas unavailable');
				context.drawImage(image, 0, 0);
				return context.getImageData(0, 0, canvas.width, canvas.height);
			} finally {
				image.close();
			}
		})
		.catch((error) => {
			templates.delete(isAlive);
			throw error;
		});
	templates.set(isAlive, result);
	return result;
}

export function getNosAvatar(isAlive: boolean, color: string): Promise<string> {
	const key = `${isAlive}:${color.toLowerCase()}`;
	const cached = colored.get(key);
	if (cached) return cached;
	const result = loadTemplate(isAlive)
		.then((template) => {
			const canvas = document.createElement('canvas');
			canvas.width = template.width;
			canvas.height = template.height;
			const context = canvas.getContext('2d');
			if (!context) throw new Error('Canvas unavailable');
			const image = new ImageData(new Uint8ClampedArray(template.data), template.width, template.height);
			tintNosAvatar(image.data, color);
			context.putImageData(image, 0, 0);
			return canvas.toDataURL('image/png');
		})
		.catch((error) => {
			colored.delete(key);
			throw error;
		});
	if (colored.size >= 128) colored.delete(colored.keys().next().value!);
	colored.set(key, result);
	return result;
}
