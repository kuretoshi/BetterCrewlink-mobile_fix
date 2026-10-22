import { ChangeDetectorRef, Component } from '@angular/core';
import { GameHelperService } from '../../services/game-helper.service';
import { SettingsService } from '../../services/settings.service';
import { AudioSettingsComponent } from '../audio-settings/audio-settings.component';
import { VoiceEffectPreviewKind } from '../audio-settings/voiceEffectPreview';

interface VoiceEffectRow {
	key: VoiceEffectPreviewKind;
	label: string;
}

@Component({
	selector: 'app-voice-effects',
	templateUrl: './voice-effects.component.html',
	styleUrls: ['../audio-settings/audio-settings.component.scss'],
	standalone: false,
})
export class VoiceEffectsComponent extends AudioSettingsComponent {
	constructor(gameHelper: GameHelperService, changeDetectorRef: ChangeDetectorRef, settings: SettingsService) {
		super(gameHelper, changeDetectorRef, settings);
	}

	get connected(): boolean {
		return Boolean(this.gameHelper.cManager.currentGameState);
	}

	get mod(): string | undefined {
		return this.gameHelper.cManager.currentGameState?.mod;
	}

	voiceEffectRows(): VoiceEffectRow[] {
		const state = this.gameHelper.cManager.currentGameState;
		if (!state) return [];
		const row = (key: VoiceEffectPreviewKind, label: string): VoiceEffectRow => ({ key, label });
		if (state.mod === 'SUPER_NEW_ROLES')
			return [row('snrJumboVoiceEffectStrength', 'ジャンボ')];
		if (state.mod !== 'NoS') return [];
		const rows = [
			row('nosSizeVoiceEffectStrength', 'サイズ変化'),
			row('nosRokurokubiVoiceEffectStrength', 'ろくろ首'),
			row('nosBerserkerVoiceEffectStrength', 'バーサーカー'),
		];
		if (state.nosAddonIds?.includes('tanuki.bcl.roles')) {
			rows.push(row('nosVoiceJammingEffectStrength', 'ボイスジャミンガー'));
			rows.push(row('nosMegaphoneEffectStrength', 'メガホン充電中の声'));
			rows.push(row('nosBibiriEchoStrength', 'ビビリ死亡時のエコー'));
		}
		if (state.nosAddonIds?.includes('UchuAddon')) {
			rows.push(row('nosCitrusVoiceEffectStrength', 'シトラス感染時の強さ'));
			rows.push(row('nosRainbowStarEchoStrength', '虹色スターのエコー'));
		}
		return rows;
	}

	onStrengthChange(key: VoiceEffectPreviewKind, value: number) {
		this.getSettings()[key] = value;
		this.onVoiceEffectChange();
	}
}
