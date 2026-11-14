/** Stop retrying the same failing WebSocket path; reset only on a new user connection. */
export class SignalingRecovery {
	private pingTimeouts = 0;
	private switched = false;

	usePolling(reason: string, transport: string): boolean {
		if (this.switched || reason !== 'ping timeout' || transport !== 'websocket') return false;
		if (++this.pingTimeouts < 2) return false;
		this.switched = true;
		return true;
	}
}
