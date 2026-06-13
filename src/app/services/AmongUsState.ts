import { ILobbySettings } from './smallInterfaces';

export interface MobileData {
	gameState: AmongUsState;
	lobbySettings: ILobbySettings;
}

export interface AmongUsState {
	gameState: GameState;
	oldGameState: GameState;
	lobbyCode: string;
	players: Player[];
	isHost: boolean;
	clientId: number;
	hostId: number;
	comsSabotaged: boolean;
	mushroomMixupSabotaged?: boolean;
	camouflaged?: boolean;
	lightRadius: number;
}

export interface Player {
	ptr: number;
	id: number;
	clientId: number;
	name: string;
	colorId: number;
	hatId: number | string;
	petId: number;
	skinId: number | string;
	visorId?: string;
	currentOutfit?: number;
	appearanceName?: string;
	appearanceColorId?: number;
	appearanceHatId?: number | string;
	appearanceSkinId?: number | string;
	appearanceVisorId?: string;
	appearanceId?: string;
	disconnected: boolean;
	isImpostor: boolean;
	isDead: boolean;
	taskPtr: number;
	objectPtr: number;
	isLocal: boolean;
	nameHash: number;
	x: number;
	y: number;
	inVent: boolean;
	isbetter: boolean;
	bugged?: boolean;
}

export enum GameState {
	LOBBY,
	TASKS,
	DISCUSSION,
	MENU,
	UNKNOWN,
}
