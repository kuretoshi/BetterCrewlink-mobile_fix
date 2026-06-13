import { Component, Input, OnInit } from '@angular/core';
import { Player } from '../../services/AmongUsState';
import { SocketElement, PlayerSetting } from '../../services/smallInterfaces';
import { SettingsService } from '../../services/settings.service';

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

	private toAssetId(value: number | string | undefined, emptyValues: string[] = []): number {
		if (value === undefined || value === null) {
			return 0;
		}
		const normalized = `${value}`;
		if (emptyValues.includes(normalized)) {
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

	getHatY(): string {
		return `${(hatOffsets[this.getHatId()] || -33) + 22}%`;
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

	ngOnInit() {}
}
