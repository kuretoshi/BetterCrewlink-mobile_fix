export interface TohRole {
	roleId: number;
	roleName: string | null;
	isNeutralKiller: boolean | null;
	isKiller: boolean | null;
	opportunistCanKill?: boolean;
}

export function isTohRole(value: unknown): value is TohRole {
	if (!value || typeof value !== 'object') return false;
	const role = value as TohRole;
	return (
		Number.isInteger(role.roleId) &&
		(role.roleName === null || typeof role.roleName === 'string') &&
		(role.isKiller === null || typeof role.isKiller === 'boolean') &&
		(role.isNeutralKiller === null || typeof role.isNeutralKiller === 'boolean') &&
		(role.opportunistCanKill === undefined || typeof role.opportunistCanKill === 'boolean')
	);
}
