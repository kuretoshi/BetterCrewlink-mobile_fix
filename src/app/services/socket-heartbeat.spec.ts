import { SocketHeartbeat } from './socket-heartbeat';

describe('Socket heartbeat diagnostics', () => {
	beforeEach(() => { jasmine.clock().install(); jasmine.clock().mockDate(new Date(0)); });
	afterEach(() => jasmine.clock().uninstall());
	it('distinguishes current server data from a missing ping', () => {
		const heartbeat = new SocketHeartbeat();
		heartbeat.packet('ping');
		jasmine.clock().tick(14900);
		heartbeat.packet('message');
		jasmine.clock().tick(100);
		expect(heartbeat.snapshot()).toEqual(jasmine.objectContaining({
			serverPacketAgeMs: 100, serverPingAgeMs: 15000, serverPingCount: 1,
		}));
	});
	it('does not mistake no pings or a fresh reconnect for a recent ping', () => {
		const heartbeat = new SocketHeartbeat();
		heartbeat.packet('message');
		expect(heartbeat.snapshot().serverPingAgeMs).toBe(-1);
		heartbeat.packet('ping');
		expect(new SocketHeartbeat().snapshot().serverPingCount).toBe(0);
	});
});
