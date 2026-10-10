import { AmongUsState, Player } from '../common/AmongUsState';
import { voiceRoleIdentity } from '../common/RemoteVoiceRole';

/** Uses the already selected mobile host, without certificates or connection codes. */
export class HostVoiceClient {
	code = 'host';
	status = 'ホスト中継の接続待ち';
	level = 0;
	private sequence = 0;
	private sentAt = 0;
	private acknowledgedAt = -Infinity;
	private session = crypto.randomUUID();
	constructor(
		private send: (data: unknown) => void,
		private changed: () => void
	) {}
	reset(): void {
		this.sequence = 0;
		this.session = crypto.randomUUID();
		this.acknowledgedAt = -Infinity;
		this.status = 'ホスト中継の接続待ち';
		this.level = 0;
	}
	release(): void {
		this.reset();
	}
	sample(
		rms: number,
		active: boolean,
		state: AmongUsState | undefined,
		player: Player | undefined,
		connected: boolean,
		lastFrame: number,
		now = Date.now()
	): void {
		const identity = voiceRoleIdentity(state, player);
		if (!identity || !connected || now - lastFrame > 1500 || lastFrame - now > 100) {
			this.status = 'ゲーム情報・ホスト接続の復帰待ち';
			this.level = 0;
			this.changed();
			return;
		}
		if (now - this.sentAt < 100 || !Number.isFinite(rms) || rms < 0 || rms > 1) return;
		this.sentAt = now;
		if (now - this.acknowledgedAt > 1500) this.status = '対応版ホスト・アドオンの接続待ち';
		this.send({
			type: 'nos-host-voice',
			lobbyCode: identity.lobbyCode,
			playerId: identity.playerId,
			clientId: identity.clientId,
			sequence: ++this.sequence,
			session: this.session,
			rms,
			active,
		});
		this.level = active
			? Math.round(Math.max(0, Math.min(100, ((20 * Math.log10(Math.max(rms, 0.000001)) + 60) / 60) * 100)))
			: 0;
		this.changed();
	}
	acknowledge(): void {
		this.acknowledgedAt = Date.now();
		this.status = 'ホスト中継へ送信中（ベータ）';
		this.changed();
	}
}
