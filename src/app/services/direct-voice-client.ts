import { AmongUsState, Player } from '../common/AmongUsState';
import { voiceRoleIdentity } from '../common/RemoteVoiceRole';

/** An authenticated WSS connection to the user's own NoS addon, never to desktop BCL. */
export class DirectVoiceClient {
	code = '';
	status = '';
	level = 0;
	private socket?: WebSocket;
	private token = '';
	private ticket = '';
	private playerId = -1;
	private ticketAt = -Infinity;
	private sequence = 0;
	private scope = '';
	private retry?: ReturnType<typeof setTimeout>;
	private changedAt = -Infinity;
	private url = '';
	constructor(
		private changed: () => void,
		private createSocket = (url: string) => new WebSocket(url)
	) {}

	enable(address: string): void {
		this.reset();
		let url: URL;
		try {
			url = new URL(address.trim());
		} catch {
			this.fail('NoSの設定画面で発行した直接接続先を入力してください。');
			return;
		}
		if (
			url.protocol !== 'wss:' ||
			url.pathname !== '/voice' ||
			url.username ||
			url.password ||
			url.search ||
			!/^#[a-f0-9]{32}$/.test(url.hash)
		) {
			this.fail('接続先は wss://接続先:ポート/voice#接続キー の形式です。');
			return;
		}
		this.token = url.hash.slice(1);
		url.hash = '';
		this.url = url.toString();
		this.code = 'direct';
		this.open();
	}
	reset(): void {
		this.code = '';
		clearTimeout(this.retry);
		this.retry = undefined;
		const socket = this.socket;
		this.socket = undefined;
		if (socket) {
			socket.onclose = null;
			socket.onmessage = null;
			socket.onopen = null;
			socket.onerror = null;
			socket.close();
		}
		this.ticket = '';
		this.token = '';
		this.url = '';
		this.scope = '';
		this.playerId = -1;
		this.sequence = 0;
		this.level = 0;
		this.status = '';
		this.changed();
	}
	release(): void {
		this.reset();
	}
	private fail(message: string): void {
		this.status = message;
		this.changed();
	}
	private open(): void {
		if (!this.code || this.socket) return;
		this.fail('本人のNoSへの接続待ち（証明書・LAN接続を確認）');
		let socket: WebSocket;
		try {
			socket = this.createSocket(this.url);
		} catch {
			this.reconnect();
			return;
		}
		this.socket = socket;
		this.playerId = -1;
		this.sequence = 0;
		this.ticket = '';
		socket.onopen = () => {
			if (this.socket === socket) this.fail('NoSへ接続：ゲーム情報待ち');
		};
		socket.onerror = () => {
			if (this.socket === socket)
				this.fail('接続できません。証明書の信頼設定・接続先・ファイアウォールを確認してください。');
		};
		socket.onclose = () => {
			if (this.socket !== socket) return;
			this.socket = undefined;
			this.ticket = '';
			this.ticketAt = -Infinity;
			this.reconnect();
		};
		socket.onmessage = ({ data }) => this.receive(socket, data);
	}
	private reconnect(): void {
		if (!this.code) return;
		this.retry = setTimeout(() => {
			this.retry = undefined;
			this.open();
		}, 2000);
	}
	private receive(socket: WebSocket, data: unknown): void {
		if (this.socket !== socket || typeof data !== 'string' || data.length > 128) return;
		const parts = data.split('|');
		if (
			parts.length !== 3 ||
			parts[0] !== 'TBCLA1' ||
			!/^[a-f0-9]{32}$/.test(parts[1]) ||
			Number(parts[2]) !== this.playerId
		)
			return;
		this.ticket = parts[1];
		this.ticketAt = Date.now();
		if (this.status !== '直接接続中：マイク停止・ミュート') this.status = '本人のNoSへ直接接続中';
		this.notify(Date.now());
	}
	sample(
		rms: number,
		active: boolean,
		state: AmongUsState | undefined,
		player: Player | undefined,
		transportConnected: boolean,
		lastFrameAt: number,
		now = Date.now()
	): void {
		if (!this.code) return;
		const identity = voiceRoleIdentity(state, player);
		if (!identity || !transportConnected || now - lastFrameAt > 1500 || now < lastFrameAt - 100) {
			this.status = 'ゲーム情報・音声接続の復帰待ち';
			this.notify(now);
			return;
		}
		const scope = `${identity.lobbyCode}:${identity.playerId}:${identity.clientId}`;
		if (this.scope && this.scope !== scope) {
			this.reset();
			this.fail('部屋・プレイヤーが変わりました。NoSで接続先を発行し直してください。');
			return;
		}
		this.scope = scope;
		if (this.socket?.readyState !== WebSocket.OPEN) return;
		if (this.playerId < 0) {
			this.playerId = identity.playerId;
			this.socket.send(`TBCLW1|${this.token}|${this.playerId}`);
			return;
		}
		if (
			!this.ticket ||
			now - this.ticketAt > 750 ||
			this.socket.bufferedAmount > 1024 ||
			!Number.isFinite(rms) ||
			rms < 0 ||
			rms > 1
		)
			return;
		const ticket = this.ticket;
		this.ticket = '';
		this.socket.send(`TBCLS1|${ticket}|${++this.sequence}|1|${rms}|${active ? 1 : 0}`);
		this.level = active
			? Math.round(Math.max(0, Math.min(100, ((20 * Math.log10(Math.max(rms, 0.000001)) + 60) / 60) * 100)))
			: 0;
		this.status = active ? '本人のNoSへ直接接続中' : '直接接続中：マイク停止・ミュート';
		this.notify(now);
	}
	private notify(now: number): void {
		if (now - this.changedAt >= 250) {
			this.changedAt = now;
			this.changed();
		}
	}
}
