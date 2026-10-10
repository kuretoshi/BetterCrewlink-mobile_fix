import { DirectVoiceClient } from './direct-voice-client';
import { AmongUsState, GameState, Player } from '../common/AmongUsState';

describe('direct NoS microphone client', () => {
	const player = { id: 7, clientId: 42, disconnected: false } as Player;
	const state = { mod: 'NoS', gameState: GameState.TASKS, lobbyCode: 'ABCDEF', players: [player] } as AmongUsState;
	const ticket = 'b'.repeat(32);
	let client: DirectVoiceClient;
	let sockets: WebSocket[];
	let sent: string[];
	beforeEach(() => {
		jasmine.clock().install();
		jasmine.clock().mockDate(new Date(10000));
		sent = [];
		sockets = [];
		client = new DirectVoiceClient(
			jasmine.createSpy('onChange'),
			() => {
				const socket = {
					readyState: 1,
					bufferedAmount: 0,
					send: (data: string) => sent.push(data),
					close: jasmine.createSpy('close'),
					onmessage: null,
					onclose: null,
				} as unknown as WebSocket;
				sockets.push(socket);
				return socket;
			}
		);
	});
	afterEach(() => {
		client.reset();
		jasmine.clock().uninstall();
	});
	function pair() {
		client.enable('wss://localhost:57742/voice#' + 'a'.repeat(32));
		client.sample(0.5, true, state, player, true, Date.now());
	}
	function ack(id = 7) {
		sockets.at(-1).onmessage({ data: `TBCLA1|${ticket}|${id}` } as MessageEvent);
	}
	it('authenticates the local player then sends RMS directly with a server ticket', () => {
		pair();
		expect(sent[0]).toBe('TBCLW1|' + 'a'.repeat(32) + '|7');
		ack();
		jasmine.clock().tick(50);
		client.sample(0.5, true, state, player, true, Date.now());
		expect(sent[1]).toBe(`TBCLS1|${ticket}|1|1|0.5|1`);
		client.sample(0.5, true, state, player, true, Date.now());
		expect(sent.length).toBe(2);
	});
	it('sends explicit mute and keeps microphone decisions out of the connection UI', () => {
		pair();
		ack();
		client.sample(0.4, false, state, player, true, Date.now());
		expect(sent[1].endsWith('|0.4|0')).toBeTrue();
	});
	it('does not accept another player, expired tickets or stale game information', () => {
		pair();
		ack(8);
		client.sample(0.5, true, state, player, true, Date.now());
		expect(sent.length).toBe(1);
		ack();
		jasmine.clock().tick(800);
		client.sample(0.5, true, state, player, true, Date.now());
		expect(sent.length).toBe(1);
		ack();
		client.sample(0.5, true, state, player, true, Date.now() - 1600);
		expect(sent.length).toBe(1);
	});
	it('reconnects with a new handshake and invalidates old socket callbacks', () => {
		pair();
		const old = sockets[0];
		old.onclose({} as CloseEvent);
		jasmine.clock().tick(2000);
		client.sample(0.5, true, state, player, true, Date.now());
		expect(sent.length).toBe(2);
		expect(sent[1]).toBe(sent[0]);
	});
	it('clears pairing on room change and permits meetings/lobby microphone tests', () => {
		pair();
		for (const phase of [GameState.DISCUSSION, GameState.LOBBY]) {
			ack();
			client.sample(0.5, true, { ...state, gameState: phase }, player, true, Date.now());
		}
		expect(sent.length).toBe(3);
		client.sample(0.5, true, { ...state, lobbyCode: 'OTHER' }, player, true, Date.now());
		expect(client.code).toBe('');
	});
	it('rejects insecure or malformed connection addresses', () => {
		client.enable('ws://localhost:57742/voice#' + 'a'.repeat(32));
		expect(sockets.length).toBe(0);
		client.enable('wss://localhost:57742/voice');
		expect(sockets.length).toBe(0);
	});
});
