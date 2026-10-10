import { AmongUsState, Client } from '../common/AmongUsState';
import { VoiceRoleAck, voiceRoleIdentity, sameVoiceRoleIdentity } from '../common/RemoteVoiceRole';

/** Web/APK share this path; only amplitude and microphone availability leave the device. */
export class VoiceRoleClient {
	code = '';
	status = '';
	level = 0;
	private session = this.newSession();
	private peer = '';
	private ack?: VoiceRoleAck;
	private ackAt = -Infinity;
	private requestedAt = -Infinity;
	private sequence = 0;
	private scope = '';
	private changedAt = -Infinity;

	constructor(
		private send: (target: string, data: unknown) => void,
		private changed: () => void
	) {}
	private newSession(): string {
		return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
	}
	enable(code: string): void {
		this.reset();
		if (!/^[a-f0-9]{12}$/.test(code.trim().toLowerCase())) {
			this.status = 'PCに表示された12桁の接続コードを入力してください。';
			this.changed();
			return;
		}
		this.code = code.trim().toLowerCase();
		this.status = 'PCへの接続待ち';
		this.changed();
	}
	reset(): void {
		this.code = '';
		this.peer = '';
		this.ack = undefined;
		this.ackAt = -Infinity;
		this.session = this.newSession();
		this.sequence = 0;
		this.requestedAt = -Infinity;
		this.scope = '';
		this.level = 0;
		this.status = '';
		this.changed();
	}
	release(): void {
		if (this.ack) this.send(this.peer, { type: 'nos-voice-role', release: this.ack });
		this.reset();
	}
	receive(
		from: string,
		client: Client | undefined,
		value: unknown,
		state: AmongUsState | undefined,
		player: AmongUsState['players'][number] | undefined
	): boolean | void {
		const identity = voiceRoleIdentity(state, player);
		if (!identity || !value || typeof value !== 'object' || !this.code) return;
		const ack = value as VoiceRoleAck;
		if (
			ack.protocol !== 1 ||
			ack.session !== this.session ||
			!sameVoiceRoleIdentity(identity, ack) ||
			client?.playerId !== identity.playerId ||
			client.clientId !== identity.clientId ||
			typeof ack.lease !== 'string' ||
			!/^[a-f0-9]{32}$/.test(ack.lease)
		)
			return;
		if (ack.revoked === true && from === this.peer) {
			this.reset();
			this.status = 'PCマイクに切り替えました。この端末のマイクはミュート中です。';
			this.changed();
			return true;
		}
		if (ack.revoked) return;
		this.peer = from;
		this.ack = ack;
		this.ackAt = Date.now();
		this.status = 'PCへ接続中';
		this.changed();
		return false;
	}
	sample(
		rms: number,
		active: boolean,
		state: AmongUsState | undefined,
		player: AmongUsState['players'][number] | undefined,
		transportConnected: boolean,
		lastFrameAt: number,
		now = Date.now()
	): void {
		if (!this.code) return;
		const identity = voiceRoleIdentity(state, player);
		if (identity) {
			const scope = `${identity.lobbyCode}:${identity.playerId}:${identity.clientId}`;
			if (this.scope && scope !== this.scope) {
				this.reset();
				return;
			}
			this.scope = scope;
		}
		if (!identity || !transportConnected || now - lastFrameAt > 1500) {
			this.status = 'ゲーム情報・通信の復帰待ち';
			this.notify(now);
			return;
		}
		if (now - this.requestedAt >= 750) {
			this.requestedAt = now;
			this.send(identity.lobbyCode, {
				type: 'nos-voice-role',
				request: { ...identity, protocol: 1, code: this.code, session: this.session },
			});
		}
		if (!this.ack || now - this.ackAt > 1500 || !sameVoiceRoleIdentity(identity, this.ack)) {
			this.status = 'PCへの接続待ち（接続コードを確認）';
			this.notify(now);
			return;
		}
		if (!Number.isFinite(rms) || rms < 0 || rms > 1) return;
		this.level = active
			? Math.round(Math.max(0, Math.min(100, ((20 * Math.log10(Math.max(rms, 0.000001)) + 60) / 60) * 100)))
			: 0;
		this.status = player.isDead ? '死亡中：役職判定なし' : active ? 'PCへ接続中' : 'PCへ接続中：マイク停止・ミュート';
		this.send(this.peer, {
			type: 'nos-voice-role',
			sample: {
				...identity,
				protocol: 1,
				session: this.session,
				lease: this.ack.lease,
				sequence: ++this.sequence,
				rms,
				active,
			},
		});
		this.notify(now);
	}
	private notify(now: number): void {
		if (now - this.changedAt >= 250) {
			this.changedAt = now;
			this.changed();
		}
	}
}
