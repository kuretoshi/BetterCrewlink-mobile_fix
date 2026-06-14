import { Component, Input, OnInit } from '@angular/core';
import { Player } from '../../services/AmongUsState';
import { SocketElement, PlayerSetting } from '../../services/smallInterfaces';
import { SettingsService } from '../../services/settings.service';

const HAT_COLLECTION_URL = 'https://cdn.jsdelivr.net/gh/OhMyGuus/BetterCrewLink-Hats@master/';
const MOBILE_AVATAR_TOP_OFFSET = '14%';
const MOBILE_SKIN_TOP_OFFSET = '22%';
const MOBILE_COSMETIC_Y_OFFSET = '13%';
const MOBILE_COSMETIC_SCALE = 1.08;

interface CosmeticData {
	image?: string;
	back_image?: string;
	top?: string;
	width?: string;
	left?: string;
	multi_color?: boolean;
	mod?: string;
}

interface CosmeticCollection {
	[mod: string]: {
		defaultWidth: string;
		defaultTop: string;
		defaultLeft: string;
		hats: {
			[id: string]: CosmeticData;
		};
	};
}

let cosmeticCollection: CosmeticCollection = {};
let cosmeticRequest: Promise<void> | undefined;
let cosmeticsInitialized = false;

const hatOffsets: { [key in number]: number | undefined } = {
	7: -50,
	21: -50,
	28: -50,
	35: -50,
	77: -50,
	90: -50,
	94: -15,
	103: -50,
};

const coloredHats: number[] = [77, 90];

function initializeCosmetics() {
	if (cosmeticsInitialized || cosmeticRequest) {
		return;
	}

	cosmeticRequest = fetch(`${HAT_COLLECTION_URL}/hats.json`)
		.then((response) => response.json())
		.then((data: CosmeticCollection) => {
			cosmeticCollection = data;
			cosmeticsInitialized = true;
		})
		.catch((error) => {
			console.log('Failed to load cosmetics', error);
			cosmeticRequest = undefined;
		});
}

@Component({
	selector: 'app-avatar',
	templateUrl: './avatar.component.html',
	styleUrls: ['./avatar.component.scss'],
})
export class AvatarComponent implements OnInit {
	backLayerHats =new Set([39, 4, 6, 15, 29, 42, 75, 85, 102, 105, 106, 104, 103]);
	@Input() player: Player;
	@Input() talking: boolean;
	@Input() isDead: boolean = false;
	@Input() settings: PlayerSetting = undefined;
	volumeOpen: boolean;
	readonly MAXVOLUME = 500;
	constructor(private settingsService: SettingsService) {}

	clickable() {
		return this.settings !== undefined;
	}

	private hasDisplayOutfit(): boolean {
		return this.player?.currentOutfit > 0 && this.player?.currentOutfit <= 10;
	}

	private normalizeCosmeticId(value: number | string | undefined, emptyValues: string[] = []): string {
		if (value === undefined || value === null) {
			return '';
		}
		const normalized = `${value}`;
		if (emptyValues.includes(normalized)) {
			return '';
		}
		return normalized;
	}

	private toAssetId(value: number | string | undefined, emptyValues: string[] = []): number {
		const normalized = this.normalizeCosmeticId(value, emptyValues);
		if (!normalized) {
			return 0;
		}
		const directNumber = Number(normalized);
		if (Number.isFinite(directNumber)) {
			return directNumber;
		}
		const trailingNumber = normalized.match(/(\d+)$/);
		return trailingNumber ? Number(trailingNumber[1]) : 0;
	}

	getDisplayName(): string {
		return this.hasDisplayOutfit() && this.player.appearanceName ? this.player.appearanceName : this.player.name;
	}

	getColorId(): number {
		return this.hasDisplayOutfit() && this.player.appearanceColorId >= 0
			? this.player.appearanceColorId
			: this.player.colorId;
	}

	getHatId(): number {
		return this.toAssetId(this.hasDisplayOutfit() ? this.player.appearanceHatId : this.player.hatId, ['hat_NoHat']);
	}

	getSkinId(): number {
		return this.toAssetId(this.hasDisplayOutfit() ? this.player.appearanceSkinId : this.player.skinId, ['skin_None']);
	}

	getVisorId(): string {
		return this.normalizeCosmeticId(this.hasDisplayOutfit() ? this.player.appearanceVisorId : this.player.visorId, [
			'visor_EmptyVisor',
		]);
	}

