// White-box access to impostor-radio internals (impostorRadioClientId, cleanupImpostorRadio,
// onPeerData) is deliberate: there's no public seam for them and adding one just for tests
// would leak state machine internals into the real API.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { VoiceController, normalizeUsername, matchLocalPlayer, playerSettingsKey } from './voice-controller.service';
import { ConnectionController, ConnectionState } from './ConnectionController.service';
import { MobileHostService } from './mobile-host.service';
import { SettingsService } from './settings.service';
import { AmongUsState, GameState, Player } from '../common/AmongUsState';
import { CameraLocation, MapType } from '../common/AmongusMap';
import { defaultLobbySettings } from '../voice/types';

/** A real (not faked) MediaStream - AudioContext.createMediaStreamSource requires an actual instance. */
function createSilentStream(): MediaStream {
	return new AudioContext().createMediaStreamDestination().stream;
}

function makePlayer(overrides: Partial<Player> = {}): Player {
	return {
		ptr: 0,
		id: 0,
		clientId: 0,
		name: 'Player',
		nameHash: 0,
		playerConfigId: 0,
		friendCode: '',
		playerUid: '',
		playerIdentifier: '',
		colorId: 0,
		hatId: '0',
		petId: 0,
		skinId: '0',
		visorId: '0',
		disconnected: false,
		isImpostor: false,
		isDead: false,
		taskPtr: 0,
		objectPtr: 0,
		isLocal: false,
		shiftedColor: 0,
		bugged: false,
		x: 0,
		y: 0,
		inVent: false,
		isDummy: false,
		isbetter: false,
		...overrides,
	};
}

function makeState(overrides: Partial<AmongUsState> = {}): AmongUsState {
	return {
		gameState: GameState.TASKS,
		oldGameState: GameState.TASKS,
		lobbyCodeInt: 0,
		lobbyCode: 'ABCD',
		players: [],
		isHost: false,
		clientId: 0,
		hostId: 0,
		comsSabotaged: false,
		currentCamera: CameraLocation.NONE,
		map: MapType.THE_SKELD,
		lightRadius: 1,
		lightRadiusChanged: false,
		closedDoors: [],
		maxPlayers: 10,
		mod: 'NONE',
		oldMeetingHud: false,
		...overrides,
	};
}

describe('normalizeUsername / matchLocalPlayer', () => {
	it('trims, collapses whitespace and lowercases', () => {
		expect(normalizeUsername('  Guus   Wars ')).toBe('guus wars');
	});

	it('strips rich-text tags', () => {
		expect(normalizeUsername('<color=red>Guus</color>')).toBe('guus');
	});

	it('matches case- and whitespace-insensitively', () => {
		const players = [makePlayer({ id: 1, name: 'Guus  Wars' })];
		const result = matchLocalPlayer(players, '  guus wars');
		expect(result.player).toBe(players[0]);
		expect(result.ambiguous).toBeFalse();
	});

	it('flags multiple matches as ambiguous but still returns the first', () => {
		const players = [makePlayer({ id: 1, name: 'Guus' }), makePlayer({ id: 2, name: 'guus' })];
		const result = matchLocalPlayer(players, 'Guus');
		expect(result.player).toBe(players[0]);
		expect(result.ambiguous).toBeTrue();
	});

	it('returns undefined when nothing matches', () => {
		const result = matchLocalPlayer([makePlayer({ name: 'Someone Else' })], 'Guus');
		expect(result.player).toBeUndefined();
		expect(result.ambiguous).toBeFalse();
	});
});

