export interface ReloadRuntime {
	baseUri: string;
	href: string;
	fetch: typeof fetch;
	registrations: () => Promise<readonly ServiceWorkerRegistration[]>;
	cacheKeys: () => Promise<string[]>;
	deleteCache: (key: string) => Promise<boolean>;
	navigate: (url: string) => void;
}

/** Refresh only this application's assets; never clear settings or unrelated app caches. */
export async function reloadWebApplication(disconnect: () => void, runtime: ReloadRuntime = {
	baseUri: document.baseURI,
	href: location.href,
	fetch: window.fetch.bind(window),
	registrations: () => navigator.serviceWorker?.getRegistrations() ?? Promise.resolve([]),
	cacheKeys: () => window.caches?.keys() ?? Promise.resolve([]),
	deleteCache: (key) => window.caches.delete(key),
	navigate: (url) => location.replace(url),
}): Promise<void> {
	const base = new URL('./', runtime.baseUri);
	const index = new URL('index.html', base);
	index.searchParams.set('ngsw-bypass', 'true');
	index.searchParams.set('app-reload', String(Date.now()));
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 15000);
	try {
		const response = await runtime.fetch(index.href, { cache: 'no-store', signal: controller.signal });
		if (!response.ok) throw new Error('更新先に接続できませんでした。通信環境を確認してください。');
	} finally { clearTimeout(timeout); }
	const registrations = await runtime.registrations();
	const keys = await runtime.cacheKeys();
	disconnect();
	await Promise.all(registrations.filter((registration) => registration.scope === base.href &&
		[registration.active, registration.waiting, registration.installing].some((worker) =>
			worker && new URL(worker.scriptURL).pathname === new URL('ngsw-worker.js', base).pathname))
		.map((registration) => registration.unregister()));
	await Promise.all(keys.filter((key) => key.startsWith(`ngsw:${base.pathname}:`)).map((key) => runtime.deleteCache(key)));
	const target = new URL(runtime.href);
	target.searchParams.set('ngsw-bypass', 'true');
	target.searchParams.set('app-reload', String(Date.now()));
	runtime.navigate(target.href);
}
