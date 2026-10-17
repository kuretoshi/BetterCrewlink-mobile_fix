import AudioController from './AudioController.service';
import { AmongUsState, GameState, Player } from '../common/AmongUsState';
import { ConnectionController } from './ConnectionController.service';
import { SettingsService } from './settings.service';

describe('Limit Speech microphone restriction', () => {
 function setup() {
  const track = { enabled: true };
  const controller = new AudioController({} as ConnectionController, { get: () => ({ masterVolume: 100 }) } as unknown as SettingsService);
  controller.stream = { getAudioTracks: () => [track] } as unknown as MediaStream;
  const local = { id: 1, disconnected: false } as Player;
  const state = { mod: 'NoS', gameState: GameState.TASKS, nosLimitSpeechMutedPlayerIds: [1] } as AmongUsState;
  return { controller, track, local, state };
 }
 it('cannot be bypassed by manual unmute or impostor radio', () => {
  const { controller, track, local, state } = setup();
  controller.updateMegaphoneState(state, local);
  expect(track.enabled).toBeFalse();
  controller.changeMuteState(false, false);
  controller.setRadioTransmitting(true);
  expect(track.enabled).toBeFalse();
 });
 it('restores ordinary controls after modifier removal and clears between matches', () => {
  const { controller, track, local, state } = setup();
  controller.changeMuteState(false, false);
  controller.updateMegaphoneState(state, local);
  controller.updateMegaphoneState({ ...state, nosLimitSpeechMutedPlayerIds: [] }, local);
  expect(track.enabled).toBeTrue();
  controller.updateMegaphoneState(state, local);
  controller.updateMegaphoneState({ ...state, gameState: GameState.LOBBY }, local);
  expect(track.enabled).toBeTrue();
  controller.changeMuteState(true, false);
  controller.updateMegaphoneState({ ...state, nosLimitSpeechMutedPlayerIds: [] }, local);
  expect(track.enabled).toBeFalse(); // the user's own mute remains intact
 });
});
