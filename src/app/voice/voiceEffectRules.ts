import { AmongUsState, GameState, Player } from '../common/AmongUsState';
import { ILobbySettings, ISettings } from '../common/ISettings';
import { hasSnrJumbo, isSnrJackalTeam } from '../common/SnrRole';
import type { PitchShiftDirection } from '../services/voiceEffect';

export interface VoiceEffectSetting {
	strength: number;
	direction?: PitchShiftDirection;
	formantScale?: number;
	jumbo?: boolean;
	squash?: number;
	toneRate?: number;
	directPitch?: boolean;
}

export function selectVoiceEffect(
	state: AmongUsState,
	settings: ISettings,
	lobby: ILobbySettings,
	me: Player,
	other: Player,
	radioClientId: number,
	radioClientIds?: readonly number[]
): VoiceEffectSetting | null {
	if (state.gameState !== GameState.TASKS || other.isDead || other.disconnected || other.bugged || other.isDummy)
		return null;
	if (state.mod === 'NoS' && lobby.nosSizeVoiceEffect !== false && other.nosPlayer) {
		const { bodyRateX, bodyRateY } = other.nosPlayer;
		if (
			bodyRateX !== undefined &&
			bodyRateY !== undefined &&
			Number.isFinite(bodyRateX) &&
			Number.isFinite(bodyRateY) &&
			bodyRateX > 0 &&
			bodyRateY >= 0
		) {
			if (bodyRateX >= 0.98 && bodyRateX <= 1.02 && bodyRateY < 0.98) {
				const squash = Math.min(1, 1 - bodyRateY);
				return { strength: squash * 100, direction: 'up', squash };
			}
			if (bodyRateY === 0) return null;
			if (bodyRateY < 0.98)
				return {
					strength: Math.min(100, (Math.log(1 / bodyRateY) / Math.log(10)) * 100),
					direction: 'up',
					toneRate: bodyRateX,
					directPitch: true,
				};
			if (bodyRateY > 1.02)
				return {
					strength: Math.min(100, (Math.log(bodyRateY) / Math.log(5)) * 100),
					direction: 'down',
					jumbo: true,
					toneRate: bodyRateX,
				};
			if (bodyRateX < 0.98 || bodyRateX > 1.02) return { strength: 0, toneRate: bodyRateX };
		}
	}
	if (state.mod === 'SUPER_NEW_ROLES' && lobby.snrJumboVoice && hasSnrJumbo(other.snrRole)) {
		const size = other.snrRole?.jumbo;
		if (
			size &&
			Number.isFinite(size.currentSize) &&
			Number.isFinite(size.maxSize) &&
			size.maxSize > 0 &&
			size.currentSize > 0
		)
			return { strength: Math.min(100, (size.currentSize / size.maxSize) * 100), direction: 'down', jumbo: true };
		return null;
	}
	if (lobby.voiceEffectEnabled === false || me.isDead) return null;
	const onRadio = radioClientIds?.includes(other.clientId) ?? other.clientId === radioClientId;
	if (
		onRadio &&
		((me.isImpostor && other.isImpostor && (lobby.impostorRadioEnabled || lobby.impostorRadioOnlyMode)) ||
			(state.mod === 'SUPER_NEW_ROLES' &&
				lobby.jackalRadioEnabled &&
				!lobby.impostorRadioOnlyMode &&
				isSnrJackalTeam(me.snrRole) &&
				isSnrJackalTeam(other.snrRole)))
	)
		return null;
	const disguised =
		Boolean(state.mushroomMixupSabotaged || state.camouflaged || state.mixupSabotaged) ||
		(other.appearanceName !== undefined && (other.appearanceName || other.name) !== other.name);
	return settings.voiceEffectStrength > 0 && disguised ? { strength: settings.voiceEffectStrength } : null;
}
