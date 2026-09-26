export interface NosPlayerData {
	playerId: number;
	name: string;
	isKiller: boolean;
	isImpostor: boolean;
	isCrewmate: boolean;
	isNeutral: boolean;
	isImpostorlike: boolean;
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
	name: string;
}
