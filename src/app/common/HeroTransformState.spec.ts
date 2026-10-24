import { GameState, AmongUsState, Player } from './AmongUsState';
import { ISettings, ILobbySettings } from './ISettings';
import { isHeroTransformed, validHeroTransform } from './HeroTransformState';
import { selectVoiceEffect } from '../voice/voiceEffectRules';

describe('Hero transformation costume voice', () => {
	const me = { id: 1, name: 'listener' } as Player;
	const speaker = { id: 2, name: 'original', appearanceName: 'hero' } as Player;
	const state = { mod: 'NoS', gameState: GameState.TASKS, players: [me, speaker] } as AmongUsState;
	const effect = (game: AmongUsState) => selectVoiceEffect(game,
		{ voiceEffectStrength: 100 } as ISettings, { voiceEffectEnabled: true } as ILobbySettings, me, speaker, -1);
	it('keeps both transformed costumes in the normal voice', () => {
		for (const kind of ['super', 'evil'] as const) {
			const game = { ...state, nosHeroTransforms: [{ playerId: 2, kind }] };
			expect(isHeroTransformed(game, 2)).toBeTrue();
			expect(effect(game)).toBeNull();
		}
	});
	it('keeps ordinary disguise effects and releases the exception when transformation ends', () => {
		expect(effect({ ...state, nosHeroTransforms: [] })?.strength).toBe(100);
		expect(effect({ ...state, nosHeroTransforms: [{ playerId: 3, kind: 'super' }] })?.strength).toBe(100);
	});
	it('ignores unrelated roles and phases', () => {
		expect(validHeroTransform({ playerId: 2, kind: 'other' })).toBeFalse();
		expect(isHeroTransformed({ ...state, gameState: GameState.DISCUSSION,
			nosHeroTransforms: [{ playerId: 2, kind: 'super' }] }, 2)).toBeFalse();
	});
});
