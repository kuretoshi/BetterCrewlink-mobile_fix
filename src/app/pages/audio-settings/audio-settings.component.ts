import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { GameHelperService } from '../../services/game-helper.service';
import { IDeviceInfo } from '../../services/smallInterfaces';
import { SettingsService } from '../../services/settings.service';
import { captureMicrophone } from '../../services/AudioController.service';
import {
	createVoiceDisguiseEffect,
	disconnectVoiceDisguiseEffect,
	updateVoiceDisguiseEffect,
	VoiceDisguiseEffect,
} from '../../services/voiceEffect';

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
	private testContext?: AudioContext;
	private testStream?: MediaStream;
	private testSource?: MediaStreamAudioSourceNode;
	private testGain?: GainNode;
	private testEffect?: VoiceDisguiseEffect;
	private testRequestToken = 0;

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

	/** Capture and processing toggles change the input graph and need a fresh track. */
	onInputProcessingChange(): void {
		this.onSettingsChange();
		void this.gameHelper.changeMicrophone();
	}

	/** Gain and sensitivity values can change without rebuilding the input graph. */
	onAudioSettingChange() {
		this.onSettingsChange();
		this.gameHelper.cManager.audioController.updateMicrophoneSettings(this.settings.get());
	}

	onVoiceEffectChange() {
		this.onSettingsChange();
		if (this.testEffect) updateVoiceDisguiseEffect(this.testEffect, this.getSettings().voiceEffectStrength);
		this.connectTestPreview();
	}

	async toggleVoiceEffectTest() {
		if (this.isVoiceEffectTestRunning) return this.stopVoiceEffectTest();
		this.stopVoiceEffectTest();
		const token = this.testRequestToken;
		this.voiceEffectTestError = '';
		try {
			const settings = this.getSettings();
			const deviceId = settings.selectedMicrophone?.deviceId;
			const { stream, usedDefault } = await captureMicrophone(deviceId, {
					deviceId: deviceId && deviceId.toLowerCase() !== 'default' ? { exact: deviceId } : undefined,
					autoGainControl: false,
					echoCancellation: true,
					noiseSuppression: true,
			});
			if (token !== this.testRequestToken) {
				stream.getTracks().forEach((track) => track.stop());
				return;
			}
			if (usedDefault) {
				settings.selectedMicrophone = { id: 0, label: 'default', deviceId: 'default', kind: 'audioinput' };
				void this.settings.save();
			}
			this.testStream = stream;
			const AudioContextCtor = window.webkitAudioContext || window.AudioContext;
			this.testContext = new AudioContextCtor();
			void this.testContext.resume().catch(() => {
				if (token !== this.testRequestToken) return;
				this.stopVoiceEffectTest();
				this.voiceEffectTestError = 'マイクテストを開始できませんでした';
				this.changeDetectorRef.markForCheck();
			});
			this.testSource = this.testContext.createMediaStreamSource(this.testStream);
			this.testGain = this.testContext.createGain();
			this.testEffect = createVoiceDisguiseEffect(this.testContext, settings.voiceEffectStrength);
			this.isVoiceEffectTestRunning = true;
			this.connectTestPreview();
		} catch {
			if (token !== this.testRequestToken) return;
			this.stopVoiceEffectTest();
			this.voiceEffectTestError = 'マイクテストを開始できませんでした';
		}
	}

	stopVoiceEffectTest() {
		this.testRequestToken++;
		this.isVoiceEffectTestRunning = false;
		try { this.testSource?.disconnect(); } catch { /* already disconnected */ }
		try { this.testGain?.disconnect(); } catch { /* already disconnected */ }
		if (this.testEffect) disconnectVoiceDisguiseEffect(this.testEffect);
		void this.testContext?.close();
		this.testStream?.getTracks().forEach((track) => track.stop());
		this.testContext = undefined;
		this.testStream = undefined;
		this.testSource = undefined;
		this.testGain = undefined;
		this.testEffect = undefined;
	}

	private connectTestPreview() {
		if (!this.testContext || !this.testSource || !this.testGain || !this.testEffect) return;
		try { this.testSource.disconnect(); } catch { /* already disconnected */ }
		try { this.testEffect.output.disconnect(); } catch { /* already disconnected */ }
		try { this.testGain.disconnect(); } catch { /* already disconnected */ }
		this.testGain.gain.value = this.voiceEffectTestVolume / 100;
		if (this.voiceEffectTestEnabled && this.getSettings().voiceEffectStrength > 0) {
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
		return e1.deviceId === e2.deviceId;
	}

	ngOnInit() {
		this.gameHelper.events.on('onChange', this.onChangeListener);
	}

	ngOnDestroy() {
		this.gameHelper.events.off('onChange', this.onChangeListener);
		this.stopVoiceEffectTest();
	}
}
