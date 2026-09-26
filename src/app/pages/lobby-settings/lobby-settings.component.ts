import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { GameHelperService } from '../../services/game-helper.service';
import { ILobbySettings } from '../../common/ISettings';
import { GameState } from '../../common/AmongUsState';

interface LobbyToggle {
	label: string;
	value: boolean;
}

@Component({
	selector: 'app-lobby-settings',
	templateUrl: './lobby-settings.component.html',
	styleUrls: ['./lobby-settings.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: false,
})
export class LobbySettingsComponent implements OnInit, OnDestroy {
	private onChangeListener = () => this.changeDetectorRef.detectChanges();

	constructor(
		public gameHelper: GameHelperService,
		private changeDetectorRef: ChangeDetectorRef
	) {}

	ngOnInit() {
		this.gameHelper.events.on('onChange', this.onChangeListener);
	}

	ngOnDestroy() {
		this.gameHelper.events.off('onChange', this.onChangeListener);
	}

	get lobbySettings(): ILobbySettings | undefined {
		return this.gameHelper.cManager.currentGameState ? this.gameHelper.cManager.lobbySettings : undefined;
	}

	/** Active PC host's in-game name, when the game state lets us resolve it. */
	get activeHostName(): string | undefined {
		const state = this.gameHelper.cManager.currentGameState;
		if (!state) return undefined;
		const hostPlayer = state.players.find((player) => player.clientId === state.hostId);
		return hostPlayer?.name;
	}

	/** The mobile user's matched player is the Among Us game host - mobile can't own lobby settings. */
	get localPlayerIsGameHost(): boolean {
		const state = this.gameHelper.cManager.currentGameState;
		const me = this.gameHelper.cManager.localPLayer;
		return Boolean(state && me && state.hostId === me.clientId);
	}

	/** True once connected and receiving game data; the page is read-only before that. */
	get connected(): boolean {
		return Boolean(this.gameHelper.cManager.currentGameState);
	}

	toggles(): LobbyToggle[] {
		const settings = this.lobbySettings;
		if (!settings) return [];
		const toggles = [
			{ label: 'Vision hearing', value: settings.visionHearing },
			{ label: 'Walls block audio', value: settings.wallsBlockAudio },
			{ label: 'Hear through cameras', value: settings.hearThroughCameras },
			{ label: 'Haunting', value: settings.haunting },
			{ label: 'Hear impostors in vents', value: settings.hearImpostorsInVents },
			{ label: 'Impostors hear each other in vents', value: settings.impostersHearImpostersInvent },
			{ label: 'Comms sabotage', value: settings.commsSabotage },
			{ label: 'Ghost-only mode', value: settings.deadOnly },
			{ label: 'Meetings-only mode', value: settings.meetingGhostOnly },
			{ label: 'Impostor radio', value: settings.impostorRadioEnabled },
			{ label: 'Private impostor radio', value: settings.impostorRadioPrivate },
		];
		const mod = this.gameHelper.cManager.currentGameState?.mod;
		if (mod === 'SUPER_NEW_ROLES') {
			toggles.push(
				{ label: 'SNR Jumbo voice', value: settings.snrJumboVoice },
				{ label: 'Jackal haunting', value: settings.jackalHaunting },
				{ label: 'Jackal radio', value: settings.jackalRadioEnabled },
				{ label: 'Jackal hears outside vents', value: settings.jackalHearOutsideVents },
				{ label: 'Jackal talks in vents', value: settings.jackalTalkInVents },
				{ label: 'Sidekick haunting', value: settings.sidekickHaunting },
				{ label: 'Sidekick hears outside vents', value: settings.sidekickHearOutsideVents },
				{ label: 'Sidekick talks in vents', value: settings.sidekickTalkInVents }
			);
		} else if (mod === 'NoS') {
			toggles.push(
				{ label: 'NoS Neutral Killer haunting', value: settings.nosNeutralKillerHaunting },
				{ label: 'NoS voice positions', value: settings.nosVoicePositions }
			);
		} else if (mod === 'TOH4E') {
			toggles.push({ label: 'TOH4E Neutral Killer haunting', value: settings.tohNeutralKillerHaunting });
		}
		toggles.unshift({ label: 'Impostor radio only mode', value: settings.impostorRadioOnlyMode });
		return toggles;
	}

	maxDistance(): number | undefined {
		return this.lobbySettings?.maxDistance;
	}

	gameStateLabel(): string {
		const state = this.gameHelper.cManager.currentGameState?.gameState;
		switch (state) {
			case GameState.LOBBY:
				return 'Lobby';
			case GameState.TASKS:
				return 'Tasks';
			case GameState.DISCUSSION:
				return 'Discussion';
			case GameState.MENU:
				return 'Menu';
			default:
				return 'Unknown';
		}
	}
}
