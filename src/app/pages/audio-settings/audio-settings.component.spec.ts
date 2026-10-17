import { ChangeDetectorRef } from '@angular/core';
import { AudioSettingsComponent } from './audio-settings.component';
import { GameHelperService } from '../../services/game-helper.service';
import { SettingsService } from '../../services/settings.service';

describe('AudioSettingsComponent microphone test', () => {
	it('uses the selected device and stops a capture that completes after the test was cancelled', async () => {
		let resolveCapture!: (stream: MediaStream) => void;
		const capture = new Promise<MediaStream>((resolve) => { resolveCapture = resolve; });
		const getUserMedia = spyOn(navigator.mediaDevices, 'getUserMedia').and.returnValue(capture);
		const component = new AudioSettingsComponent(
			{} as GameHelperService,
			{} as ChangeDetectorRef,
			{ get: () => ({ selectedMicrophone: { deviceId: 'usb-mic' } }) } as unknown as SettingsService
		);

		const start = component.toggleVoiceEffectTest();
		expect(getUserMedia).toHaveBeenCalledWith(jasmine.objectContaining({
			video: false,
			audio: jasmine.objectContaining({ deviceId: { exact: 'usb-mic' } }),
		}));
		component.stopVoiceEffectTest();
		const stop = jasmine.createSpy('stop');
		resolveCapture({ getTracks: () => [{ stop }] } as unknown as MediaStream);
		await start;
		expect(stop).toHaveBeenCalled();
		expect(component.isVoiceEffectTestRunning).toBeFalse();
		expect(component.voiceEffectTestError).toBe('');
	});
});