describe('VoiceController impostor radio', () => {
	/** Minimal SettingsService fake: AudioController.ensureOutputBus reads selectedSpeaker from get(). */
	function makeFakeSettingsService(): SettingsService {
		return {
			get: () => ({
				selectedSpeaker: undefined,
				autoGainControl: false,
				microphoneGainEnabled: false,
				micSensitivityEnabled: false,
			}),
			getPlayerSettings: () => ({ volume: 100, isMuted: false }),
		} as unknown as SettingsService;
	}

	function makeController(): VoiceController {
		const connectionController = new ConnectionController(makeFakeSettingsService());
		return new VoiceController(
			connectionController,
			new MobileHostService(connectionController),
			makeFakeSettingsService()
		);
	}

	function readyState(connectionController: ConnectionController, me: Player, others: Player[] = []): void {
		connectionController.lobbySettings = { ...defaultLobbySettings, impostorRadioEnabled: true };
		connectionController.localPLayer = me;
		connectionController.currentGameState = makeState({ players: [me, ...others] });
	}

	it('uses the sender NoS impostor mask even without a sender self bit or local transmit channel', () => {
		const voice = makeController() as any;
		const connection = voice.connectionController as ConnectionController;
		const local = makePlayer({ id: 2, clientId: 20, isLocal: true });
		const remote = makePlayer({ id: 5, clientId: 50, isImpostor: true });
		readyState(connection, local, [remote]);
		const state = makeState({ mod: 'NoS', players: [local, remote], nosRadios: [] });
		connection.currentGameState = state;
		voice.nosRadiosByPlayer = {
			5: { clientId: 50, radios: [{ kind: 0, hearableMask: 1 << 2, nameLength: 0, name: '' }], receivedAt: Date.now() },
		};
		expect(voice.canUseRadio(state, remote)).toBeTrue();
		expect(voice.canUseRadio(state, local)).toBeFalse();
		expect(voice.areRadioPartners(state, local, remote)).toBeTrue();
		voice.nosRadiosByPlayer[5].radios[0].hearableMask = 1 << 5;
		expect(voice.areRadioPartners(state, local, remote)).toBeFalse();
		voice.nosRadiosByPlayer = {};
		expect(voice.canUseRadio(state, remote)).toBeFalse();
		expect(voice.areRadioPartners(state, local, remote)).toBeFalse();
	});

	it('selects exactly one NoS channel with dual membership and overlapping holds', () => {
		const voice = makeController() as any;
		const connection = voice.connectionController as any;
		const me = makePlayer({ id: 2, clientId: 20, isImpostor: true });
		const remote = makePlayer({ id: 5, clientId: 50 });
		readyState(connection, me, [remote]);
		connection.lobbySettings.jackalRadioEnabled = true;
		connection.currentGameState.mod = 'NoS';
		const radios = [
			{ kind: 0, hearableMask: 1 << 2, nameLength: 0, name: '' },
			{ kind: 1, hearableMask: 1 << 7, nameLength: 0, name: '' },
		];
		connection.currentGameState.nosRadios = radios;
		connection.clients = { remoteSocket: { playerId: 5, clientId: 50 } };
		voice.nosRadiosByPlayer = { 5: { clientId: 50, radios, receivedAt: Date.now() } };
		expect(voice.canTransmitRadio(0)).toBeTrue();
		expect(voice.canTransmitRadio(1)).toBeTrue();
		const packets: any[] = [];
		spyOn(connection, 'sendToPeers').and.callFake((_targets: any, payload: any) => packets.push(JSON.parse(payload)));
		voice.applyImpostorRadio(true, 0);
		voice.applyImpostorRadio(true, 1);
		voice.applyImpostorRadio(true, 0);
		expect(voice.heldNosRadio.kind).toBe(1);
		voice.applyImpostorRadio(false, 1);
		expect(voice.heldNosRadio.kind).toBe(0);
		voice.applyImpostorRadio(false, 0);
		expect(packets.map((packet) => [packet.impostorRadio, packet.nosRadioKind])).toEqual([
			[true, 0],
			[true, 1],
			[true, 0],
			[false, undefined],
		]);
		voice.onPeerData('remoteSocket', { impostorRadio: true, impostorRadioVersion: 1, nosRadioKind: 1 });
		expect(voice.areRadioPartners(connection.currentGameState, me, remote)).toBeFalse();
		expect(voice.canNosImpostorRadioReach(connection.currentGameState, remote, me)).toBeFalse();
		voice.onPeerData('remoteSocket', { impostorRadio: true, impostorRadioVersion: 2, nosRadioKind: 0 });
		expect(voice.areRadioPartners(connection.currentGameState, me, remote)).toBeTrue();
		voice.onPeerData('remoteSocket', { impostorRadio: true, impostorRadioVersion: 999, nosRadioKind: 2 });
		expect(voice.radioStatusVersions[50]).toBe(2);
		voice.applyImpostorRadio(true, 1);
		connection.lobbySettings.jackalRadioEnabled = false;
		voice.cleanupImpostorRadio(connection.currentGameState, me);
		expect(voice.heldNosRadio.kind).toBeUndefined();
	});

	it('keeps NoS radio transmission state when its mask is delayed or expires', () => {
		const voice = makeController() as any;
		const connection = voice.connectionController as any;
		const local = makePlayer({ id: 2, clientId: 20, isLocal: true });
		const remote = makePlayer({ id: 5, clientId: 50, isImpostor: true });
		readyState(connection, local, [remote]);
		const state = makeState({ mod: 'NoS', players: [local, remote], nosRadios: [] });
		connection.currentGameState = state;
		connection.clients = { remoteSocket: { playerId: 5, clientId: 50 } };
		voice.onPeerData('remoteSocket', { impostorRadio: true, impostorRadioVersion: 1 });
		expect(voice.impostorRadioClientIds).toEqual([50]);
		voice.cleanupImpostorRadio(state, local);
		expect(voice.impostorRadioClientIds).toEqual([50]);
	});

	it('accepts TOH4E roster and private role only from the game host', () => {
		const voiceController = makeController();
		const connectionController = (voiceController as any).connectionController as ConnectionController;
		const host = makePlayer({ id: 1, clientId: 10, name: 'Host Town of Host for E' });
		const me = makePlayer({ id: 2, clientId: 20, name: 'HiddenName' });
		const state = makeState({ lobbyCode: 'TOH123', hostId: 10, players: [host, me] });
		connectionController.currentGameState = state;
		connectionController.localPLayer = me;
		connectionController.amongusUsername = 'RealName';
		(connectionController as any).clients = { hostSocket: { playerId: 1, clientId: 10 } };
		(voiceController as any).getEffectiveGameState(state);

		(voiceController as any).onPeerData('hostSocket', {
			type: 'toh4e-roster',
			lobbyCode: 'TOH123',
			players: [{ clientId: 20, name: 'RealName' }],
		});
		(voiceController as any).onPeerData('hostSocket', {
			type: 'toh4e-role',
			lobbyCode: 'TOH123',
			targetClientId: 20,
			targetPlayerId: 2,
			role: { roleId: 5, roleName: 'Jackal', isNeutralKiller: true, isKiller: true },
		});
		const effective = (voiceController as any).getEffectiveGameState(state) as AmongUsState;
		const effectiveMe = effective.players.find((player) => player.clientId === 20);

		expect(effective.mod).toBe('TOH4E');
		expect(effectiveMe?.name).toBe('RealName');
		expect(effectiveMe?.tohRole?.roleName).toBe('Jackal');
	});

	it('uses fresh host TOH4E faction data for radio and clears it on expiry', () => {
		const voice = makeController() as any;
		const connection = voice.connectionController as any;
		const host = makePlayer({ id: 1, clientId: 10, name: 'Host', isImpostor: true });
		const me = makePlayer({ id: 2, clientId: 20, name: 'Me', isImpostor: true });
		const neutral = makePlayer({ id: 3, clientId: 30, name: 'Neutral', isImpostor: true });
		const state = makeState({ mod: 'TOH4E', hostId: 10, players: [host, me, neutral] });
		connection.currentGameState = state;
		connection.localPLayer = me;
		connection.amongusUsername = 'Me';
		connection.lobbySettings = { ...defaultLobbySettings, impostorRadioEnabled: true };
		connection.clients = { hostSocket: { playerId: 1, clientId: 10 }, otherSocket: { playerId: 3, clientId: 30 } };
		voice.getEffectiveGameState(state);
		const catalog = [{
			roleId: 5, roleName: 'Assassin', displayName: 'アサシン', customRoleType: 'Impostor', isKiller: true,
		}];
		voice.onPeerData('otherSocket', { type: 'toh4e-lobby', lobbyCode: 'ABCD', enabled: true, roleCatalog: catalog });
		expect(voice.getEffectiveGameState(state).tohRoleCatalog).toEqual([]);
		voice.onPeerData('hostSocket', { type: 'toh4e-lobby', lobbyCode: 'ABCD', enabled: true, roleCatalog: [{ bad: true }] });
		expect(voice.getEffectiveGameState(state).tohRoleCatalog).toEqual([]);
		voice.onPeerData('hostSocket', { type: 'toh4e-lobby', lobbyCode: 'ABCD', enabled: true, roleCatalog: catalog });
		voice.onPeerData('hostSocket', {
			type: 'toh4e-role', lobbyCode: 'ABCD', targetClientId: 20, targetPlayerId: 2,
			role: { roleId: 5, roleName: 'Assassin', isNeutralKiller: false, isKiller: true, customRoleType: 'Impostor' },
			impostors: [{ playerId: 2, clientId: 20, isImpostor: 'true' }],
		});
		expect(voice.getEffectiveGameState(state).players.find((player: Player) => player.clientId === 20)?.isImpostor).toBeFalse();
		voice.onPeerData('hostSocket', {
			type: 'toh4e-role', lobbyCode: 'ABCD', targetClientId: 20, targetPlayerId: 2,
			role: { roleId: 5, roleName: 'Assassin', isNeutralKiller: false, isKiller: true, customRoleType: 'Impostor' },
			impostors: [
				{ playerId: 1, clientId: 10, isImpostor: true },
				{ playerId: 2, clientId: 20, isImpostor: true },
				{ playerId: 3, clientId: 30, isImpostor: false },
			],
		});
		const effective = voice.getEffectiveGameState(state) as AmongUsState;
		const effectiveMe = effective.players.find((player) => player.clientId === 20) as Player;
		const effectiveNeutral = effective.players.find((player) => player.clientId === 30) as Player;
		expect(effective.tohRoleCatalog?.[0].roleName).toBe('Assassin');
		expect(effectiveMe.isImpostor).toBeTrue();
		expect(effectiveNeutral.isImpostor).toBeFalse();
		expect(voice.canUseRadio(effective, effectiveMe)).toBeTrue();
		expect(voice.areRadioTeammates(effective, effectiveMe, effectiveNeutral)).toBeFalse();

		voice.tohRoleReceivedAt = Date.now() - 6000;
		voice.tohCatalogReceivedAt = Date.now() - 6000;
		const expired = voice.getEffectiveGameState(state) as AmongUsState;
		expect(expired.players.find((player) => player.clientId === 20)?.isImpostor).toBeFalse();
		expect(expired.tohRoleCatalog).toEqual([]);
	});

	it('copies per-role TOH4E settings and falls back for older hosts', () => {
		const voice = makeController() as any;
		const connection = voice.connectionController as ConnectionController;
		voice.onLobbySettingsChange({ ...defaultLobbySettings, tohGhostRoles: { Jackal: true } });
		expect(connection.lobbySettings.tohGhostRoles).toEqual({ Jackal: true });
		voice.onLobbySettingsChange({ ...defaultLobbySettings, tohNeutralKillerHaunting: true });
		expect(connection.lobbySettings.tohGhostRoles).toBeUndefined();
		expect(connection.lobbySettings.tohNeutralKillerHaunting).toBeTrue();
	});

	it('warns when the desktop host runs a newer release and ignores malformed versions', () => {
		const voiceController = makeController();
		const connectionController = (voiceController as any).connectionController as ConnectionController;
		const host = makePlayer({ id: 1, clientId: 10, name: 'Host' });
		const me = makePlayer({ id: 2, clientId: 20, name: 'Me' });
		connectionController.currentGameState = makeState({ lobbyCode: 'VER123', hostId: 10, players: [host, me] });
		connectionController.localPLayer = me;
		(connectionController as any).clients = { hostSocket: { playerId: 1, clientId: 10 } };

		(voiceController as any).onPeerData('hostSocket', { type: 'app-version', lobbyCode: 'VER123', version: '3.3' });
		expect(voiceController.versionWarning).toBe('');
		(voiceController as any).onPeerData('hostSocket', { type: 'app-version', lobbyCode: 'OTHER', version: '99.0.0' });
		expect(voiceController.versionWarning).toBe('');

		(voiceController as any).onPeerData('hostSocket', { type: 'app-version', lobbyCode: 'VER123', version: '99.0.0' });
		expect(voiceController.versionWarning).toContain('Host（v99.0.0）');
		expect(voiceController.versionWarning).toContain('ホストはv99.0.0です');
	});

	it('grants transmission for a living impostor during TASKS when radio is enabled', () => {
		const voiceController = makeController();
		const connectionController = (voiceController as any).connectionController as ConnectionController;
		const me = makePlayer({ id: 1, clientId: 1, isImpostor: true, isDead: false });
		readyState(connectionController, me);

		voiceController.applyImpostorRadio(true);

		expect(connectionController.audioController.radioTransmitting).toBeTrue();
		expect((voiceController as any).impostorRadioClientId).toBe(1);
	});

	it('does not grant transmission when impostorRadioEnabled is off', () => {
		const voiceController = makeController();
		const connectionController = (voiceController as any).connectionController as ConnectionController;
		const me = makePlayer({ id: 1, clientId: 1, isImpostor: true, isDead: false });
		readyState(connectionController, me);
		connectionController.lobbySettings.impostorRadioEnabled = false;

		voiceController.applyImpostorRadio(true);

		expect(connectionController.audioController.radioTransmitting).toBeFalse();
	});

	it('does not grant transmission for crew', () => {
		const voiceController = makeController();
		const connectionController = (voiceController as any).connectionController as ConnectionController;
		const me = makePlayer({ id: 1, clientId: 1, isImpostor: false, isDead: false });
		readyState(connectionController, me);

		voiceController.applyImpostorRadio(true);

		expect(connectionController.audioController.radioTransmitting).toBeFalse();
	});

	it('does not grant transmission for a dead impostor', () => {
		const voiceController = makeController();
		const connectionController = (voiceController as any).connectionController as ConnectionController;
		const me = makePlayer({ id: 1, clientId: 1, isImpostor: true, isDead: true });
		readyState(connectionController, me);

		voiceController.applyImpostorRadio(true);

		expect(connectionController.audioController.radioTransmitting).toBeFalse();
	});

	it('releases transmission and broadcasts the release to peers', () => {
		const voiceController = makeController();
		const connectionController = (voiceController as any).connectionController as ConnectionController;
		const me = makePlayer({ id: 1, clientId: 1, isImpostor: true, isDead: false });
		const other = makePlayer({ id: 2, clientId: 2, isImpostor: true });
		readyState(connectionController, me, [other]);
		(connectionController as any).clients = { 'socket-2': { playerId: 2, clientId: 2 } };
		const sendSpy = spyOn(connectionController, 'sendToPeers');

		voiceController.applyImpostorRadio(true);
		sendSpy.calls.reset();
		voiceController.applyImpostorRadio(false);

		expect(connectionController.audioController.radioTransmitting).toBeFalse();
		expect((voiceController as any).impostorRadioClientId).toBe(-1);
		const [targets, payload] = sendSpy.calls.mostRecent().args;
		expect(targets).toEqual(['socket-2']);
		expect(JSON.parse(payload)).toEqual({ impostorRadio: false, impostorRadioVersion: jasmine.any(Number) });
	});

	it('excludes bugged players from radio broadcast targets', () => {
		const voiceController = makeController();
		const connectionController = (voiceController as any).connectionController as ConnectionController;
		const me = makePlayer({ id: 1, clientId: 1, isImpostor: true, isDead: false });
		const buggedPlayer = makePlayer({ id: 2, clientId: 2, bugged: true });
		readyState(connectionController, me, [buggedPlayer]);
		(connectionController as any).clients = { 'socket-2': { playerId: 2, clientId: 2 } };
		const sendSpy = spyOn(connectionController, 'sendToPeers');

		voiceController.applyImpostorRadio(true);

		const [targets, payload] = sendSpy.calls.mostRecent().args;
		expect(targets).toEqual([]);
		expect(JSON.parse(payload)).toEqual({ impostorRadio: true, impostorRadioVersion: jasmine.any(Number) });
	});

	describe('cleanupImpostorRadio', () => {
		it('clears radio state once the transmitting impostor is no longer valid (dead)', () => {
			const voiceController = makeController();
			const connectionController = (voiceController as any).connectionController as ConnectionController;
			const me = makePlayer({ id: 1, clientId: 1, isImpostor: true });
			const transmitter = makePlayer({ id: 2, clientId: 2, isImpostor: true, isDead: true });
			(voiceController as any).impostorRadioClientId = 2;
			(connectionController as any).clients = { 'socket-2': { playerId: 2, clientId: 2 } };
			connectionController.audioController.addPeer('socket-2', createSilentStream());

			const state = makeState({ players: [me, transmitter] });
			(voiceController as any).cleanupImpostorRadio(state, me);

			expect((voiceController as any).impostorRadioClientId).toBe(-1);
		});

		it('leaves radio state alone while the transmitting impostor is still alive and connected', () => {
			const voiceController = makeController();
			const connectionController = (voiceController as any).connectionController as ConnectionController;
			const me = makePlayer({ id: 1, clientId: 1, isImpostor: true });
			const transmitter = makePlayer({ id: 2, clientId: 2, isImpostor: true, isDead: false });
			(voiceController as any).impostorRadioClientId = 2;
			(connectionController as any).clients = { 'socket-2': { playerId: 2, clientId: 2 } };
			connectionController.lobbySettings = { ...defaultLobbySettings, impostorRadioEnabled: true };
			connectionController.audioController.addPeer('socket-2', createSilentStream());

			const state = makeState({ players: [me, transmitter] });
			(voiceController as any).cleanupImpostorRadio(state, me);

			expect((voiceController as any).impostorRadioClientId).toBe(2);
		});

		it('clears radio state once the round leaves TASKS', () => {
			const voiceController = makeController();
			const me = makePlayer({ id: 1, clientId: 1 });
			(voiceController as any).impostorRadioClientId = 2;

			const state = makeState({ gameState: GameState.DISCUSSION, players: [me] });
			(voiceController as any).cleanupImpostorRadio(state, me);

			expect((voiceController as any).impostorRadioClientId).toBe(-1);
		});
	});

	describe('onPeerData', () => {
		it('adopts the first incoming impostorRadio:true as the active transmitter', () => {
			const voiceController = makeController();
			const connectionController = (voiceController as any).connectionController as ConnectionController;
			const me = makePlayer({ id: 1, clientId: 1, isImpostor: true });
			const sender = makePlayer({ id: 2, clientId: 2, isImpostor: true });
			readyState(connectionController, me, [sender]);
			(connectionController as any).clients = { 'socket-2': { playerId: 2, clientId: 2 } };

			(voiceController as any).onPeerData('socket-2', { impostorRadio: true });

			expect((voiceController as any).impostorRadioClientId).toBe(2);
		});

		it('ignores a second transmitter while one is already active', () => {
			const voiceController = makeController();
			const connectionController = (voiceController as any).connectionController as ConnectionController;
			(connectionController as any).clients = {
				'socket-2': { playerId: 2, clientId: 2 },
				'socket-3': { playerId: 3, clientId: 3 },
			};
			(voiceController as any).impostorRadioClientId = 2;

			(voiceController as any).onPeerData('socket-3', { impostorRadio: true });

			expect((voiceController as any).impostorRadioClientId).toBe(2);
		});

		it('clears the active transmitter when it releases', () => {
			const voiceController = makeController();
			const connectionController = (voiceController as any).connectionController as ConnectionController;
			const me = makePlayer({ id: 1, clientId: 1, isImpostor: true });
			const sender = makePlayer({ id: 2, clientId: 2, isImpostor: true });
			readyState(connectionController, me, [sender]);
			(connectionController as any).clients = { 'socket-2': { playerId: 2, clientId: 2 } };
			(voiceController as any).impostorRadioClientId = 2;

			(voiceController as any).onPeerData('socket-2', { impostorRadio: false });

			expect((voiceController as any).impostorRadioClientId).toBe(-1);
		});
	});
});

