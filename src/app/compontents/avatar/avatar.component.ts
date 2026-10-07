import { Component, Input, ChangeDetectionStrategy, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import { Player } from '../../common/AmongUsState';
import { ModsType } from '../../common/Mods';
import { PlayerConnectionState, PlayerSetting } from '../../services/smallInterfaces';
import { SettingsService } from '../../services/settings.service';
import { CosmeticRender, CosmeticsService, CosmeticType } from '../../services/cosmetics.service';
import { playerSettingsKey } from '../../services/voice-controller.service';
import { MOBILE_PLAYERCOLORS } from '../../common/playerColors';
import { findNosColorIndex, findPaletteColorIndex } from '../../common/NosSnapshot';
import { nosCosmeticAssets } from '../../lib/nosCosmeticAssets';

@Component({
	selector: 'app-avatar',
	templateUrl: './avatar.component.html',
	styleUrls: ['./avatar.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: false,
})
export class AvatarComponent implements OnDestroy {
	@Input() player: Player;
	@Input() talking: boolean;
	@Input() isDead = false;
	@Input() settings: PlayerSetting = undefined;
	/** Desktop-parity presence badge: Wi-Fi off when disconnected, link off when there's no voice. */
	@Input() connectionState: PlayerConnectionState = 'connected';
	/** The lobby's mod, so mod-specific hats/skins/visors resolve like they do on desktop. */
	@Input() mod: ModsType = 'NONE';
	/** NoS lobby outfits are available before its round PlayerData is published. */
	@Input() isLobby = false;
	volumeOpen: boolean;
	readonly MAXVOLUME = 500;
	private readonly versionSubscription: Subscription;
	private readonly nosSubscription: Subscription;

	constructor(
		private settingsService: SettingsService,
		private cosmetics: CosmeticsService,
		private changeDetectorRef: ChangeDetectorRef
	) {
		// hats.json (and any recoloured sprite) arrives asynchronously, after this component was
		// first checked; re-check on each version bump so OnPush avatars pick the cosmetics up.
		this.versionSubscription = this.cosmetics.version$.subscribe(() => this.changeDetectorRef.markForCheck());
		this.nosSubscription = nosCosmeticAssets.version$.subscribe(() => this.changeDetectorRef.markForCheck());
		this.cosmetics.initializeHats();
	}

	ngOnDestroy(): void {
		this.versionSubscription.unsubscribe();
		this.nosSubscription.unsubscribe();
	}

	clickable() {
		return this.settings !== undefined;
	}

	/** Same two badges (and colors) as desktop Avatar.tsx; `connected` renders no badge. */
	connectionIcon(): string | undefined {
		if (this.connectionState === 'disconnected') return 'assets/icons/wifi-off.svg';
		if (this.connectionState === 'novoice') return 'assets/icons/link-off.svg';
		return undefined;
	}

	/**
	 * Body sprite, with a fallback for out-of-range colors so the avatar never renders broken.
	 * Desktop generates these from the game's colour table; mobile bundles pre-rendered ones.
	 */
	getBodyImage(): string {
		const colorId = this.getDisplayColorId();
		const alive = colorId >= 0 && colorId <= 17 ? colorId : 0;
		return `assets/avatar/players/${alive}-${this.isDead ? 'dead' : 'alive'}.png`;
	}

	/** NoS lobby colour wins before round PlayerData; in-game RGB wins during a round. */
	getDisplayColorId(): number {
		if (this.mod === 'NoS') {
			if (this.isLobby) {
				const lobbyColor = findPaletteColorIndex(this.player?.nosLobbyColor, MOBILE_PLAYERCOLORS);
				if (lobbyColor >= 0) return lobbyColor;
				const appearanceColor = this.player?.appearanceColorId;
				if (Number.isInteger(appearanceColor) && appearanceColor >= 0 && appearanceColor < MOBILE_PLAYERCOLORS.length)
					return appearanceColor;
			} else {
				const nosColor = findNosColorIndex(this.player?.nosPlayer, MOBILE_PLAYERCOLORS);
				if (nosColor >= 0) return nosColor;
			}
		}
		if (
			this.player?.currentOutfit !== undefined &&
			this.player.currentOutfit > 0 &&
			this.player.currentOutfit <= 10 &&
			Number.isInteger(this.player.appearanceColorId) &&
			(this.player.appearanceColorId as number) >= 0
		) {
			return this.player.appearanceColorId as number;
		}
		return Number(this.player?.colorId);
	}

	/** Last-resort: hide the body instead of showing a broken-image glyph (e.g. a colorId that isn't a number). */
	onBodyImageError(event: Event): void {
		(event.currentTarget as HTMLImageElement).style.display = 'none';
	}

	getHat(): CosmeticRender | undefined {
		return this.resolveCosmetic(CosmeticType.hat, this.getCosmeticId('hat'));
	}

	getHatBack(): CosmeticRender | undefined {
		return this.resolveCosmetic(CosmeticType.hatBack, this.getCosmeticId('hat'));
	}

	getVisor(): CosmeticRender | undefined {
		return this.resolveCosmetic(CosmeticType.visor, this.getCosmeticId('visor'));
	}

	getSkin(): CosmeticRender | undefined {
		return this.resolveCosmetic(CosmeticType.skin, this.getCosmeticId('skin'));
	}

	/**
	 * In a NoS lobby, use the live outfit IDs even before round PlayerData exists. During a
	 * round, use NoS' published names. Nullish fallback preserves an empty ID on removal.
	 */
	private getCosmeticId(kind: 'hat' | 'skin' | 'visor'): string | undefined {
		const gameId = kind === 'hat' ? this.player?.hatId : kind === 'skin' ? this.player?.skinId : this.player?.visorId;
		if (this.mod !== 'NoS') return gameId;
		if (this.isLobby) {
			const appearanceId =
				kind === 'hat'
					? this.player?.appearanceHatId
					: kind === 'skin'
						? this.player?.appearanceSkinId
						: this.player?.appearanceVisorId;
			return appearanceId ?? gameId;
		}
		return this.player?.nosPlayer?.[kind]?.name ?? gameId;
	}

	/** Dead players lose their cosmetics, exactly like desktop's `display: isAlive ? ...`. */
	private resolveCosmetic(type: CosmeticType, id: string | undefined): CosmeticRender | undefined {
		if (this.isDead || !this.player) {
			return undefined;
		}
		// Resolve only PNGs received from the selected desktop host.
		if (this.mod === 'NoS') {
			const part =
				type === CosmeticType.hat
					? 'hat'
					: type === CosmeticType.hatBack
						? 'hatBack'
						: type === CosmeticType.skin
							? 'skin'
							: 'visor';
			const received = nosCosmeticAssets.get(this.player.nosCosmetics?.[part]);
			if (received)
				return {
					src: received,
					top: '-52%',
					left: '-18px',
					width: '140%',
					zIndex: type === CosmeticType.hatBack ? 1 : type === CosmeticType.hat ? 4 : 3,
				};
			const localImage =
				type === CosmeticType.hat || type === CosmeticType.hatBack
					? this.player.nosCosmetics?.hat || this.player.nosCosmetics?.hatBack
					: type === CosmeticType.skin
						? this.player.nosCosmetics?.skin
						: this.player.nosCosmetics?.visor;
			if (localImage) return undefined;
		}
		return this.cosmetics.getCosmeticRender(this.getDisplayColorId(), type, id, this.mod ?? 'NONE');
	}

	getBodyMask(): string | undefined {
		const png =
			!this.isDead && this.mod === 'NoS' ? nosCosmeticAssets.get(this.player?.nosCosmetics?.bodyMask) : undefined;
		return png ? `url("${png}")` : undefined;
	}

	openVolume(state = !this.volumeOpen) {
		if (!this.settings) {
			return;
		}
		this.volumeOpen = state;
	}

	onVolumeChange() {
		if (this.settings) {
			this.settingsService.savePlayerSetting(playerSettingsKey(this.player), this.settings);
		}
	}

	onMuteToggle() {
		if (!this.settings) return;
		this.settings.isMuted = !this.settings.isMuted;
		this.settingsService.savePlayerSetting(playerSettingsKey(this.player), this.settings);
	}
}
