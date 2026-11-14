import { SignalingRecovery } from './signaling-recovery';

describe('Signaling transport recovery', () => {
	it('escapes repeated WebSocket heartbeat timeouts once per connection', () => {
		const recovery = new SignalingRecovery();
		expect(recovery.usePolling('ping timeout', 'websocket')).toBeFalse();
		expect(recovery.usePolling('ping timeout', 'websocket')).toBeTrue();
		expect(recovery.usePolling('ping timeout', 'websocket')).toBeFalse();
	});
	it('does not change transport for intentional disconnects or failed polling', () => {
		const recovery = new SignalingRecovery();
		for (const reason of ['io client disconnect', 'io server disconnect', 'transport close']) {
			expect(recovery.usePolling(reason, 'websocket')).toBeFalse();
		}
		expect(recovery.usePolling('ping timeout', 'polling')).toBeFalse();
		expect(recovery.usePolling('ping timeout', 'websocket')).toBeFalse();
	});
});
