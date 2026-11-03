import { ChangeDetectorRef } from '@angular/core';
import { AmongUsState, GameState } from '../../common/AmongUsState';
import { GameHelperService } from '../../services/game-helper.service';
import { defaultLobbySettings } from '../../voice/types';
import { LobbySettingsComponent } from './lobby-settings.component';

describe('Gluttony lobby setting display', () => {
	function setup() {
		const state = { mod: 'NoS', gameState: GameState.TASKS, nosAddonIds: ['UchuAddon'] } as AmongUsState;
		const settings = { ...defaultLobbySettings };
		const helper = { cManager: { currentGameState: state, lobbySettings: settings } } as GameHelperService;
		return { state, settings, component: new LobbySettingsComponent(helper, {} as ChangeDetectorRef) };
	}

	it('shows the host-selected mode and defaults old hosts to mute', () => {
		const { settings, component } = setup();
		for (const [mode, label] of [
			['mute', '聞こえない'],
			['quiet', 'かなり小さく・こもった声'],
			['normal', '通常どおり'],
		] as const) {
			settings.nosGluttonySwallowVoice = mode;
			expect(component.gluttonySwallowVoiceLabel).toBe(label);
		}
		settings.nosGluttonySwallowVoice = undefined as unknown as typeof settings.nosGluttonySwallowVoice;
		expect(component.gluttonySwallowVoiceLabel).toBe('聞こえない');
	});

	it('hides the setting outside NoS UchuAddon', () => {
		const { state, component } = setup();
		state.nosAddonIds = [];
		expect(component.gluttonySwallowVoiceLabel).toBeUndefined();
		state.nosAddonIds = ['UchuAddon'];
		state.mod = 'NONE';
		expect(component.gluttonySwallowVoiceLabel).toBeUndefined();
	});
});
