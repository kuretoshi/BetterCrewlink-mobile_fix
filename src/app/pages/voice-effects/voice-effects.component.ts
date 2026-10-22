import { ChangeDetectorRef, Component } from '@angular/core';
import { GameHelperService } from '../../services/game-helper.service';
import { SettingsService } from '../../services/settings.service';
import { AudioSettingsComponent } from '../audio-settings/audio-settings.component';

interface VoiceEffectRow {
	label: string;
	strength: number;
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
		const settings = this.gameHelper.cManager.lobbySettings;
		if (!state || !settings) return [];
		const row = (label: string, configured: number | undefined): VoiceEffectRow => ({
			label,
			strength: Number.isFinite(configured) ? Math.min(100, Math.max(0, configured!)) : 100,
		});
		if (state.mod === 'SUPER_NEW_ROLES')
			return [row('ジャンボ', settings.snrJumboVoiceEffectStrength)];
		if (state.mod !== 'NoS') return [];
		const rows = [
			row('サイズ変化', settings.nosSizeVoiceEffectStrength),
			row('ろくろ首', settings.nosRokurokubiVoiceEffectStrength),
			row('バーサーカー', settings.nosBerserkerVoiceEffectStrength),
		];
		if (state.nosAddonIds?.includes('tanuki.bcl.roles')) {
			rows.push(row('ボイスジャミンガー', settings.nosVoiceJammingEffectStrength));
			rows.push(row('メガホン充電中の声', settings.nosMegaphoneEffectStrength));
			rows.push(row('ビビリ死亡時のエコー', settings.nosBibiriEchoStrength));
		}
		if (state.nosAddonIds?.includes('UchuAddon')) {
			rows.push(row('シトラス', settings.nosCitrusVoiceEffectStrength));
			rows.push(row('虹色スターのエコー', settings.nosRainbowStarEchoStrength));
		}
		return rows;
	}
}
