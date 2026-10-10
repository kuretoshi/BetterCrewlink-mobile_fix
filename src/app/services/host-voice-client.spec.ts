import { HostVoiceClient } from './host-voice-client';
import { AmongUsState, GameState, Player } from '../common/AmongUsState';
describe('automatic host microphone relay', () => {
	const player = { id: 7, clientId: 42, disconnected: false } as Player;
	const state = { mod: 'NoS', gameState: GameState.TASKS, lobbyCode: 'ABCDEF', players: [player] } as AmongUsState;
	let sent: Record<string, unknown>[];
	let client: HostVoiceClient;
	beforeEach(() => {
		sent = [];
		client = new HostVoiceClient((v) => sent.push(v as Record<string, unknown>), jasmine.createSpy('changed'));
	});
	it('sends without certificate or code and limits to ten samples per second', () => {
		client.sample(0.5, true, state, player, true, 10000, 10000);
		client.sample(0.6, true, state, player, true, 10050, 10050);
		expect(sent.length).toBe(1);
		expect(sent[0]['playerId']).toBe(7);
		expect(sent[0]['clientId']).toBe(42);
	});
	it('does not send stale, disconnected or invalid microphone data', () => {
		client.sample(0.5, true, state, player, true, 0, 10000);
		client.sample(0.5, true, state, player, false, 10000, 10000);
		client.sample(NaN, true, state, player, true, 10000, 10000);
		expect(sent.length).toBe(0);
	});
	it('sends muted status rather than treating muted audio as speech', () => {
		client.sample(0.5, false, state, player, true, 10000, 10000);
		expect(sent[0]['active']).toBe(false);
		expect(client.level).toBe(0);
	});
});