describe('VoiceController desktop 3.2.0 compatibility', () => {
	it('degrades to default lobby settings instead of throwing when the host sends none (3.2.0 payload shape)', () => {
		// Desktop 3.2.0 sent this payload under `activeLobbySettings` instead of `lobbySettings`,
		// so `lobbySettings` is undefined here - the same shape a 3.2.0 host produces today.
		const connectionController = new ConnectionController({} as SettingsService);
		const fakeSettingsService = {
			get: () => ({ ghostVolumeAsImpostor: 10, crewVolumeAsGhost: 100, masterVolume: 100, enableSpatialAudio: true }),
			getPlayerSettings: () => ({ volume: 100 }),
		} as unknown as SettingsService;
		new VoiceController(connectionController, new MobileHostService(connectionController), fakeSettingsService);
		connectionController.amongusUsername = 'Guus';
		connectionController.connectionState = ConnectionState.connecting;
		(connectionController as any).socketIOClient = {
			emit: jasmine.createSpy('emit'),
			on: jasmine.createSpy('on'),
		};

		const me = makePlayer({ id: 1, clientId: 1, name: 'Guus' });
		const state = makeState({ players: [me] });

		expect(() => {
			(connectionController.events as any).emit('hostUpdate', state, undefined);
		}).not.toThrow();

		expect(connectionController.connectionState as ConnectionState).not.toBe(ConnectionState.error);
		expect(connectionController.error).toBeUndefined();
		expect(connectionController.lobbySettings).toEqual(defaultLobbySettings);
		expect(connectionController.localPLayer).toBe(me);
	});
});

