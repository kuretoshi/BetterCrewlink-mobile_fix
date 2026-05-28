import { WebPlugin } from '@capacitor/core';
export class BetterCrewlinkNativeServiceWeb extends WebPlugin {
    disconnect() {
        console.log('disconnect');
        return Promise.resolve({ value: 'Disconnected' });
    }
    showTalking({ color, talking }) {
        console.log('showTalking', { color, talking });
        return Promise.resolve({ value: `Talking: ${talking}, Color: ${color}` });
    }
    showNotification(_options) {
        console.log('showNotification', _options);
        return Promise.resolve({ value: 'Notification shown' });
    }
    async echo(options) {
        console.log('ECHO', options);
        return options;
    }
}
//# sourceMappingURL=web.js.map