	private getHatCosmeticId(): string {
		return this.normalizeCosmeticId(this.hasDisplayOutfit() ? this.player.appearanceHatId : this.player.hatId, [
			'hat_NoHat',
		]);
	}

	private getSkinCosmeticId(): string {
		return this.normalizeCosmeticId(this.hasDisplayOutfit() ? this.player.appearanceSkinId : this.player.skinId, [
			'skin_None',
		]);
	}

	private getCosmetic(id: string): CosmeticData | undefined {
		if (!id) {
			return undefined;
		}
		if (!cosmeticsInitialized) {
			initializeCosmetics();
			return undefined;
		}

		for (const mod of ['NONE']) {
			const modCosmetics = cosmeticCollection[mod];
			const cosmetic = modCosmetics?.hats[id];
			if (cosmetic) {
				return {
					...cosmetic,
					top: cosmetic.top ?? modCosmetics.defaultTop,
					width: cosmetic.width ?? modCosmetics.defaultWidth,
					left: cosmetic.left ?? modCosmetics.defaultLeft,
					mod,
				};
			}
		}
		return undefined;
	}

	private getRemoteCosmeticUrl(id: string, back = false): string {
		const cosmetic = this.getCosmetic(id);
		const image = back ? cosmetic?.back_image : cosmetic?.image;
		if (!cosmetic || !image || cosmetic.multi_color) {
			return '';
		}
		return `${HAT_COLLECTION_URL}${cosmetic.mod}/${image}`;
	}

	private getCosmeticStyle(id: string, topOffset = MOBILE_AVATAR_TOP_OFFSET): { [key: string]: string } {
		const cosmetic = this.getCosmetic(id);
		return {
			width: cosmetic?.width || '',
			top: cosmetic?.top ? `calc(${topOffset} + ${cosmetic.top})` : '',
			left: cosmetic?.left || '',
		};
	}

	private centerCosmeticStyle(style: { [key: string]: string }): { [key: string]: string } {
		return {
			...style,
			left: '50%',
			transform: `translate(-50%, ${MOBILE_COSMETIC_Y_OFFSET}) scale(${MOBILE_COSMETIC_SCALE})`,
			transformOrigin: 'top center',
		};
	}

	getRemoteHatUrl(): string {
		return this.getHatId() > 0 ? '' : this.getRemoteCosmeticUrl(this.getHatCosmeticId());
	}

	getRemoteBackHatUrl(): string {
		return this.getHatId() > 0 ? '' : this.getRemoteCosmeticUrl(this.getHatCosmeticId(), true);
	}

	getRemoteSkinUrl(): string {
		return this.getSkinId() > 0 ? '' : this.getRemoteCosmeticUrl(this.getSkinCosmeticId());
	}

	getRemoteVisorUrl(): string {
		return this.getRemoteCosmeticUrl(this.getVisorId());
	}

	getHatStyle(): { [key: string]: string } {
		const style = this.getCosmeticStyle(this.getHatCosmeticId());
		return Object.keys(style).some((key) => !!style[key]) ? this.centerCosmeticStyle(style) : { top: this.getHatY() };
	}

	getSkinStyle(): { [key: string]: string } {
		return this.centerCosmeticStyle(this.getCosmeticStyle(this.getSkinCosmeticId(), MOBILE_SKIN_TOP_OFFSET));
	}

	getVisorStyle(): { [key: string]: string } {
		return this.centerCosmeticStyle(this.getCosmeticStyle(this.getVisorId()));
	}

	getHatY(): string {
		return `${(hatOffsets[this.getHatId()] || -33) + 36}%`;
	}

	getHatImage(): string {
		const hatId = this.getHatId();
		return coloredHats.includes(hatId)
			? `${hatId}-${this.getColorId()}`
			: `${hatId}`;
	}

	openVolume(state = !this.volumeOpen) {
		console.log(this.settings);
		if (!this.settings) {
			return;
		}
		this.volumeOpen = state;
	}

	onVolumeChange() {
		console.log("Volume: ",this.player.nameHash, this.settings )

		if (this.settings) {
			console.log("Volume: ",this.player.nameHash, this.settings )
			this.settingsService.savePlayerSetting(this.player.nameHash, this.settings);
		}
	}

	ngOnInit() {
		initializeCosmetics();
	}
}
