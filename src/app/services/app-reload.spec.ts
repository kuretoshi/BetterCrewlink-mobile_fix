import { reloadWebApplication, ReloadRuntime } from './app-reload';
import { Capacitor } from '@capacitor/core';
import { AppComponent } from '../app.component';

describe('Web app reload', () => {
	function setup() {
		const unregister = jasmine.createSpy('unregister').and.resolveTo(true);
		const otherUnregister = jasmine.createSpy('otherUnregister');
		const runtime: ReloadRuntime = {
			baseUri: 'https://example.com/mobile/', href: 'https://example.com/mobile/game?setting=1#players',
			fetch: jasmine.createSpy('fetch').and.resolveTo(new Response('index')),
			registrations: async () => [
				{ scope: 'https://example.com/mobile/', active: { scriptURL: 'https://example.com/mobile/ngsw-worker.js' }, unregister },
				{ scope: 'https://example.com/', active: { scriptURL: 'https://example.com/ngsw-worker.js' }, unregister: otherUnregister },
			] as unknown as ServiceWorkerRegistration[],
			cacheKeys: async () => ['ngsw:/mobile/:db:control', 'ngsw:/:db:control', 'player-settings'],
			deleteCache: jasmine.createSpy('deleteCache').and.resolveTo(true), navigate: jasmine.createSpy('navigate'),
		};
		return { runtime, unregister, otherUnregister, disconnect: jasmine.createSpy('disconnect') };
	}
	it('refreshes only its own worker and caches, retaining the current route', async () => {
		const { runtime, unregister, otherUnregister, disconnect } = setup();
		await reloadWebApplication(disconnect, runtime);
		expect(unregister).toHaveBeenCalled();
		expect(otherUnregister).not.toHaveBeenCalled();
		expect(runtime.deleteCache).toHaveBeenCalledTimes(1);
		expect(runtime.deleteCache).toHaveBeenCalledWith('ngsw:/mobile/:db:control');
		expect(disconnect).toHaveBeenCalled();
		const url = new URL((runtime.navigate as jasmine.Spy).calls.mostRecent().args[0]);
		expect(url.pathname).toBe('/mobile/game');
		expect(url.searchParams.get('setting')).toBe('1');
		expect(url.searchParams.has('ngsw-bypass')).toBeTrue();
		expect(url.hash).toBe('#players');
		expect((runtime.fetch as jasmine.Spy).calls.mostRecent().args[1].cache).toBe('no-store');
	});
	it('does not disconnect or clear cached assets when the network is unavailable', async () => {
		const { runtime, disconnect } = setup();
		(runtime.fetch as jasmine.Spy).and.rejectWith(new Error('offline'));
		await expectAsync(reloadWebApplication(disconnect, runtime)).toBeRejected();
		expect(disconnect).not.toHaveBeenCalled();
		expect(runtime.deleteCache).not.toHaveBeenCalled();
		expect(runtime.navigate).not.toHaveBeenCalled();
	});
	it('hides and disables the action in native applications', async () => {
		spyOn(Capacitor, 'isNativePlatform').and.returnValue(true);
		const alerts = { create: jasmine.createSpy('create') };
		const app = new AppComponent(null, { events: { on: () => undefined } } as never, null, alerts as never);
		expect(app.isWeb).toBeFalse();
		await app.confirmReload();
		expect(alerts.create).not.toHaveBeenCalled();
	});
	it('offers confirmation with the requested name in web browsers', async () => {
		spyOn(Capacitor, 'isNativePlatform').and.returnValue(false);
		const present = jasmine.createSpy('present').and.resolveTo();
		const alerts = { create: jasmine.createSpy('create').and.resolveTo({ present }) };
		const app = new AppComponent(null, { events: { on: () => undefined } } as never, null, alerts as never);
		expect(app.isWeb).toBeTrue();
		await app.confirmReload();
		expect(alerts.create.calls.mostRecent().args[0].header).toBe('アプリ再読み込み');
		expect(present).toHaveBeenCalled();
	});
});
