import { Capacitor } from '@capacitor/core';
import { Subject } from 'rxjs';
import { GameHelperService } from './game-helper.service';
import { ConnectionState } from './ConnectionController.service';

describe('Android background voice connection', () => {
	it('keeps the WebView active on each background activation while connected', () => {
		spyOn(Capacitor, 'getPlatform').and.returnValue('android');
		spyOn(GameHelperService.prototype, 'load');
		const activation = new Subject<void>();
		const background = {
			on: jasmine.createSpy('on').and.returnValue(activation),
			disableWebViewOptimizations: jasmine.createSpy('disableWebViewOptimizations'),
		};
		const connection = { connectionState: ConnectionState.conencted };
		// Only the activation lifecycle is under test; load is stubbed above.
		new GameHelperService(null, null, connection as never, null, background as never, null);
		expect(background.on).toHaveBeenCalledWith('activate');
		activation.next();
		activation.next();
		expect(background.disableWebViewOptimizations).toHaveBeenCalledTimes(2);
		connection.connectionState = ConnectionState.disconnected;
		activation.next();
		expect(background.disableWebViewOptimizations).toHaveBeenCalledTimes(2);
	});
});
