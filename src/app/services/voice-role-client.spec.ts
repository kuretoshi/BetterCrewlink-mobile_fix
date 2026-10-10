import { VoiceRoleClient } from './voice-role-client';
import { RemoteVoiceRoleInput, voiceRoleIdentity } from '../common/RemoteVoiceRole';
import { AmongUsState, GameState, Player } from '../common/AmongUsState';

describe('NoS Web/mobile microphone pairing', () => {
	const player = { id: 7, clientId: 42, isDead: false, disconnected: false } as Player;
	const state = { mod: 'NoS', gameState: GameState.TASKS, lobbyCode: 'ABCDEF', players: [player] } as AmongUsState;
	const client = { playerId: 7, clientId: 42 };
	let pc: RemoteVoiceRoleInput;
	let phone: VoiceRoleClient;
	let samples: { rms: number; active: boolean }[];
	let messages: number;
	beforeEach(() => {
		jasmine.clock().install();
		jasmine.clock().mockDate(new Date(10000));
		pc = new RemoteVoiceRoleInput();
		pc.enable(voiceRoleIdentity(state, player), 'abcdef123456');
		samples = [];
		messages = 0;
		phone = new VoiceRoleClient(
			(to, value) => {
				const data = value as { request?: unknown; sample?: unknown };
				messages++;
				if (data.request) {
					const ack = pc.request('phone', client, data.request, 'b'.repeat(32));
					if (ack) phone.receive('pc', client, ack, state, player);
				} else if (data.sample) {
					const sample = pc.sample('phone', client, data.sample);
					if (sample) samples.push(sample);
				}
			},
			jasmine.createSpy('onChange')
		);
	});
	afterEach(() => jasmine.clock().uninstall());
	it('sends raw RMS and explicit mute through the paired PC', () => {
		phone.enable('ABCDEF123456');
		phone.sample(0.5, true, state, player, true, Date.now());
		jasmine.clock().tick(50);
		phone.sample(0.3, false, state, player, true, Date.now());
		expect(samples.length).toBe(2);
		expect(samples[0].rms).toBe(0.5);
		expect(samples[1].active).toBeFalse();
	});
	it('does not send when the frame is stale or transport disconnected', () => {
		phone.enable('abcdef123456');
		phone.sample(0.5, true, state, player, true, Date.now() - 1600);
		phone.sample(0.5, true, state, player, false, Date.now());
		expect(messages).toBe(0);
	});
	it('rejects another player even with the correct code', () => {
		const request = { ...voiceRoleIdentity(state, player), protocol: 1, code: 'abcdef123456', session: 'a'.repeat(32) };
		expect(pc.request('attacker', { playerId: 8, clientId: 43 }, request, 'b'.repeat(32))).toBeUndefined();
	});
	it('revokes microphone selection when changing rooms', () => {
		phone.enable('abcdef123456');
		phone.sample(0.5, true, state, player, true, Date.now());
		phone.sample(0.5, true, { ...state, lobbyCode: 'OTHER' }, player, true, Date.now());
		expect(phone.code).toBe('');
	});
	it('keeps the same pairing during meetings and lobby microphone test', () => {
		phone.enable('abcdef123456');
		phone.sample(0.5, true, state, player, true, Date.now());
		for (const phase of [GameState.DISCUSSION, GameState.LOBBY]) {
			jasmine.clock().tick(50);
			phone.sample(0.5, true, { ...state, gameState: phase }, player, true, Date.now());
		}
		expect(samples.length).toBe(3);
	});
	it('accepts PC revocation only from the paired socket', () => {
		phone.enable('abcdef123456');
		phone.sample(0.5, true, state, player, true, Date.now());
		expect(phone.receive('attacker', client, pc.revocation, state, player)).toBeUndefined();
		expect(phone.code).not.toBe('');
		expect(phone.receive('pc', client, pc.revocation, state, player)).toBeTrue();
		expect(phone.code).toBe('');
	});
});
