export interface NosRole {
	roleId: number | null;
	roleName: string | null;
	displayName: string | null;
	runtimeClass: string;
	bodyType?: number;
	isBerserking?: boolean;
	isRainbowStar?: boolean | null;
}

export function formatNosRole(role: NosRole): string {
	return `NoS: ${role.displayName || role.roleName || '役職名未取得'}`;
}
