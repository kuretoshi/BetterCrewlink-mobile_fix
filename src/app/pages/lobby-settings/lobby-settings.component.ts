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
			{ label: '視界連動の聞こえる範囲', value: settings.visionHearing },
			{ label: '壁による音声遮断', value: settings.wallsBlockAudio },
			{ label: '監視カメラ越しに聞く', value: settings.hearThroughCameras },
			{ label: 'インポスターの幽霊音声', value: settings.haunting },
			{ label: 'ベント内のインポスターを聞く', value: settings.hearImpostorsInVents },
			{ label: 'ベント内でインポスター同士が聞ける', value: settings.impostersHearImpostersInvent },
			{ label: '通信妨害で音声を遮断', value: settings.commsSabotage },
			{ label: '幽霊専用モード', value: settings.deadOnly },
			{ label: '会議中のみ音声を有効化', value: settings.meetingGhostOnly },
			{ label: 'インポスター無線', value: settings.impostorRadioEnabled },
			{ label: 'インポスター無線を非公開', value: settings.impostorRadioPrivate },
		];
		const mod = this.gameHelper.cManager.currentGameState?.mod;
		if (mod === 'SUPER_NEW_ROLES') {
			toggles.push(
				{ label: 'SNR ジャンボの声', value: settings.snrJumboVoice },
				{ label: 'ジャッカルの幽霊音声', value: settings.jackalHaunting },
				{ label: 'ジャッカル無線', value: settings.jackalRadioEnabled },
				{ label: 'ジャッカルがベント外を聞ける', value: settings.jackalHearOutsideVents },
				{ label: 'ジャッカルがベント内で話せる', value: settings.jackalTalkInVents },
				{ label: 'サイドキックの幽霊音声', value: settings.sidekickHaunting },
				{ label: 'サイドキックがベント外を聞ける', value: settings.sidekickHearOutsideVents },
				{ label: 'サイドキックがベント内で話せる', value: settings.sidekickTalkInVents }
			);
		} else if (mod === 'NoS') {
			toggles.push(
				{ label: 'NoS 第三陣営キラーの幽霊音声', value: settings.nosNeutralKillerHaunting },
				{ label: 'NoS の音声位置', value: settings.nosVoicePositions }
			);
		} else if (mod === 'TOH4E') {
			toggles.push({ label: 'TOH4E 第三陣営キラーの幽霊音声', value: settings.tohNeutralKillerHaunting });
		}
		toggles.unshift({ label: 'インポスター無線専用モード', value: settings.impostorRadioOnlyMode });
		return toggles;
	}

	maxDistance(): number | undefined {
		return this.lobbySettings?.maxDistance;
	}

	gameStateLabel(): string {
		const state = this.gameHelper.cManager.currentGameState?.gameState;
		switch (state) {
			case GameState.LOBBY:
				return 'ロビー';
			case GameState.TASKS:
				return 'タスク';
			case GameState.DISCUSSION:
				return '会議';
			case GameState.MENU:
				return 'メニュー';
			default:
				return '不明';
		}
	}
}