describe('VoiceController account identity', () => {
	it('re-claims friendCode/playerUid/playerIdentifier with the id event when the local player changes', () => {
		const fakeSettingsService = {
			get: () => ({ ghostVolumeAsImpostor: 10, crewVolumeAsGhost: 100, masterVolume: 100, enableSpatialAudio: true }),
			getPlayerSettings: () => ({ volume: 100, isMuted: false }),
		} as unknown as SettingsService;
		const connectionController = new ConnectionController(fakeSettingsService);
		new VoiceController(connectionController, new MobileHostService(connectionController), fakeSettingsService);
		const emitSpy = jasmine.createSpy('emit');
		(connectionController as any).socketIOClient = { emit: emitSpy };
		connectionController.amongusUsername = 'Guus';
		connectionController.connectionState = ConnectionState.conencted;
		// Prime a different local player so onGameState takes the identity re-claim branch.
		connectionController.localPLayer = makePlayer({ id: 1, clientId: 1, name: 'Guus' });

		const me = makePlayer({
			id: 2,
			clientId: 2,
			name: 'Guus',
			friendCode: 'ABC#1234',
			playerUid: 'puid-abc',
			playerIdentifier: 'puid-abc',
		});
		(connectionController.events as any).emit('hostUpdate', makeState({ players: [me] }), defaultLobbySettings);

		// Regression: this used to be emit('id', id, clientId) only, so the server saw us as a
		// pre-3.2.0 client with no account identity (no puid-based bans/spoof detection).
		expect(emitSpy).toHaveBeenCalledWith('id', 2, 2, 'ABC#1234', 'puid-abc', 'puid-abc');
	});
});

