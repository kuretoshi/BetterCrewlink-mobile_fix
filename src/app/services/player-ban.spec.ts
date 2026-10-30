/* eslint-disable @typescript-eslint/no-explicit-any */
import { GameHelperService } from './game-helper.service';

describe('Web/Android/iOS player BAN checks', () => {
	let service: any;
	let request: jasmine.Spy;

	beforeEach(() => {
		// Exercise the production check without native permissions, audio or startup timers.
		service = Object.assign(Object.create(GameHelperService.prototype), {
			playerBanUid: 'self-uid',
			playerBanName: 'Self',
			playerBanGeneration: 1,
			playerBanStatus: 'checking',
			cManager: {
				localPLayer: { clientId: 2, playerUid: 'self-uid', name: 'Self', friendCode: 'self#1234' },
				currentGameState: {
					players: [
						{ clientId: 1, playerUid: 'host-uid', name: 'Host', friendCode: 'host#1234', isLocal: true },
						{ clientId: 2, playerUid: 'self-uid', name: 'Self', isLocal: false },
						{ clientId: 3, playerUid: 'remote-uid', name: 'Remote', publicIp: '203.0.113.80' },
						{ clientId: 4, playerUid: 'gone', name: 'Gone', disconnected: true },
						{ clientId: 5, playerUid: 'dummy', name: 'Dummy', isDummy: true },
						{ clientId: 6, playerUid: '', name: 'No identity' },
					],
				},
			},
			updateViews: jasmine.createSpy('updateViews'),
			connect: jasmine.createSpy('connect'),
			disconnect: jasmine.createSpy('disconnect'),
		});
		request = spyOn(window, 'fetch').and.returnValue(Promise.resolve(new Response('{"banned":false}')));
	});

	const check = (subject: any) => subject.checkPlayerBan('self-uid', 'Self', 1);

	it('registers only the caller as self and includes the desktop host in the observed roster', async () => {
		await check(service);
		const [url, options] = request.calls.mostRecent().args;
		expect(url).toBe('https://debug-auth.kuretoshi.work/v1/player-bans/check');
		expect(options.method).toBe('POST');
		expect(JSON.parse(options.body)).toEqual({
			playerUid: 'self-uid',
			playerName: 'Self',
			friendCode: 'self#1234',
			observedPlayers: [
				{ playerUid: 'host-uid', playerName: 'Host', friendCode: 'host#1234' },
				{ playerUid: 'remote-uid', playerName: 'Remote', friendCode: '' },
			],
		});
		expect(service.playerBanStatus).toBe('clear');
		expect(service.connect).toHaveBeenCalledTimes(1);
		expect(service.disconnect).not.toHaveBeenCalled();
	});

	it('caps observed identities at 29 without sending any client-provided IP fields', async () => {
		service.cManager.currentGameState.players = Array.from({ length: 40 }, (_, index) => ({
			clientId: index + 10,
			playerUid: `uid-${index}`,
			name: `Player ${index}`,
			public_ip: '198.51.100.1',
			publicIp: '198.51.100.2',
		}));
		await check(service);
		const payload = JSON.parse(request.calls.mostRecent().args[1].body);
		expect(payload.observedPlayers.length).toBe(29);
		expect(Object.keys(payload)).toEqual(['playerUid', 'playerName', 'friendCode', 'observedPlayers']);
		expect(Object.keys(payload.observedPlayers[0])).toEqual(['playerUid', 'playerName', 'friendCode']);
	});

	for (const banType of ['uid', 'ip']) {
		it(`blocks use when the server reports a ${banType.toUpperCase()} BAN`, async () => {
			request.and.returnValue(Promise.resolve(new Response(JSON.stringify({ banned: true, ban_type: banType }))));
			await check(service);
			expect(service.playerBanStatus).toBe('banned');
			expect(service.disconnect).toHaveBeenCalledTimes(1);
			expect(service.disconnect).toHaveBeenCalledWith(true);
			expect(service.connect).not.toHaveBeenCalled();
		});
	}

	it('keeps accepting the existing server boolean response without requiring new fields', async () => {
		service.playerBanStatus = 'clear';
		await check(service);
		expect(service.playerBanStatus).toBe('clear');
		expect(service.connect).not.toHaveBeenCalled();
	});

	for (const body of ['{}', '{"banned":"false"}', 'invalid json']) {
		it(`fails closed for an invalid server result: ${body}`, async () => {
			request.and.returnValue(Promise.resolve(new Response(body)));
			await check(service);
			expect(service.playerBanStatus).toBe('unavailable');
			expect(service.disconnect).toHaveBeenCalledTimes(1);
			expect(service.disconnect).toHaveBeenCalledWith(true);
			expect(service.connect).not.toHaveBeenCalled();
		});
	}

	it('fails closed when the server is unavailable', async () => {
		request.and.returnValue(Promise.resolve(new Response('', { status: 503 })));
		await check(service);
		expect(service.playerBanStatus).toBe('unavailable');
		expect(service.disconnect).toHaveBeenCalledTimes(1);
		expect(service.disconnect).toHaveBeenCalledWith(true);
	});

	it('fails closed when the request fails', async () => {
		request.and.returnValue(Promise.reject(new TypeError('Network unavailable')));
		await check(service);
		expect(service.playerBanStatus).toBe('unavailable');
		expect(service.disconnect).toHaveBeenCalledTimes(1);
		expect(service.disconnect).toHaveBeenCalledWith(true);
	});

	it('ignores a completed check after the local identity changes', async () => {
		let finish: (response: Response) => void;
		request.and.returnValue(new Promise<Response>((resolve) => (finish = resolve)));
		const pending = check(service);
		service.playerBanUid = 'other-uid';
		service.playerBanGeneration++;
		finish(new Response('{"banned":true}'));
		await pending;
		expect(service.playerBanStatus).toBe('checking');
		expect(service.updateViews).not.toHaveBeenCalled();
		expect(service.connect).not.toHaveBeenCalled();
		expect(service.disconnect).not.toHaveBeenCalled();
	});
});
