/** Metadata only: never retain packet contents, socket IDs or server credentials. */
export class SocketHeartbeat {
	private openedAt = Date.now();
	private lastPacketAt = -1;
	private lastPingAt = -1;
	private pingCount = 0;

	packet(type: string): void {
		this.lastPacketAt = Date.now();
		if (type === 'ping') {
			this.lastPingAt = this.lastPacketAt;
			this.pingCount++;
		}
	}

	snapshot(): Record<string, number | boolean> {
		const now = Date.now();
		return {
			socketAgeMs: now - this.openedAt,
			serverPacketAgeMs: this.lastPacketAt < 0 ? -1 : now - this.lastPacketAt,
			serverPingAgeMs: this.lastPingAt < 0 ? -1 : now - this.lastPingAt,
			serverPingCount: this.pingCount,
			documentHidden: typeof document !== 'undefined' && document.hidden,
		};
	}
}