describe('playerSettingsKey', () => {
	it('prefers playerConfigId over nameHash', () => {
		expect(playerSettingsKey(makePlayer({ playerConfigId: 42, nameHash: 7 }))).toBe(42);
	});

	it('falls back to nameHash when the host sent no playerConfigId', () => {
		expect(playerSettingsKey(makePlayer({ playerConfigId: undefined, nameHash: 7 }))).toBe(7);
	});
});

describe('VoiceController per-player mute', () => {
	it('silences a muted player regardless of spatial gain', () => {
		const mutedSettings = { volume: 100, isMuted: true };
		const fakeSettingsService = {
			get: () => ({
				ghostVolumeAsImpostor: 10,
				crewVolumeAsGhost: 100,
				masterVolume: 100,
				enableSpatialAudio: true,
			}),
			getPlayerSettings: () => mutedSettings,
		} as unknown as SettingsService;

		const connectionController = new ConnectionController(fakeSettingsService);
		new VoiceController(connectionController, new MobileHostService(connectionController), fakeSettingsService);
		connectionController.amongusUsername = 'Guus';
		const me = makePlayer({ id: 1, clientId: 1, name: 'Guus' });
		const other = makePlayer({ id: 2, clientId: 2, name: 'Other', x: 1, y: 0 });
		connectionController.localPLayer = me;
		connectionController.currentGameState = makeState({ players: [me, other] });
		(connectionController as any).clients = { 'socket-2': { playerId: 2, clientId: 2 } };
		connectionController.audioController.addPeer('socket-2', createSilentStream());

		(connectionController.events as any).emit(
			'hostUpdate',
			connectionController.currentGameState,
			defaultLobbySettings
		);

		expect((connectionController.audioController as any).peers.get('socket-2').gain.gain.value).toBe(0);
	});
});

