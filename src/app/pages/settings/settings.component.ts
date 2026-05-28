import { Component, OnDestroy, OnInit, ChangeDetectorRef } from '@angular/core';
import { GameHelperService } from 'src/app/services/game-helper.service';
import { IDeviceInfo } from 'src/app/services/smallInterfaces';
import { SettingsService } from '../../services/settings.service';
import {
	createVoiceDisguiseEffect,
	disconnectVoiceDisguiseEffect,
	updateVoiceDisguiseEffect,
	VoiceDisguiseEffect,
} from '../../services/voiceEffect';

// const { OverlayPlugin } = Plugins;
// const { BetterCrewlinkNativePlugin } = Plugins;

@Component({
	selector: 'app-settings',
	templateUrl: './settings.component.html',
	styleUrls: ['./settings.component.scss'],
})
export class SettingsComponent implements OnInit, OnDestroy {
	isVoiceEffectTestRunning = false;
	voiceEffectTestEnabled = true;
	voiceEffectTestVolume = 70;
	voiceEffectTestError = '';
	private voiceEffectTestContext?: AudioContext;
	private voiceEffectTestStream?: MediaStream;
	private voiceEffectTestSource?: MediaStreamAudioSourceNode;
	private voiceEffectTestGain?: GainNode;
	private voiceEffectTestEffect?: VoiceDisguiseEffect;
	private voiceEffectTestDeviceId?: string;

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
		if (
			this.isVoiceEffectTestRunning &&
			this.voiceEffectTestDeviceId !== this.getSettings().selectedMicrophone?.deviceId
		) {
			this.startVoiceEffectTest();
			return;
		}
		this.updateVoiceEffectTest();
		console.log('Settings changed:', this.settings.get());
	}

	compareFn(e1: IDeviceInfo, e2: IDeviceInfo): boolean {
		return e1 && e2 ? e1.id === e2.id : false;
	}

	// async test() {
	// 	alert((await BetterCrewlinkNativePlugin.showNotification({ message: 'CUSTOM MESSAGE' })).result);

	// 	//	alert((await OverlayPlugin.echo({value: 'somefilter'})).value);
	// }

	ngOnInit() {
		this.gameHelper.events.on('onChange', () => {
			this.changeDetectorRef.detectChanges();
		});
	}

	ngOnDestroy() {
		this.stopVoiceEffectTest();
	}

	async toggleVoiceEffectTest() {
		if (this.isVoiceEffectTestRunning) {
			this.stopVoiceEffectTest();
			return;
		}

		await this.startVoiceEffectTest();
	}

	async startVoiceEffectTest() {
		this.stopVoiceEffectTest();
		this.voiceEffectTestError = '';

		try {
			const audio: MediaTrackConstraintSet = {
				deviceId: this.getSettings().selectedMicrophone?.deviceId || 'default',
				autoGainControl: false,
				echoCancellation: true,
				noiseSuppression: true,
			};
			this.voiceEffectTestDeviceId = audio.deviceId as string;
			this.voiceEffectTestStream = await navigator.mediaDevices.getUserMedia({ video: false, audio });
			const AudioContextClass = window.webkitAudioContext || window.AudioContext;
			this.voiceEffectTestContext = new AudioContextClass();
			this.voiceEffectTestSource = this.voiceEffectTestContext.createMediaStreamSource(this.voiceEffectTestStream);
			this.voiceEffectTestGain = this.voiceEffectTestContext.createGain();
			this.voiceEffectTestEffect = createVoiceDisguiseEffect(
				this.voiceEffectTestContext,
				this.getSettings().voiceEffectStrength
			);
			this.connectVoiceEffectTest();
			this.isVoiceEffectTestRunning = true;
		} catch {
			this.voiceEffectTestError = 'マイクテストを開始できませんでした';
			this.stopVoiceEffectTest();
		}
	}

	stopVoiceEffectTest() {
		this.isVoiceEffectTestRunning = false;

		this.voiceEffectTestSource?.disconnect();
		this.voiceEffectTestGain?.disconnect();
		if (this.voiceEffectTestEffect) {
			disconnectVoiceDisguiseEffect(this.voiceEffectTestEffect);
		}
		this.voiceEffectTestContext?.close().catch(() => {});
		this.voiceEffectTestStream?.getTracks().forEach((track) => track.stop());

		this.voiceEffectTestContext = undefined;
		this.voiceEffectTestStream = undefined;
		this.voiceEffectTestSource = undefined;
		this.voiceEffectTestGain = undefined;
		this.voiceEffectTestEffect = undefined;
		this.voiceEffectTestDeviceId = undefined;
	}

	updateVoiceEffectTest() {
		if (!this.voiceEffectTestContext || !this.voiceEffectTestSource || !this.voiceEffectTestGain) {
			return;
		}

		if (this.voiceEffectTestEffect) {
			updateVoiceDisguiseEffect(this.voiceEffectTestEffect, this.getSettings().voiceEffectStrength);
		}
		this.connectVoiceEffectTest();
	}

	private connectVoiceEffectTest() {
		if (!this.voiceEffectTestContext || !this.voiceEffectTestSource || !this.voiceEffectTestGain) {
			return;
		}

		this.disconnectVoiceEffectTestPreview();
		this.voiceEffectTestGain.gain.value = this.voiceEffectTestVolume / 100;

		if (
			this.voiceEffectTestEnabled &&
			this.getSettings().voiceEffectStrength > 0 &&
			this.voiceEffectTestEffect
		) {
			this.voiceEffectTestSource.connect(this.voiceEffectTestEffect.input);
			this.voiceEffectTestEffect.output.connect(this.voiceEffectTestGain);
		} else {
			this.voiceEffectTestSource.connect(this.voiceEffectTestGain);
		}

		this.voiceEffectTestGain.connect(this.voiceEffectTestContext.destination);
	}

	private disconnectVoiceEffectTestPreview() {
		try {
			this.voiceEffectTestSource?.disconnect();
		} catch {}
		try {
			this.voiceEffectTestEffect?.output.disconnect();
		} catch {}
		try {
			this.voiceEffectTestGain?.disconnect();
		} catch {}
	}
}
