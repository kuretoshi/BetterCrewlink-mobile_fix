import { registerPlugin } from '@capacitor/core';
const BetterCrewlinkNativeService = registerPlugin('BetterCrewlinkNativeService', {
    web: () => import('./web').then((m) => new m.BetterCrewlinkNativeServiceWeb()),
});
export * from './definitions';
export { BetterCrewlinkNativeService };
//# sourceMappingURL=index.js.map