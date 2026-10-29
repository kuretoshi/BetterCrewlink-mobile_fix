import AudioController from './AudioController.service';
import { AmongUsState, GameState } from '../common/AmongUsState';
import { ConnectionController } from './ConnectionController.service';
import { SettingsService } from './settings.service';

describe('Tanuki addon audio lifecycle', () => {
	it('allocates no addon graph when absent, stops on removal and starts again on redetection', async () => {
		const context = new AudioContext();
		const state = { mod: 'NoS', gameState: GameState.TASKS, players: [], nosAddonIds: [] } as AmongUsState;
		const connection = { currentGameState: state } as ConnectionController;
		const settings = new SettingsService({} as never, { is: () => false } as never);
		const audio = new AudioController(connection, settings);
		const source = context.createGain();
		const destination = context.createGain();
		source.connect(destination);
		audio['context'] = context;
		audio['masterGain'] = destination;
		audio['inputSource'] = source as never;
		const createAnalyser = spyOn(context, 'createAnalyser').and.callThrough();
		const createProcessor = spyOn(context, 'createScriptProcessor').and.callThrough();
		const disconnect = spyOn(
			source as unknown as { disconnect: (...nodes: AudioNode[]) => void },
			'disconnect'
		).and.callThrough();
		try {
			audio.clearDyingVoicesOutsideGame(state);
			expect(createAnalyser).not.toHaveBeenCalled();
			expect(createProcessor).not.toHaveBeenCalled();
			expect(audio['interviewer']).toBeUndefined();
			state.nosAddonIds = ['tanuki.bcl.roles'];
			audio.clearDyingVoicesOutsideGame(state);
			const analyser = audio['voiceRoleAnalyser'];
			expect(createAnalyser).toHaveBeenCalledTimes(1);
			expect(audio['voiceRoleTimer']).toBeDefined();
			expect(createProcessor).not.toHaveBeenCalled();
			state.nosAddonIds = [];
			audio.clearDyingVoicesOutsideGame(state);
			expect(audio['voiceRoleTimer']).toBeUndefined();
			expect(audio['interviewer']).toBeUndefined();
			expect(disconnect).toHaveBeenCalledWith(analyser);
			expect(disconnect.calls.allArgs().every((args) => args.length === 1)).toBe(true);
			state.nosAddonIds = ['tanuki.bcl.roles'];
			audio.clearDyingVoicesOutsideGame(state);
			expect(createAnalyser).toHaveBeenCalledTimes(2);
		} finally {
			audio.disconnect();
			await context.close();
		}
	});
});
