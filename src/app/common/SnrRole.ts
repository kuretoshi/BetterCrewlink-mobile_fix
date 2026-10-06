export interface SnrEnumValue {
	value: number;
	name: string | null;
}

export interface SnrLiveRole {
	role: SnrEnumValue;
	modifier: SnrEnumValue | null;
	ghostRole: SnrEnumValue | null;
	isNeutral?: boolean;
	canKill?: boolean;
	assignedTeam?: SnrEnumValue | null;
	winnerTeam?: SnrEnumValue | null;
	teamTag?: SnrEnumValue | null;
	jumbo?: { currentSize: number; maxSize: number };
	hat2Id?: string;
	visor2Id?: string;
}

const jackalRoles = new Set(['Jackal', 'WaveCannonJackal']);
const sidekickRoles = new Set(['Sidekick', 'SidekickWaveCannon']);

export const isSnrJackal = (role?: SnrLiveRole): boolean => !!role?.role.name && jackalRoles.has(role.role.name);
export const isSnrSidekick = (role?: SnrLiveRole): boolean => !!role?.role.name && sidekickRoles.has(role.role.name);
export const isSnrNeutralKiller = (role?: SnrLiveRole): boolean =>
	isSnrJackal(role) || (role?.isNeutral === true && role.canKill === true);
export const isSnrJackalTeam = (role?: SnrLiveRole): boolean => isSnrJackal(role) || isSnrSidekick(role);
export const hasSnrJumbo = (role?: SnrLiveRole): boolean =>
	role?.modifier?.name?.split(' | ').includes('JumboModifier') ?? false;
