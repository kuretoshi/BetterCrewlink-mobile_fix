import { ChangeDetectorRef, Component, DoCheck } from '@angular/core';
import { GameHelperService } from '../../services/game-helper.service';
import { SettingsService } from '../../services/settings.service';
import { AudioSettingsComponent } from '../audio-settings/audio-settings.component';
import { VoiceEffectPreviewKind } from '../audio-settings/voiceEffectPreview';
import { getVoiceEffectTuning, VoiceEffectTuning } from '../../common/VoiceEffectTuning';
import { getRokuroVoice, RokuroVoiceSettings } from '../../common/RokuroVoice';

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
export class VoiceEffectsComponent extends AudioSettingsComponent implements DoCheck {
	readonly rokuroAxes = [
		{ key: 'headVolume', label: '顔の音量' }, { key: 'bodyVolume', label: '身体の音量' }, { key: 'bodyEcho', label: '身体のエコー' },
	] as const;
	rokuro() { return getRokuroVoice(this.getSettings().rokuroVoice); }
	onRokuroChange(key: keyof RokuroVoiceSettings, value: number) {
		this.getSettings().rokuroVoice = { ...this.rokuro(), [key]: value };
		this.onVoiceEffectChange();
	}
	readonly tuningAxes = [
		{ key: 'pitch', label: 'ピッチ（低い ← 0: 元の声 → 高い）', minimum: -100 },
		{ key: 'reverb', label: 'リバーブ', minimum: 0 },
		{ key: 'echo', label: 'エコー', minimum: 0 },
	] as const;
	constructor(gameHelper: GameHelperService, changeDetectorRef: ChangeDetectorRef, settings: SettingsService) {
		super(gameHelper, changeDetectorRef, settings);
	}

	get connected(): boolean {
		return Boolean(this.gameHelper.cManager.currentGameState);
	}

	get mod(): string | undefined {
		return this.gameHelper.cManager.currentGameState?.mod;
	}

	ngDoCheck() {
		if (!this.tuningRows().some(effect => effect.key === this.selectedVoiceEffect)) {
			this.selectedVoiceEffect = 'disguise';
			this.stopVoiceEffectTest();
		}
	}

	voiceEffectRows(): VoiceEffectRow[] {
		const state = this.gameHelper.cManager.currentGameState;
		if (!state) return [];
		const row = (key: VoiceEffectPreviewKind, label: string): VoiceEffectRow => ({ key, label });
		if (state.mod === 'SUPER_NEW_ROLES')
			return [row('snrJumbo', 'ジャンボ'), row('snrPush', '突き落とし時の残響')];
		if (state.mod !== 'NoS') return [];
		const rows = [
			row('nosSize', 'サイズ変化'),
			row('nosRokurokubi', 'ろくろ首'),
			row('nosBerserker', 'バーサーカー'),
		];
		if (state.nosAddonIds?.includes('tanuki.bcl.roles')) {
			rows.push(row('nosVoiceJamming', 'ボイスジャミンガー'));
			rows.push(row('nosMegaphone', 'メガホン充電中の声'));
			rows.push(row('nosBibiri', 'ビビリ死亡時のエコー'));
		}
		if (state.nosAddonIds?.includes('UchuAddon')) {
			rows.push(row('nosCitrus', 'シトラス感染時'));
			rows.push(row('nosRainbowStar', '虹色スター'));
		}
		return rows;
	}

	tuningRows(): VoiceEffectRow[] {
		return [{ key: 'disguise', label: '変装・キノコ混乱' }, ...this.voiceEffectRows()];
	}

	tuning(key: VoiceEffectPreviewKind): VoiceEffectTuning {
		return getVoiceEffectTuning(this.getSettings(), key);
	}

	onTuningChange(key: VoiceEffectPreviewKind, axis: keyof VoiceEffectTuning, value: number) {
		this.getSettings().voiceEffectTunings = { ...this.getSettings().voiceEffectTunings,
			[key]: { ...this.tuning(key), [axis]: value } };
		this.onVoiceEffectChange();
	}
}
