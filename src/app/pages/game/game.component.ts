import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy, HostListener } from '@angular/core';
import { GameHelperService } from '../../services/game-helper.service';
import { IDeviceInfo } from '../../services/smallInterfaces';
import { GameState } from '../../common/AmongUsState';
import { ModsType } from '../../common/Mods';

@Component({
	selector: 'app-game',
	templateUrl: './game.component.html',
	styleUrls: ['./game.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: false,
})
export class GameComponent implements OnInit, OnDestroy {
	private onChangeListener = () => this.changeDetectorRef.detectChanges();

	constructor(
		public gameHelper: GameHelperService,
		private changeDetectorRef: ChangeDetectorRef
	) {}

	compareFn(e1: IDeviceInfo, e2: IDeviceInfo): boolean {
		return e1 && e2 ? e1.id === e2.id : false;
	}

	getPlayers() {
		return this.gameHelper.voiceController.getRenderablePlayers();
	}

	/** The lobby's mod, forwarded to each avatar so mod-specific cosmetics resolve. */
	getMod(): ModsType {
		return this.gameHelper.cManager.currentGameState?.mod ?? 'NONE';
	}

	isLobby(): boolean {
		return this.gameHelper.cManager.currentGameState?.gameState === GameState.LOBBY;
	}

	/** Desktop 3.2.9: the host PC's NoS reader failure, which also stops NoS-driven audio rules. */
	getNosReadFailure(): string | undefined {
		const state = this.gameHelper.cManager.currentGameState;
		if (state?.mod !== 'NoS' || !state.nosReadStatus?.failed) return undefined;
		return state.nosReadStatus.message || 'NoSデータを取得できません';
	}

	canUseImpostorRadio(kind = 0): boolean {
		return this.gameHelper.voiceController.canTransmitRadio(kind);
	}

	startRadio(kind = 0): void {
		this.gameHelper.voiceController.applyImpostorRadio(true, kind);
	}
	stopRadio(kind?: number): void {
		if (kind === undefined) this.gameHelper.voiceController.releaseRadio();
		else this.gameHelper.voiceController.applyImpostorRadio(false, kind);
	}

	// Mirrors desktop's releaseHeldKeys(): a held transmit button must not stay "pressed" forever
	// if the app loses focus (backgrounded, notification shade, app switch, incoming call) while held.
	@HostListener('window:blur')
	onWindowBlur(): void {
		this.stopRadio();
	}

	@HostListener('document:visibilitychange')
	onVisibilityChange(): void {
		if (document.hidden) {
			this.stopRadio();
		}
	}

	ngOnInit() {
		console.log('ngOninit');
		this.gameHelper.events.on('onChange', this.onChangeListener);
	}

	ngOnDestroy() {
		this.gameHelper.events.off('onChange', this.onChangeListener);
		this.stopRadio();
	}
}
