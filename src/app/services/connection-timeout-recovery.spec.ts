/* eslint-disable @typescript-eslint/no-explicit-any */
import { ConnectionController, ConnectionState } from './ConnectionController.service';
import { SettingsService } from './settings.service';

describe('Web peer timeout recovery after delayed browser events', () => {
	let controller: any;
	let peer: any;
	beforeEach(() => {
		jasmine.clock().install();
		controller = new ConnectionController({} as SettingsService);
		controller.connectionState = ConnectionState.connecting;
		controller.gamecode = 'TEST';
		controller.audioController.stream = { getTracks: () => [] } as unknown as MediaStream;
		controller.socketIOClient = { connected: true, id: 'me', emit: jasmine.createSpy('emit') };
		peer = controller.createPeerConnection('remote', false, { playerId: 1, clientId: 1 });
	});
	afterEach(() => {
		controller.destroyAllPeers();
		jasmine.clock().uninstall();
	});
	it('does not tear down a connected transport before its queued data-channel open event', () => {
		spyOnProperty(peer, 'connectionState').and.returnValue('connected');
		jasmine.clock().tick(30000);
		expect(controller.peers.get('remote')).toBe(peer);
		expect(controller.peerRetryTimers.size).toBe(0);
	});
	it('rechecks recovered ICE before a delayed disconnect timeout destroys the peer', () => {
		peer.emit('connect');
		peer.emit('iceStateChange', 'disconnected', 'complete');
		// Native ICE recovered while JS was suspended; the recovery event is still queued.
		spyOnProperty(peer, 'iceConnectionState').and.returnValue('connected');
		jasmine.clock().tick(12000);
		expect(controller.peers.get('remote')).toBe(peer);
		expect(controller.iceDisconnectTimers.size).toBe(0);
	});
	it('still retries when ICE really remains disconnected', () => {
		peer.emit('connect');
		peer.emit('iceStateChange', 'disconnected', 'complete');
		spyOnProperty(peer, 'iceConnectionState').and.returnValue('disconnected');
		jasmine.clock().tick(12000);
		expect(controller.peers.has('remote')).toBeFalse();
		expect(controller.peerRetryTimers.size).toBe(1);
	});
});