describe('VoiceController getRenderablePlayers', () => {
	function makeFakeSettingsService(): SettingsService {
		return {
			get: () => ({ ghostVolumeAsImpostor: 10, crewVolumeAsGhost: 100, masterVolume: 100, enableSpatialAudio: true }),
			getPlayerSettings: () => ({ volume: 100, isMuted: false }),
		} as unknown as SettingsService;
	}

	function setup(
		others: Player[],
		clients: Record<string, { playerId: number; clientId: number }> = {},
		meOverrides: Partial<Player> = {}
	): { voiceController: VoiceController; connectionController: ConnectionController; me: Player } {
		const settingsService = makeFakeSettingsService();
		const connectionController = new ConnectionController(settingsService);
		const voiceController = new VoiceController(
			connectionController,
			new MobileHostService(connectionController),
			settingsService
		);
		const me = makePlayer({ id: 1, clientId: 1, name: 'Guus', ...meOverrides });
		connectionController.localPLayer = me;
		connectionController.currentGameState = makeState({ players: [me, ...others] });
		(connectionController as any).clients = clients;
		return { voiceController, connectionController, me };
	}

	it('includes players with no voice client and flags them disconnected', () => {
		const offline = makePlayer({ id: 2, clientId: 2, colorId: 5 });
		const { voiceController } = setup([offline], {});

		const players = voiceController.getRenderablePlayers();

		expect(players.length).toBe(1);
		expect(players[0].player).toBe(offline);
		expect(players[0].connectionState).toBe('disconnected');
	});

	it('flags a player on the voice server without an audio peer as novoice', () => {
		const waiting = makePlayer({ id: 2, clientId: 2, colorId: 5 });
		const { voiceController } = setup([waiting], { 'socket-2': { playerId: 2, clientId: 2 } });

		expect(voiceController.getRenderablePlayers()[0].connectionState).toBe('novoice');
	});

	it('flags a player with an established audio peer as connected', () => {
		const connected = makePlayer({ id: 2, clientId: 2, colorId: 5 });
		const { voiceController, connectionController } = setup([connected], {
			'socket-2': { playerId: 2, clientId: 2 },
		});
		connectionController.audioController.addPeer('socket-2', createSilentStream());

		expect(voiceController.getRenderablePlayers()[0].connectionState).toBe('connected');
	});

	it('treats a client whose clientId no longer matches the player as disconnected', () => {
		const stale = makePlayer({ id: 2, clientId: 2, colorId: 5 });
		// The socket map still has an entry for clientId 2, but the client there claims another id.
		const { voiceController } = setup([stale], { 'socket-2': { playerId: 9, clientId: 9 } });

		expect(voiceController.getRenderablePlayers()[0].connectionState).toBe('disconnected');
	});

	it('never includes the local player', () => {
		const { voiceController } = setup([]);

		expect(voiceController.getRenderablePlayers()).toEqual([]);
	});

	it('latches the dead state of disconnected players even though they have no peer', () => {
		const offlineDead = makePlayer({ id: 2, clientId: 2, colorId: 5, isDead: true });
		const { voiceController, connectionController } = setup([offlineDead], {}, { isDead: true });
		const state = connectionController.currentGameState;

		// Used to run only inside updatePeerAudio, which skips players without a peer.
		(voiceController as any).updatePlayerDeadStates(state, connectionController.localPLayer);

		const players = voiceController.getRenderablePlayers();
		expect(players[0].isDead).toBeTrue();
		expect(players[0].connectionState).toBe('disconnected');
	});

	it('sorts players by colorId', () => {
		const lime = makePlayer({ id: 2, clientId: 2, colorId: 9 });
		const red = makePlayer({ id: 3, clientId: 3, colorId: 0 });
		const { voiceController } = setup([lime, red]);

		expect(voiceController.getRenderablePlayers().map((item) => item.player.colorId)).toEqual([0, 9]);
	});
});
