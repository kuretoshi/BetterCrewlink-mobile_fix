import { ILobbySettings } from './ISettings';
import { TohRole, TohRoleDefinition } from './TohRole';

function tohGhostRoleTeams() {
	return [
		{ label: '第三陣営', type: 'Neutral' },
		{ label: 'アニマルズ', type: 'Animals' },
	] as const;
}

export function tohGhostRoleGroups(catalog: readonly TohRoleDefinition[]) {
	return tohGhostRoleTeams().map(({ label, type }) => ({
		label,
		type,
		roles: catalog.filter((role) => role.customRoleType === type && role.isKiller === true),
	}));
}

export function tohGhostRoleEnabled(settings: ILobbySettings, key: string): boolean {
	if (settings.tohGhostRoles !== undefined) return settings.tohGhostRoles[key] === true;
	return settings.tohNeutralKillerHaunting === true;
}

export function isTohImpostor(vanillaIsImpostor: boolean, role: TohRole | undefined): boolean {
	return vanillaIsImpostor === true && role?.customRoleType === 'Impostor';
}

export function canTohHearGhosts(
	settings: ILobbySettings,
	role: TohRole | undefined,
	vanillaIsImpostor = false
): boolean {
	if (!role?.roleName || role.roleName === 'NotAssigned') return false;
	if (role.customRoleType === 'Impostor') return isTohImpostor(vanillaIsImpostor, role) && settings.haunting === true;
	if (role.customRoleType !== 'Neutral' && role.customRoleType !== 'Animals') return false;
	if (role.isKiller !== true) return false;
	return tohGhostRoleEnabled(settings, role.roleName);
}
