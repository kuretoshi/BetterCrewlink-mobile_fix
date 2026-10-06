export interface NosPlayerData {
	skin?: { name: string };
	hat?: { name: string };
	visor?: { name: string };
	playerId: number;
	name: string;
	isKiller: boolean;
	isImpostor: boolean;
	isCrewmate: boolean;
	isNeutral: boolean;
	isImpostorlike: boolean;
	isJammed?: boolean;
	speakerPositionX: number;
	speakerPositionY: number;
	bodyRateX?: number;
	bodyRateY?: number;
	colorR: number;
	colorG: number;
	colorB: number;
}

export interface NosRadioData {
	kind: number;
	hearableMask: number;
	nameLength: number;
	name: string;
}

export const NOS_JACKAL_RADIO_KIND = 1;

export function canHearNosJackalRadio(radios: readonly NosRadioData[] | undefined, playerId: number): boolean {
	return (
		Number.isInteger(playerId) &&
		playerId >= 0 &&
		playerId < 32 &&
		(radios?.some((radio) => radio.kind === NOS_JACKAL_RADIO_KIND && ((radio.hearableMask >>> playerId) & 1) !== 0) ??
			false)
	);
}

export function isNosRadioData(value: unknown): value is NosRadioData {
	if (!value || typeof value !== 'object') return false;
	const radio = value as Partial<NosRadioData>;
	return (
		Number.isInteger(radio.kind) &&
		Number.isInteger(radio.hearableMask) &&
		(radio.hearableMask as number) >= -0x80000000 &&
		(radio.hearableMask as number) <= 0x7fffffff &&
		Number.isInteger(radio.nameLength) &&
		(radio.nameLength as number) >= 0 &&
		(radio.nameLength as number) <= 32 &&
		typeof radio.name === 'string' &&
		radio.name.length === radio.nameLength
	);
}

export function nosColorHex(player?: Pick<NosPlayerData, 'colorR' | 'colorG' | 'colorB'>): string | undefined {
	if (!player) return undefined;
	const rgb = [player.colorR, player.colorG, player.colorB];
	if (!rgb.every(Number.isFinite)) return undefined;
	return (
		'#' +
		rgb
			.map((value) =>
				Math.round(Math.max(0, Math.min(1, value)) * 255)
					.toString(16)
					.padStart(2, '0')
			)
			.join('')
	);
}

/** Match NoS' published RGB to the avatar palette, allowing byte rounding. */
export function findNosColorIndex(player: NosPlayerData | undefined, palette: string[][]): number {
	const hex = nosColorHex(player);
	if (!hex) return -1;
	const rgb = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16));
	return palette.findIndex(
		([color]) =>
			/^#[0-9a-f]{6}$/i.test(color) &&
			rgb.every((value, index) => Math.abs(value - Number.parseInt(color.slice(1 + index * 2, 3 + index * 2), 16)) <= 1)
	);
}
