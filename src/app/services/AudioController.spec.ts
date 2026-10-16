import AudioController from './AudioController.service';
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
