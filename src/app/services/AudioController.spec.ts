import AudioController, { captureMicrophone, closeMicrophoneGate, microphoneConstraints, openMicrophoneGate } from './AudioController.service';
import { ConnectionController } from './ConnectionController.service';
import { SettingsService } from './settings.service';

describe('AudioController output routing', () => {
	it('keeps audio initialization working when the platform cannot select an output device', () => {
		const controller = new AudioController({} as ConnectionController, {} as SettingsService);
		const element = document.createElement('audio');
		Object.defineProperty(element, 'setSinkId', { value: undefined });
		Object.assign(controller, { masterElement: element });
		expect(() => controller.setSpeaker('default')).not.toThrow();
		expect(() => controller.setSpeaker('previously-selected-headset')).not.toThrow();
	});

	it('continues routing to the selected headset on platforms that support it', () => {
		const controller = new AudioController({} as ConnectionController, {} as SettingsService);
		const setSinkId = jasmine.createSpy('setSinkId').and.returnValue(Promise.resolve());
		Object.assign(controller, { masterElement: { setSinkId } });
		controller.setSpeaker('headset');
		expect(setSinkId).toHaveBeenCalledWith('headset');
		controller.setSpeaker('default');
		expect(setSinkId).toHaveBeenCalledWith('');
	});
});

describe('3.2.32 microphone capture', () => {
	it('requests the selected device exactly and leaves the system default unrestricted', () => {
		const settings = { autoGainControl: false, echoCancellation: true, noiseSuppression: true };
		expect(microphoneConstraints('usb-mic', settings)).toEqual({
			deviceId: { exact: 'usb-mic' },
			channelCount: 2,
			autoGainControl: false,
			echoCancellation: true,
			noiseSuppression: true,
		});
		expect(microphoneConstraints('default', settings).deviceId).toBeUndefined();
	});

	it('ignores a microphone request that finishes after a newer selection', async () => {
		const controller = new AudioController({} as ConnectionController, {} as SettingsService);
		const pending: (() => void)[] = [];
		const track = { id: 'new-mic' } as MediaStreamTrack;
		const internals = controller as unknown as {
			context: AudioContext;
			stream: MediaStream;
			teardownInputChain: () => void;
			createInputChain: (token: number, deviceId: string) => Promise<void>;
		};
		internals.context = {} as AudioContext;
		internals.stream = { getAudioTracks: () => [track] } as MediaStream;
		internals.teardownInputChain = jasmine.createSpy('teardownInputChain');
		internals.createInputChain = () => new Promise<void>((resolve) => pending.push(resolve));

		const obsolete = controller.restartInput('old-mic');
		const selected = controller.restartInput('new-mic');
		pending[1]();
		expect(await selected).toBe(track);
		pending[0]();
		expect(await obsolete).toBeUndefined();
	});

	it('stops a microphone stream granted after disconnect', async () => {
		let resolveCapture!: (stream: MediaStream) => void;
		spyOn(navigator.mediaDevices, 'getUserMedia').and.returnValue(
			new Promise<MediaStream>((resolve) => { resolveCapture = resolve; })
		);
		const settings = { get: () => ({ autoGainControl: false, echoCancellation: true, noiseSuppression: true }) };
		const controller = new AudioController({} as ConnectionController, settings as unknown as SettingsService);
		const internals = controller as unknown as {
			context: AudioContext;
			inputToken: number;
			createInputChain: (token: number, deviceId: string) => Promise<void>;
		};
		internals.context = {} as AudioContext;
		internals.inputToken = 1;
		const pending = internals.createInputChain(1, 'usb-mic');
		controller.disconnect();
		const stop = jasmine.createSpy('stop');
		resolveCapture({ getTracks: () => [{ stop }] } as unknown as MediaStream);
		await pending;
		expect(stop).toHaveBeenCalled();
		expect(controller.stream).toBeUndefined();
	});

	it('releases the speech gate over 20 ms instead of cutting it abruptly', () => {
		const gain = {
			value: 0.8,
			cancelScheduledValues: jasmine.createSpy('cancelScheduledValues'),
			setValueAtTime: jasmine.createSpy('setValueAtTime'),
			linearRampToValueAtTime: jasmine.createSpy('linearRampToValueAtTime'),
		};
		const node = { context: { currentTime: 4 }, gain } as unknown as GainNode;
		closeMicrophoneGate(node);
		expect(gain.cancelScheduledValues).toHaveBeenCalledWith(4);
		expect(gain.setValueAtTime).toHaveBeenCalledWith(0.8, 4);
		expect(gain.linearRampToValueAtTime).toHaveBeenCalledWith(0, 4.02);
		openMicrophoneGate(node, 0.6);
		expect(gain.setValueAtTime).toHaveBeenCalledWith(0.6, 4);
	});
});

describe('3.2.33 stale microphone recovery', () => {
	const constraints: MediaTrackConstraints = { deviceId: { exact: 'old-mic' }, echoCancellation: true };

	it('keeps the chosen microphone when it is available', async () => {
		const stream = {} as MediaStream;
		const capture = spyOn(navigator.mediaDevices, 'getUserMedia').and.resolveTo(stream);
		expect(await captureMicrophone('old-mic', constraints)).toEqual({ stream, usedDefault: false });
		expect(capture).toHaveBeenCalledTimes(1);
	});

	it('retries with the default microphone when the saved ID disappeared', async () => {
		const stream = {} as MediaStream;
		const capture = spyOn(navigator.mediaDevices, 'getUserMedia').and.returnValues(
			Promise.reject(new DOMException('Missing device', 'OverconstrainedError')),
			Promise.resolve(stream)
		);
		expect(await captureMicrophone('old-mic', constraints)).toEqual({ stream, usedDefault: true });
		expect(capture).toHaveBeenCalledTimes(2);
		expect(capture.calls.mostRecent().args[0].audio).toEqual({ deviceId: undefined, echoCancellation: true });
	});

	it('does not hide permission failures', async () => {
		const capture = spyOn(navigator.mediaDevices, 'getUserMedia').and.rejectWith(
			new DOMException('Denied', 'NotAllowedError')
		);
		await expectAsync(captureMicrophone('old-mic', constraints)).toBeRejected();
		expect(capture).toHaveBeenCalledTimes(1);
	});
});
