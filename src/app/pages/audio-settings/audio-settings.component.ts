import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { GameHelperService } from '../../services/game-helper.service';
import { IDeviceInfo } from '../../services/smallInterfaces';
import { SettingsService } from '../../services/settings.service';
import { createVoiceEffectPreview, VoiceEffectPreview, VoiceEffectPreviewKind } from './voiceEffectPreview';

@Component({
	selector: 'app-audio-settings',
	templateUrl: './audio-settings.component.html',
	styleUrls: ['./audio-settings.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: false,
})
export class AudioSettingsComponent implements OnInit, OnDestroy {
	private onChangeListener = () => this.changeDetectorRef.detectChanges();
	isVoiceEffectTestRunning = false;
	voiceEffectTestEnabled = true;
	voiceEffectTestVolume = 70;
	voiceEffectTestError = '';
	selectedVoiceEffect: VoiceEffectPreviewKind = 'voiceEffectStrength';
	private testContext?: AudioContext;
	private testStream?: MediaStream;
	private testSource?: MediaStreamAudioSourceNode;
	private testGain?: GainNode;
	private testEffect?: VoiceEffectPreview;
	private testEffectKind?: VoiceEffectPreviewKind;
	private testGeneration = 0;

	constructor(
		public gameHelper: GameHelperService,
		private changeDetectorRef: ChangeDetectorRef,
		private settings: SettingsService
	) {}

	getSettings() {
		return this.settings.get();
	}

	onSettingsChange() {
		this.settings.save();
	}

	/** Audio-processing settings can take effect live on an already-open mic chain. */
	onAudioSettingChange() {
		this.onSettingsChange();
		this.gameHelper.cManager.audioController.updateMicrophoneSettings(this.settings.get());
	}

	onVoiceEffectChange() {
		this.onSettingsChange();
		if (this.testEffect && this.testEffectKind !== this.selectedVoiceEffect) {
			this.stopVoiceEffectTest();
			void this.toggleVoiceEffectTest();
			return;
		}
		this.testEffect?.update(this.getSettings()[this.selectedVoiceEffect] ?? 100);
		this.connectTestPreview();
	}

	async toggleVoiceEffectTest() {
		if (this.isVoiceEffectTestRunning) return this.stopVoiceEffectTest();
		this.stopVoiceEffectTest();
		const generation = this.testGeneration;
		this.voiceEffectTestError = '';
		try {
			const settings = this.getSettings();
			const stream = await navigator.mediaDevices.getUserMedia({
				video: false,
				audio: {
					deviceId: settings.selectedMicrophone?.deviceId || 'default',
					autoGainControl: false,
					echoCancellation: true,
					noiseSuppression: true,
				},
			});
			if (generation !== this.testGeneration) {
				stream.getTracks().forEach((track) => track.stop());
				return;
			}
			const AudioContextCtor = window.webkitAudioContext || window.AudioContext;
			const context = new AudioContextCtor();
			this.testStream = stream;
			this.testContext = context;
			this.testSource = context.createMediaStreamSource(stream);
			this.testGain = context.createGain();
			const effect = await createVoiceEffectPreview(context, this.selectedVoiceEffect, settings[this.selectedVoiceEffect] ?? 100);
			if (generation !== this.testGeneration) {
				effect.dispose();
				return;
			}
			this.testEffect = effect;
			this.testEffectKind = this.selectedVoiceEffect;
			this.isVoiceEffectTestRunning = true;
			this.connectTestPreview();
		} catch {
			if (generation !== this.testGeneration) return;
			this.stopVoiceEffectTest();
			this.voiceEffectTestError = 'マイクテストを開始できませんでした';
		}
	}

	stopVoiceEffectTest() {
		this.testGeneration++;
		this.isVoiceEffectTestRunning = false;
		try { this.testSource?.disconnect(); } catch { /* already disconnected */ }
		try { this.testGain?.disconnect(); } catch { /* already disconnected */ }
		this.testEffect?.dispose();
		void this.testContext?.close();
		this.testStream?.getTracks().forEach((track) => track.stop());
		this.testContext = undefined;
		this.testStream = undefined;
		this.testSource = undefined;
		this.testGain = undefined;
		this.testEffect = undefined;
		this.testEffectKind = undefined;
	}

	private connectTestPreview() {
		if (!this.testContext || !this.testSource || !this.testGain || !this.testEffect) return;
		try { this.testSource.disconnect(); } catch { /* already disconnected */ }
		try { this.testEffect.output.disconnect(); } catch { /* already disconnected */ }
		try { this.testGain.disconnect(); } catch { /* already disconnected */ }
		this.testGain.gain.value = this.voiceEffectTestVolume / 100;
		if (this.voiceEffectTestEnabled && this.getSettings()[this.selectedVoiceEffect] > 0) {
			this.testSource.connect(this.testEffect.input);
			this.testEffect.output.connect(this.testGain);
		} else {
			this.testSource.connect(this.testGain);
		}
		this.testGain.connect(this.testContext.destination);
	}

	onSpeakerChange() {
		this.onSettingsChange();
		this.gameHelper.cManager.audioController.setSpeaker(this.settings.get().selectedSpeaker?.deviceId);
	}

	compareFn(e1: IDeviceInfo | undefined, e2: IDeviceInfo | undefined): boolean {
		if (!e1 || !e2) return e1 === e2;
		return e1.id === e2.id;
	}

	ngOnInit() {
		this.gameHelper.events.on('onChange', this.onChangeListener);
	}

	ngOnDestroy() {
		this.gameHelper.events.off('onChange', this.onChangeListener);
		this.stopVoiceEffectTest();
	}
}
