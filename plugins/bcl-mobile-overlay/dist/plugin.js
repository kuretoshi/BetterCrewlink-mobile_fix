var capacitorBetterCrewlinkNativeService = (function (exports, core) {
    'use strict';

    const BetterCrewlinkNativeService = core.registerPlugin('BetterCrewlinkNativeService', {
        web: () => Promise.resolve().then(function () { return web; }).then((m) => new m.BetterCrewlinkNativeServiceWeb()),
    });

    class BetterCrewlinkNativeServiceWeb extends core.WebPlugin {
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

    var web = /*#__PURE__*/Object.freeze({
        __proto__: null,
        BetterCrewlinkNativeServiceWeb: BetterCrewlinkNativeServiceWeb
    });

    exports.BetterCrewlinkNativeService = BetterCrewlinkNativeService;

    return exports;

})({}, capacitorExports);
//# sourceMappingURL=plugin.js.map
