import { isPlayerImpostor, isTohImpostorEntries, withImpostorClassification } from './Impostor';
import { canTohHearGhosts, tohGhostRoleEnabled, tohGhostRoleGroups } from './TohGhostRoles';
import { isTohRoleCatalog, TohRole } from './TohRole';
import { Player } from './AmongUsState';
import { defaultLobbySettings } from '../voice/types';

const impostor: TohRole = {
	roleId: 1,
	roleName: 'Assassin',
	isNeutralKiller: false,
	isKiller: true,
	customRoleType: 'Impostor',
};
const neutral: TohRole = {
	roleId: 2,
	roleName: 'Jackal',
	isNeutralKiller: true,
	isKiller: true,
	customRoleType: 'Neutral',
};

describe('TOH4E DLL-derived factions', () => {
	it('accepts a distinct role catalog and selects only killer neutral/animal roles', () => {
		const catalog = [
			{ roleId: 1, roleName: 'Jackal', displayName: 'ジャッカル', customRoleType: 'Neutral', isKiller: true },
			{ roleId: 2, roleName: 'Fox', displayName: 'キツネ', customRoleType: 'Animals', isKiller: true },
			{ roleId: 3, roleName: 'Jester', displayName: 'ジェスター', customRoleType: 'Neutral', isKiller: false },
		];
		expect(isTohRoleCatalog(catalog)).toBeTrue();
		const groups = tohGhostRoleGroups(catalog as Parameters<typeof tohGhostRoleGroups>[0]);
		expect(groups.map((group) => group.roles.map((role) => role.roleName))).toEqual([['Jackal'], ['Fox']]);
		expect(isTohRoleCatalog([catalog[0], { ...catalog[0], roleId: 4 }])).toBeFalse();
		expect(isTohRoleCatalog([{ ...catalog[0], customRoleType: 'Unknown' }])).toBeFalse();
	});

	it('uses per-role hearing with the legacy setting only when no new map was sent', () => {
		const legacy = { ...defaultLobbySettings, tohNeutralKillerHaunting: true };
		expect(canTohHearGhosts(legacy, neutral)).toBeTrue();
		const perRole = { ...legacy, tohGhostRoles: { Jackal: false } };
		expect(tohGhostRoleEnabled(perRole, 'Jackal')).toBeFalse();
		expect(canTohHearGhosts(perRole, neutral)).toBeFalse();
		expect(canTohHearGhosts({ ...perRole, haunting: true }, impostor, true)).toBeTrue();
		expect(canTohHearGhosts({ ...perRole, haunting: true }, impostor, false)).toBeFalse();
		expect(canTohHearGhosts(legacy, { ...neutral, customRoleType: 'Crewmate' })).toBeFalse();
	});

	it('requires both vanilla impostor state and DLL faction (or the host flag)', () => {
		const player = { isImpostor: true, tohRole: neutral } as Player;
		expect(isPlayerImpostor('TOH4E', player)).toBeFalse();
		expect(isPlayerImpostor('NONE', player)).toBeTrue();
		expect(isPlayerImpostor('TOH4E', { ...player, tohRole: impostor })).toBeTrue();
		expect(isPlayerImpostor('TOH4E', { ...player, tohRole: impostor, vanillaIsImpostor: false })).toBeFalse();
		expect(isPlayerImpostor('TOH4E', { ...player, tohRole: undefined, tohImpostor: true })).toBeTrue();
		expect(isPlayerImpostor('TOH4E', { ...player, tohRole: undefined })).toBeFalse();
		expect(withImpostorClassification('TOH4E', player).vanillaIsImpostor).toBeTrue();
	});

	it('rejects duplicate or malformed host impostor entries', () => {
		const entry = { playerId: 1, clientId: 10, isImpostor: true };
		expect(isTohImpostorEntries([entry])).toBeTrue();
		expect(isTohImpostorEntries([entry, { ...entry, clientId: 20 }])).toBeFalse();
		expect(isTohImpostorEntries([{ ...entry, isImpostor: 'true' }])).toBeFalse();
	});
});
