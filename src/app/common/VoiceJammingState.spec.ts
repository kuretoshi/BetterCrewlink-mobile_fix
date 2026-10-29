import { AmongUsState, GameState, Player } from './AmongUsState';
import { ILobbySettings, ISettings } from './ISettings';
import { applyVoiceJamming, validVoiceJamming, voiceJammingFor, VoiceJammingState } from './VoiceJammingState';
import { selectVoiceEffect } from '../voice/voiceEffectRules';

describe('Voice Jamminger host relay', () => {
	const effect: VoiceJammingState = { playerId: 2, muted: true, lowpass: false, pitch: 1.5 };
	const meeting = {
		mod: 'NoS', nosAddonIds: ['tanuki.bcl.roles'],
		gameState: GameState.DISCUSSION,
		nosVoiceJamming: [effect],
	} as AmongUsState;

	it('mutes the participant ID rather than the host, only during meetings', () => {
		expect(voiceJammingFor(meeting, 2)?.muted).toBeTrue();
		expect(voiceJammingFor(meeting, 1)).toBeUndefined();
		expect(voiceJammingFor({ ...meeting, gameState: GameState.TASKS }, 2)).toBeUndefined();
		expect(voiceJammingFor({ ...meeting, mod: 'NONE' }, 2)).toBeUndefined();
	});
	it('rejects invalid relay fields', () => {
		expect(validVoiceJamming({ ...effect, pitch: 3 })).toBeFalse();
		expect(validVoiceJamming({ ...effect, pitch: NaN })).toBeFalse();
		expect(validVoiceJamming({ ...effect, playerId: 256 })).toBeFalse();
	});
	it('keeps manual silence and applies target-only low-pass without increasing gain', () => {
		const audio = { gain: 0.7, muffle: false } as Parameters<typeof applyVoiceJamming>[2];
		applyVoiceJamming(meeting, 2, audio);
		expect(audio.gain).toBe(0);
		const filtered = { ...meeting, nosVoiceJamming: [{ ...effect, muted: false, lowpass: true }] };
		applyVoiceJamming(filtered, 2, audio);
		expect(audio.gain).toBe(0);
		expect(audio.muffle).toEqual({ type: 'lowpass', frequency: 1200, q: Math.SQRT1_2 });
	});
	it('uses the synchronized speaker pitch and removes it at expiration or meeting end', () => {
		const speaker = { id: 2 } as Player;
		const select = (state: AmongUsState) =>
			selectVoiceEffect(state, {} as ISettings, {} as ILobbySettings, { id: 1 } as Player, speaker, -1);
		expect(select(meeting)?.sourceFilter?.pitch).toBe(1.5);
		expect(select({ ...meeting, nosVoiceJamming: [] })).toBeNull();
		expect(select({ ...meeting, gameState: GameState.LOBBY })).toBeNull();
	});
});
