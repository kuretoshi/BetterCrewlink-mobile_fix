import { AmongUsState, GameState, Player } from '../common/AmongUsState';
import { CameraLocation, MapType } from '../common/AmongusMap';
import { ILobbySettings, ISettings } from '../common/ISettings';
import { PlayerSettingsMap } from '../services/smallInterfaces';
import type { NosPlayerData } from '../common/NosSnapshot';
import { defaultLobbySettings } from './types';
import { calculateVoiceAudio, VoiceAudioInput, voiceHearingDistance } from './spatialAudio';
import { selectVoiceEffect, shouldApplyRainbowStarEcho } from './voiceEffectRules';

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

function makeSettings(overrides: Partial<ISettings> = {}): ISettings {
	return {
		appPlayerLayout: 'standard',
		snrPushReverbStrength: 100,
		voiceServerOption: 1,
		customVoiceServer: '',
		username: '',
		gamecode: '',
		selectedMicrophone: { id: 0, label: 'default', deviceId: 'default', kind: 'audioinput' },
		selectedSpeaker: undefined,
		natFix: false,
		playerSettings: new PlayerSettingsMap(),
		overlayEnabled: false,
		isMobile: true,
		ghostVolumeAsImpostor: 10,
		crewVolumeAsGhost: 100,
		masterVolume: 100,
		enableSpatialAudio: true,
		echoCancellation: true,
		noiseSuppression: true,
		autoGainControl: false,
		microphoneGain: 100,
		microphoneGainEnabled: false,
		micSensitivity: 0.15,
		micSensitivityEnabled: false,
		voiceEffectStrength: 100,
		snrJumboVoiceEffectStrength: 100,
		nosSizeVoiceEffectStrength: 100,
		nosRokurokubiVoiceEffectStrength: 100,
		nosBerserkerVoiceEffectStrength: 100,
		nosCitrusVoiceEffectStrength: 100,
		nosRainbowStarEchoStrength: 100,
		nosVoiceJammingEffectStrength: 100,
		nosMegaphoneEffectStrength: 100,
		nosBibiriEchoStrength: 100,
		...overrides,
	};
}

function makeLobbySettings(overrides: Partial<ILobbySettings> = {}): ILobbySettings {
	return { ...defaultLobbySettings, ...overrides };
}

function makeNosPlayer(overrides: Partial<NosPlayerData> = {}): NosPlayerData {
	return {
		playerId: 2,
		name: 'NoS',
		isKiller: false,
		isImpostor: false,
		isCrewmate: true,
		isNeutral: false,
		isImpostorlike: false,
		speakerPositionX: 1,
		speakerPositionY: 0,
		colorR: 1,
		colorG: 0,
		colorB: 0,
		...overrides,
	};
}

/** `me` is always id/clientId 1 (local, alive, crew); `other` is id/clientId 2, 1 unit away. */
function run(overrides: Partial<VoiceAudioInput> = {}) {
	return calculateVoiceAudio({
		state: makeState(),
		settings: makeSettings(),
		activeLobbySettings: makeLobbySettings(),
		me: makePlayer({ id: 1, clientId: 1, isLocal: true }),
		other: makePlayer({ id: 2, clientId: 2, x: 1, y: 0 }),
		maxDistance: 5.32,
		impostorRadioClientId: -1,
		...overrides,
	});
}

describe('NoS UchuAddon Gluttony swallow voice', () => {
	const state = makeState({ mod: 'NoS', nosAddonIds: ['UchuAddon'] });
	const swallowed = makePlayer({ id: 2, clientId: 2, x: 1,
		nosPlayer: makeNosPlayer({ speakerPositionX: 1000, speakerPositionY: 1000 }) });
	const lobby = makeLobbySettings();
	const voice = (changes: Partial<VoiceAudioInput> = {}) =>
		run({ state, other: swallowed, activeLobbySettings: lobby, ...changes });

	it('defaults to mute with old and new lobby payloads, whether NoS positions are enabled or not', () => {
		expect(voice().gain).toBe(0);
		expect(voice({ activeLobbySettings: makeLobbySettings({ nosVoicePositions: true }) }).gain).toBe(0);
		expect(voice({ activeLobbySettings: {
			...lobby, nosGluttonySwallowVoice: undefined,
		} }).gain).toBe(0);
	});

	it('makes swallowed speech quiet and muffled, including with NoS positions enabled', () => {
		for (const nosVoicePositions of [false, true]) {
			const result = voice({ activeLobbySettings: makeLobbySettings({
				nosVoicePositions, nosGluttonySwallowVoice: 'quiet',
			}) });
			expect(result.gain).toBe(0.1);
			expect(result.muffle).toEqual({ type: 'lowpass', frequency: 450, q: Math.SQRT1_2 });
		}
	});

	it('allows normal nearby speech even when the NoS speaker position is a swallow sentinel', () => {
		for (const nosVoicePositions of [false, true]) {
			expect(voice({ activeLobbySettings: makeLobbySettings({
				nosVoicePositions, nosGluttonySwallowVoice: 'normal',
			}) }).gain).toBe(1);
		}
	});

	it('only applies to living swallowed players during NoS tasks with UchuAddon', () => {
		expect(voice({ other: { ...swallowed, nosPlayer: makeNosPlayer() } }).gain).toBe(1);
		expect(voice({ state: { ...state, nosAddonIds: [] } }).gain).toBe(1);
		expect(voice({ state: { ...state, gameState: GameState.DISCUSSION } }).gain).toBe(1);
		expect(voice({ other: { ...swallowed, isDead: true },
			me: makePlayer({ id: 1, clientId: 1, isDead: true }) }).gain).toBe(1);
	});

	it('also controls megaphone and radio bypass paths', () => {
		const megaphoneState = makeState({ ...state, nosAddonIds: ['UchuAddon', 'tanuki.bcl.roles'],
			nosMegaphones: [{ playerId: 2, range: 5, energy: 100 }] });
		expect(voice({ state: megaphoneState }).gain).toBe(0);
		const megaphoneQuiet = voice({ state: megaphoneState,
			activeLobbySettings: makeLobbySettings({ nosGluttonySwallowVoice: 'quiet' }) });
		expect(megaphoneQuiet.gain).toBeGreaterThan(0);
		expect(megaphoneQuiet.gain).toBeLessThanOrEqual(0.1);
		expect(megaphoneQuiet.muffle).toEqual({ type: 'lowpass', frequency: 450, q: Math.SQRT1_2 });

		const radio = { other: { ...swallowed, isImpostor: true }, impostorRadioClientId: 2,
			nosImpostorRadioHearable: true };
		expect(voice({ ...radio, activeLobbySettings: makeLobbySettings({
			impostorRadioEnabled: true,
		}) }).gain).toBe(0);
		const radioQuiet = voice({ ...radio, activeLobbySettings: makeLobbySettings({
			impostorRadioEnabled: true, nosGluttonySwallowVoice: 'quiet',
		}) });
		expect(radioQuiet.gain).toBe(0.1);
		expect(radioQuiet.muffle).toEqual({ type: 'lowpass', frequency: 450, q: Math.SQRT1_2 });
	});
});

describe('NoS Rokurokubi head positions', () => {
	const role = { roleId: 1, roleName: 'rokurokubi', displayName: 'Rokurokubi', runtimeClass: 'Rokurokubi.Instance' };
	const state = makeState({ mod: 'NoS', nosLocalMicPosition: { x: 20, y: 0 } });

	for (const identity of [{ nosRole: role }, { nosPlayer: makeNosPlayer({ bodyType: 3 }) }]) {
		it(`follows the host microphone with the position option off (${Object.keys(identity)[0]})`, () => {
			const result = run({ state, me: makePlayer({ isLocal: true, ...identity }), other: makePlayer({ x: 21 }) });
			expect(result.gain).toBeGreaterThan(0);
			expect(result.panPosition).toEqual([1, 0]);
		});
	}
	it('follows the remote head with the option off', () => {
		const result = run({ state, me: makePlayer({ x: 20 }),
			other: makePlayer({ x: 60, nosRole: role, nosPlayer: makeNosPlayer({ speakerPositionX: 21 }) }) });
		expect(result.gain).toBeGreaterThan(0);
		expect(result.panPosition).toEqual([1, 0]);
	});
	for (const enabled of [false, true]) {
		it(`uses the selected mobile guest's own head, not the host microphone (general=${enabled})`, () => {
			const result = run({ state: makeState({ mod: 'NoS', nosLocalMicPosition: { x: 999, y: 999 } }),
				me: makePlayer({ isLocal: false, nosRole: role, nosPlayer: makeNosPlayer({ speakerPositionX: 20 }) }),
				other: makePlayer({ x: 21, nosPlayer: makeNosPlayer({ speakerPositionX: 21 }) }),
				activeLobbySettings: makeLobbySettings({ nosVoicePositions: enabled }) });
			expect(result.gain).toBeGreaterThan(0);
			expect(result.panPosition).toEqual([1, 0]);
		});
	}
	it('uses ordinary selected guest endpoints when general NoS positions are enabled', () => {
		const result = run({ state, me: makePlayer({ isLocal: false, nosPlayer: makeNosPlayer({ speakerPositionX: 40 }) }),
			other: makePlayer({ nosPlayer: makeNosPlayer({ speakerPositionX: 41 }) }),
			activeLobbySettings: makeLobbySettings({ nosVoicePositions: true }) });
		expect(result.panPosition).toEqual([1, 0]);
	});
	it('keeps ordinary body positions when the option is off', () => {
		expect(run({ state, other: makePlayer({ x: 21 }) }).gain).toBe(0);
	});
	for (const invalid of [NaN, Infinity, -Infinity]) {
		it(`falls back to body coordinates for invalid head endpoints (${invalid})`, () => {
			const result = run({ state: makeState({ mod: 'NoS', nosLocalMicPosition: { x: invalid, y: 0 } }),
				me: makePlayer({ isLocal: true, nosRole: role }),
				other: makePlayer({ x: 1, nosRole: role, nosPlayer: makeNosPlayer({ speakerPositionX: invalid }) }) });
			expect(result.gain).toBeGreaterThan(0);
			expect(result.panPosition).toEqual([1, 0]);
		});
	}
	it('keeps death, disconnect and non-NoS hearing restrictions', () => {
		for (const overrides of [{ isDead: true }, { disconnected: true }]) {
			expect(run({ state, other: makePlayer({ x: 60, nosRole: role,
				nosPlayer: makeNosPlayer({ speakerPositionX: 1 }), ...overrides }) }).gain).toBe(0);
		}
		expect(run({ state: makeState(), me: makePlayer({ isLocal: true, nosRole: role }),
			other: makePlayer({ x: 21 }) }).gain).toBe(0);
	});
	it('keeps meeting conversation centered', () => {
		const result = run({ state: { ...state, gameState: GameState.DISCUSSION },
			me: makePlayer({ isLocal: true, nosRole: role }), other: makePlayer({ x: 21 }) });
		expect(result.gain).toBeGreaterThan(0);
		expect(result.panPosition).toEqual([0, 0]);
	});
});

describe('NoS neutral voice hearing distance', () => {
	const lobby = makeLobbySettings({ maxDistance: 5.32, visionHearing: true });
	const state = makeState({ mod: 'NoS', map: MapType.AIRSHIP, lightRadius: 30 });

	it('uses the lobby voice range for both NoS neutral classifications', () => {
		expect(voiceHearingDistance(state, lobby, makePlayer({ isThirdParty: true }))).toBe(5.32);
		expect(voiceHearingDistance(state, lobby, makePlayer({
			nosPlayer: makeNosPlayer({ isNeutral: true, isCrewmate: false }),
		}))).toBe(5.32);
	});

	it('keeps the crew vision range, impostor lobby range, and other-mod behavior', () => {
		expect(voiceHearingDistance(state, lobby, makePlayer())).toBe(30.5);
		expect(voiceHearingDistance(state, lobby, makePlayer({ isImpostor: true }))).toBe(5.32);
		expect(voiceHearingDistance(makeState({ mod: 'SUPER_NEW_ROLES', lightRadius: 30 }), lobby,
		makePlayer({ isThirdParty: true }))).toBe(30.5);
	});

	it('does not hear an Archive-to-Cockpit-scale conversation through a large neutral sight radius', () => {
		const me = makePlayer({ id: 1, isLocal: true, isThirdParty: true, x: 0, y: 0 });
		const other = makePlayer({ id: 2, clientId: 2, x: 20, y: 0 });
		const maxDistance = voiceHearingDistance(state, lobby, me);
		expect(run({ state, me, other, activeLobbySettings: lobby, maxDistance }).gain).toBe(0);
		expect(run({ state, me, other: { ...other, x: 4 }, activeLobbySettings: lobby, maxDistance }).gain).toBe(1);
	});
});

describe('calculateVoiceAudio', () => {
	it('hides only an active SNR or NoS Busker from living impostors when enabled', () => {
		const me = makePlayer({ id: 1, clientId: 1, isImpostor: true });
		for (const mod of ['SUPER_NEW_ROLES', 'NoS'] as const) {
			const activeLobbySettings = makeLobbySettings({ haunting: true,
				snrBuskerReviveHideVoice: true, nosBuskerReviveHideVoice: true });
			const other = makePlayer({ id: 2, clientId: 2, x: 1, isDead: true,
				...(mod === 'NoS'
					? { nosRole: { roleId: 1, roleName: 'busker', displayName: 'Busker', runtimeClass: 'Busker.Ability',
						}, nosIsPseudocide: true }
					: { snrRole: { role: { name: 'Busker', value: 1 }, modifier: null, ghostRole: null,
						buskerPseudocideActive: true } }) });
			const state = makeState({ mod });
			expect(run({ state, me, other, activeLobbySettings }).gain).toBe(0);
			const expired = mod === 'NoS'
				? makePlayer({ ...other, nosIsPseudocide: false })
				: makePlayer({ ...other, snrRole: { ...other.snrRole!, buskerPseudocideActive: false } });
			expect(run({ state, me, other: expired, activeLobbySettings }).gain).toBeGreaterThan(0);
			if (mod === 'NoS') {
				expect(run({ state, me, other: { ...other, nosIsPseudocide: false }, activeLobbySettings }).gain)
					.toBeGreaterThan(0);
				expect(run({ state, me, other: { ...other, nosIsPseudocide: undefined }, activeLobbySettings }).gain)
					.toBeGreaterThan(0);
				expect(run({ state, me, other: { ...expired, isDead: false, nosIsPseudocide: true },
					activeLobbySettings }).gain).toBe(0);
			}
			if (mod === 'SUPER_NEW_ROLES') {
				expect(run({ state, me, other: { ...other,
					snrRole: { ...other.snrRole!, buskerPseudocideActive: false } }, activeLobbySettings }).gain)
					.toBeGreaterThan(0);
				expect(run({ state, me, other: { ...other,
					snrRole: { ...other.snrRole!, buskerPseudocideActive: undefined } }, activeLobbySettings }).gain)
					.toBeGreaterThan(0);
				expect(run({ state, me, other: { ...expired, isDead: false,
					snrRole: { ...expired.snrRole!, buskerPseudocideActive: true } }, activeLobbySettings }).gain)
					.toBe(0);
			}
			expect(run({ state, me, other, activeLobbySettings: makeLobbySettings({ haunting: true }) }).gain)
				.toBeGreaterThan(0);
		}
	});
	it('keeps SNR falling speech audible while independently controlling reverb', () => {
		const state = makeState({ mod: 'SUPER_NEW_ROLES' });
		const other = makePlayer({ id: 2, clientId: 2, x: 100, isDead: true,
			snrPushedFalling: true, snrPushOrigin: { x: 1, y: 0 } });
		const enabled = run({ state, other, settings: makeSettings({ snrPushReverbStrength: 25 }) });
		expect(enabled.gain).toBeGreaterThan(0);
		expect(enabled.reverb).toBeTrue();
		expect(enabled.reverbStrength).toBe(25);
		const disabled = run({ state, other, activeLobbySettings: makeLobbySettings({ snrPushReverb: false }) });
		expect(disabled.reverb).toBeFalse();
		expect(disabled.gain).toBe(enabled.gain);
		const ended = run({ state, other: { ...other, snrPushedFalling: false } });
		expect(ended.gain).toBe(0);
	});
	for (const gameState of [GameState.TASKS, GameState.DISCUSSION]) {
		for (const isDead of [false, true]) {
			it(`uses the NoS impostor mask instead of role or ghost bypass, phase=${gameState}, dead=${isDead}`, () => {
				for (const isImpostor of [false, true]) {
					for (const x of [1, 50]) {
						for (const permitted of [false, true]) {
							const result = run({
								state: makeState({ mod: 'NoS', gameState }),
								me: makePlayer({ id: 2, clientId: 20, isImpostor, isDead }),
								other: makePlayer({ id: 5, clientId: 50, isImpostor: true, x }),
								activeLobbySettings: makeLobbySettings({ impostorRadioEnabled: true }),
								impostorRadioClientIds: [50],
								nosImpostorRadioHearable: permitted,
							});
							expect(result.gain).toBe(permitted ? 1 : 0);
							expect(result.radioEcho).toBe(permitted);
						}
					}
				}
			});
		}
	}
	it('mutes a disconnected player regardless of state', () => {
		expect(run({ other: makePlayer({ disconnected: true }) }).gain).toBe(0);
	});

	it('mutes a dummy player regardless of state', () => {
		expect(run({ other: makePlayer({ isDummy: true }) }).gain).toBe(0);
	});

	it('mutes everyone in MENU', () => {
		expect(run({ state: makeState({ gameState: GameState.MENU }) }).gain).toBe(0);
	});

	it('hears a nearby player in TASKS at full gain', () => {
		expect(run().gain).toBe(1);
	});

	it('mutes players beyond maxDistance when cameras are disabled', () => {
		const result = run({
			other: makePlayer({ id: 2, clientId: 2, x: 100, y: 0 }),
			activeLobbySettings: makeLobbySettings({ hearThroughCameras: false }),
		});
		expect(result.gain).toBe(0);
	});

	it('mutes non-impostor crew when comms sabotage is active and enabled', () => {
		const result = run({
			state: makeState({ comsSabotaged: true }),
			activeLobbySettings: makeLobbySettings({ commsSabotage: true }),
			me: makePlayer({ id: 1, clientId: 1, isLocal: true, isImpostor: false, isDead: false }),
		});
		expect(result.gain).toBe(0);
	});

	it('does not mute crew for comms sabotage when the setting is disabled', () => {
		const result = run({
			state: makeState({ comsSabotaged: true }),
			activeLobbySettings: makeLobbySettings({ commsSabotage: false }),
		});
		expect(result.gain).toBe(1);
	});

	it('mutes players in vents unless hearImpostorsInVents is enabled', () => {
		const muted = run({ other: makePlayer({ id: 2, clientId: 2, x: 1, y: 0, inVent: true }) });
		expect(muted.gain).toBe(0);

		const heard = run({
			other: makePlayer({ id: 2, clientId: 2, x: 1, y: 0, inVent: true }),
			activeLobbySettings: makeLobbySettings({ hearImpostorsInVents: true }),
		});
		expect(heard.gain).not.toBe(0);
	});

	it('applies haunting reverb and ghostVolumeAsImpostor gain for a dead player heard by a living impostor', () => {
		const result = run({
			other: makePlayer({ id: 2, clientId: 2, x: 1, y: 0, isDead: true }),
			me: makePlayer({ id: 1, clientId: 1, isLocal: true, isImpostor: true, isDead: false }),
			activeLobbySettings: makeLobbySettings({ haunting: true }),
			settings: makeSettings({ ghostVolumeAsImpostor: 25 }),
		});
		expect(result.gain).toBeCloseTo(0.25);
		expect(result.reverb).toBe(true);
	});

	it('uses TOH4E per-role ghost hearing without granting it to other factions', () => {
		const ghost = makePlayer({ id: 2, clientId: 2, isDead: true });
		const jackal = makePlayer({
			id: 1, clientId: 1, isLocal: true,
			tohRole: { roleId: 2, roleName: 'Jackal', isNeutralKiller: true, isKiller: true, customRoleType: 'Neutral' },
		});
		const settings = makeLobbySettings({ tohGhostRoles: { Jackal: true }, tohNeutralKillerHaunting: false });
		const enabled = run({ state: makeState({ mod: 'TOH4E' }), me: jackal, other: ghost, activeLobbySettings: settings });
		expect(enabled.gain).toBeGreaterThan(0);
		expect(enabled.reverb).toBeTrue();
		const disabled = run({
			state: makeState({ mod: 'TOH4E' }), me: jackal, other: ghost,
			activeLobbySettings: { ...settings, tohGhostRoles: { Jackal: false } },
		});
		expect(disabled.gain).toBe(0);
		const madmate = run({
			state: makeState({ mod: 'TOH4E' }),
			me: makePlayer({ ...jackal, tohRole: { ...jackal.tohRole, customRoleType: 'Madmate' }, isImpostor: true }),
			other: ghost,
			activeLobbySettings: { ...settings, haunting: true },
		});
		expect(madmate.gain).toBe(0);
	});

	it('mutes a dead player heard by a living player when haunting is off', () => {
		const result = run({ other: makePlayer({ id: 2, clientId: 2, x: 1, y: 0, isDead: true }) });
		expect(result.gain).toBe(0);
	});

	it('in DISCUSSION, centers panning and only lets like hear like', () => {
		const deadHearsLiving = run({
			state: makeState({ gameState: GameState.DISCUSSION }),
			me: makePlayer({ id: 1, clientId: 1, isLocal: true, isDead: true }),
			other: makePlayer({ id: 2, clientId: 2, x: 1, y: 0, isDead: false }),
		});
		expect(deadHearsLiving.gain).toBe(1);
		expect(deadHearsLiving.panPosition).toEqual([0, 0]);

		const livingHearsDead = run({
			state: makeState({ gameState: GameState.DISCUSSION }),
			other: makePlayer({ id: 2, clientId: 2, x: 1, y: 0, isDead: true }),
		});
		expect(livingHearsDead.gain).toBe(0);
	});

	it('restricts to dead-only pairs and centers panning when deadOnly is enabled', () => {
		const result = run({
			me: makePlayer({ id: 1, clientId: 1, isLocal: true, isDead: true }),
			other: makePlayer({ id: 2, clientId: 2, x: 1, y: 0, isDead: true }),
			activeLobbySettings: makeLobbySettings({ deadOnly: true }),
		});
		expect(result.gain).toBe(1);
		expect(result.panPosition).toEqual([0, 0]);
	});

	describe('impostor radio', () => {
		it('lets a living impostor hear the transmitting impostor regardless of distance', () => {
			const result = run({
				other: makePlayer({ id: 2, clientId: 2, x: 999, y: 999, isImpostor: true }),
				me: makePlayer({ id: 1, clientId: 1, isLocal: true, isImpostor: true }),
				activeLobbySettings: makeLobbySettings({ impostorRadioEnabled: true }),
				impostorRadioClientId: 2,
			});
			expect(result.gain).toBe(1);
			expect(result.muffle).toEqual({ type: 'highpass', frequency: 1000, q: 10 });
			expect(result.radioEcho).toBeTrue();
		});

		it('does not leak an impostor transmission to nearby living crew (desktop 3.2.12)', () => {
			const result = run({
				other: makePlayer({ id: 2, clientId: 2, x: 1, y: 0, isImpostor: true }),
				me: makePlayer({ id: 1, clientId: 1, isLocal: true, isImpostor: false, isDead: false }),
				activeLobbySettings: makeLobbySettings({ impostorRadioEnabled: true }),
				impostorRadioClientId: 2,
			});
			expect(result.gain).toBe(0);
		});

		it('lets ghosts hear an SNR Jackal transmission when jackal radio is enabled', () => {
			const jackal = { role: { value: 1, name: 'Jackal' }, modifier: null, ghostRole: null };
			const result = run({
				state: makeState({ mod: 'SUPER_NEW_ROLES' }),
				me: makePlayer({ id: 1, clientId: 1, isLocal: true, isDead: true }),
				other: makePlayer({ id: 2, clientId: 2, x: 999, y: 999, snrRole: jackal }),
				activeLobbySettings: makeLobbySettings({ jackalRadioEnabled: true }),
				impostorRadioClientId: 2,
			});
			expect(result.gain).toBe(1);
			expect(result.radioEcho).toBeTrue();
		});

		it('does not grant radio range when impostorRadioEnabled is off', () => {
			const result = run({
				other: makePlayer({ id: 2, clientId: 2, x: 999, y: 999, isImpostor: true }),
				me: makePlayer({ id: 1, clientId: 1, isLocal: true, isImpostor: true }),
				activeLobbySettings: makeLobbySettings({ impostorRadioEnabled: false }),
				impostorRadioClientId: 2,
			});
			expect(result.gain).toBe(0);
		});

		it('routes SNR Jackal teammates over radio regardless of distance', () => {
			const jackal = { role: { value: 1, name: 'Jackal' }, modifier: null, ghostRole: null };
			const sidekick = { role: { value: 2, name: 'Sidekick' }, modifier: null, ghostRole: null };
			const result = run({
				state: makeState({ mod: 'SUPER_NEW_ROLES' }),
				me: makePlayer({ id: 1, clientId: 1, isLocal: true, snrRole: jackal }),
				other: makePlayer({ id: 2, clientId: 2, x: 999, y: 999, snrRole: sidekick }),
				activeLobbySettings: makeLobbySettings({ jackalRadioEnabled: true }),
				impostorRadioClientId: 2,
			});
			expect(result.gain).toBe(1);
			expect(result.radioEcho).toBeTrue();
		});

		it('mutes proximity voice in radio-only mode but lets an impostor transmission through', () => {
			const settings = makeLobbySettings({ impostorRadioOnlyMode: true });
			const me = makePlayer({ id: 1, clientId: 1, isLocal: true, isImpostor: true });
			const other = makePlayer({ id: 2, clientId: 2, x: 1, isImpostor: true });
			expect(run({ me, other, activeLobbySettings: settings }).gain).toBe(0);
			const transmitting = run({ me, other, activeLobbySettings: settings, impostorRadioClientId: 2 });
			expect(transmitting.gain).toBe(1);
			expect(transmitting.radioEcho).toBeTrue();
		});
	});

	describe('mod role routing', () => {
		it('uses Fixer lowpass in both directions only when blocking is disabled', () => {
			const activeLobbySettings = makeLobbySettings({
				nosFixerJammingVoiceBlock: false,
				nosFixerJammingLowpass: true,
			});
			for (const side of ['me', 'other'] as const) {
				const jammed = makePlayer({ id: side === 'me' ? 1 : 2, clientId: side === 'me' ? 1 : 2, x: side === 'me' ? 0 : 1, nosPlayer: makeNosPlayer({ isJammed: true }) });
				const result = run({
					state: makeState({ mod: 'NoS' }),
					activeLobbySettings,
					[side]: jammed,
				});
				expect(result.gain).toBe(1);
				expect(result.muffle).toEqual({ type: 'lowpass', frequency: 1200, q: Math.SQRT1_2 });
			}
			const blocked = run({
				state: makeState({ mod: 'NoS' }),
				other: makePlayer({ id: 2, clientId: 2, x: 1, nosPlayer: makeNosPlayer({ isJammed: true }) }),
				activeLobbySettings: makeLobbySettings({ nosFixerJammingVoiceBlock: true, nosFixerJammingLowpass: true }),
			});
			expect(blocked.gain).toBe(0);
		});

		it('allows SNR Jackal teammates to talk together in vents when enabled', () => {
			const jackal = { role: { value: 1, name: 'Jackal' }, modifier: null, ghostRole: null };
			const sidekick = { role: { value: 2, name: 'Sidekick' }, modifier: null, ghostRole: null };
			const result = run({
				state: makeState({ mod: 'SUPER_NEW_ROLES' }),
				me: makePlayer({ id: 1, clientId: 1, isLocal: true, inVent: true, snrRole: jackal }),
				other: makePlayer({ id: 2, clientId: 2, x: 1, inVent: true, snrRole: sidekick }),
				activeLobbySettings: makeLobbySettings({ sidekickTalkInVents: true }),
			});
			expect(result.gain).toBeGreaterThan(0);
		});

		it('uses NoS speaker positions when the host enables them', () => {
			const result = run({
				state: makeState({ mod: 'NoS', nosLocalMicPosition: { x: 0, y: 0 } }),
				other: makePlayer({
					id: 2,
					clientId: 2,
					x: 1,
					nosPlayer: {
						playerId: 2,
						name: 'NoS',
						isKiller: false,
						isImpostor: false,
						isCrewmate: true,
						isNeutral: false,
						isImpostorlike: false,
						speakerPositionX: 100,
						speakerPositionY: 100,
						colorR: 1,
						colorG: 0,
						colorB: 0,
					},
				}),
				activeLobbySettings: makeLobbySettings({ nosVoicePositions: true }),
			});
			expect(result.gain).toBe(0);
		});

		it('lets a TOH4E killer hear ghosts when role haunting is enabled', () => {
			const result = run({
				state: makeState({ mod: 'TOH4E' }),
				me: makePlayer({
					id: 1,
					clientId: 1,
					isLocal: true,
					tohRole: { roleId: 10, roleName: 'Jackal', isNeutralKiller: true, isKiller: true, customRoleType: 'Neutral' },
				}),
				other: makePlayer({ id: 2, clientId: 2, x: 1, isDead: true }),
				activeLobbySettings: makeLobbySettings({ tohNeutralKillerHaunting: true }),
				settings: makeSettings({ ghostVolumeAsImpostor: 40 }),
			});
			expect(result.gain).toBeCloseTo(0.4);
			expect(result.reverb).toBeTrue();
		});
	});

	describe('walls block audio', () => {
		// Real geometry against MIRA_HQ door 0 (`doorMaps[MIRA_HQ][0] = 'M 44.942 37.086 H 47.27'`,
		// a horizontal segment in SVG space). poseCollide's transform is
		// `svgX = gameX + 40, svgY = 40 - gameY`, so a vertical game-space segment from
		// (5, 2) to (5, 4) becomes the SVG segment (45, 38)-(45, 36), which crosses the door's
		// line (svgY 37.086, svgX 44.942-47.27) at x=45. Chosen over spying on `poseCollide`
		// because ESM named exports aren't spy-able (their bindings aren't writable) - this
		// exercises the real ColliderMap collision math instead of stubbing it out.
		const wallBlockedMe = () => makePlayer({ id: 1, clientId: 1, isLocal: true, x: 5, y: 2 });
		const wallBlockedOther = () => makePlayer({ id: 2, clientId: 2, x: 5, y: 4 });

		it('mutes a within-range player when a closed door blocks the path and wallsBlockAudio is enabled', () => {
			const result = run({
				state: makeState({ map: MapType.MIRA_HQ, closedDoors: [0] }),
				me: wallBlockedMe(),
				other: wallBlockedOther(),
				activeLobbySettings: makeLobbySettings({ wallsBlockAudio: true }),
			});
			expect(result.gain).toBe(0);
		});

		it('ignores the same closed door when wallsBlockAudio is disabled', () => {
			const result = run({
				state: makeState({ map: MapType.MIRA_HQ, closedDoors: [0] }),
				me: wallBlockedMe(),
				other: wallBlockedOther(),
				activeLobbySettings: makeLobbySettings({ wallsBlockAudio: false }),
			});
			expect(result.gain).toBe(1);
		});

		it('does not block on a door that is not in the closed-doors list', () => {
			const result = run({
				state: makeState({ map: MapType.MIRA_HQ, closedDoors: [] }),
				me: wallBlockedMe(),
				other: wallBlockedOther(),
				activeLobbySettings: makeLobbySettings({ wallsBlockAudio: true }),
			});
			expect(result.gain).toBe(1);
		});

		it('does not wall-check for a dead listener (ghosts hear through walls)', () => {
			const result = run({
				state: makeState({ map: MapType.MIRA_HQ, closedDoors: [0] }),
				me: makePlayer({ id: 1, clientId: 1, isLocal: true, isDead: true, x: 5, y: 2 }),
				other: makePlayer({ id: 2, clientId: 2, isDead: true, x: 5, y: 4 }),
				activeLobbySettings: makeLobbySettings({ wallsBlockAudio: true, deadOnly: true }),
			});
			expect(result.gain).toBe(1);
		});
	});
});

describe('NoS 3.2.21 voice effects', () => {
	const me = makePlayer({ id: 1, clientId: 1, isLocal: true });
	const state = makeState({ mod: 'NoS' });
	const settings = makeSettings();
	const lobby = makeLobbySettings();
	const effectFor = (other: Player, changes: Partial<AmongUsState> = {}, options: Partial<ILobbySettings> = {}, personal: Partial<ISettings> = {}) =>
		selectVoiceEffect({ ...state, ...changes }, { ...settings, ...personal }, { ...lobby, ...options }, me, other, -1);

	it('keeps the size gate while pitch and tails come from personal controls', () => {
		const small = effectFor(makePlayer({ nosPlayer: makeNosPlayer({ bodyRateX: 0.8, bodyRateY: 0.5 }) }));
		expect(small?.id).toBe('nosSize');
		expect(small?.tuning).toEqual({ pitch: -100, reverb: 0, echo: 0 });
		const squash = effectFor(makePlayer({ nosPlayer: makeNosPlayer({ bodyRateX: 1, bodyRateY: 0.5 }) }));
		expect(squash?.id).toBe('nosSize');
		const half = effectFor(makePlayer({ nosPlayer: makeNosPlayer({ bodyRateX: 0.8, bodyRateY: 0.5 }) }), {}, { nosSizeVoiceEffectStrength: 0 }, { nosSizeVoiceEffectStrength: 50 });
		expect(half?.tuning.pitch).toBe(-50);
		const custom = effectFor(makePlayer({ nosPlayer: makeNosPlayer({ bodyRateX: .8, bodyRateY: .5 }) }), {}, {},
			{ voiceEffectTunings: { nosSize: { pitch: 0, reverb: 30, echo: 20 } } });
		expect(custom?.tuning).toEqual({ pitch: 0, reverb: 30, echo: 20 });
		expect(effectFor(makePlayer({ nosPlayer: makeNosPlayer({ bodyRateX: 0.8, bodyRateY: 0.5 }) }), {}, {}, { nosSizeVoiceEffectStrength: 0 })).toBeNull();
		expect(effectFor(makePlayer({ nosPlayer: makeNosPlayer({ bodyRateX: 0.8, bodyRateY: 0.5 }) }), {}, { nosSizeVoiceEffect: false })).toBeNull();
	});
	it('keeps all nine ordinary-size boundary pairs outside the role effect', () => {
		for (const x of [.98, 1, 1.02]) for (const y of [.98, 1, 1.02])
			expect(effectFor(makePlayer({ nosPlayer: makeNosPlayer({ bodyRateX: x, bodyRateY: y }) }))).toBeNull();
	});

	it('gates Berserker overload by role and active body type', () => {
		const other = makePlayer({
			nosRole: { roleId: 1, roleName: 'berserker', displayName: 'Berserker', runtimeClass: 'Berserker' },
			nosPlayer: makeNosPlayer({ bodyType: 2 }),
		});
		expect(effectFor(other)?.id).toBe('nosBerserker');
		expect(effectFor(other, {}, { nosBerserkerVoiceEffectStrength: 0 }, { nosBerserkerVoiceEffectStrength: 40 })?.tuning).toEqual({ pitch: 0, reverb: 40, echo: 40 });
		expect(effectFor(other, {}, { nosBerserkerVoiceEffect: false })).toBeNull();
		expect(effectFor({ ...other, nosPlayer: makeNosPlayer({ bodyType: 1 }) })).toBeNull();
	});

	it('keeps neck extension as the Rokurokubi activation gate', () => {
		const other = makePlayer({ nosPlayer: makeNosPlayer({ bodyType: 3, neckLength: 40, bodyRateX: 0.8 }) });
		expect(effectFor(other)?.id).toBe('nosRokurokubi');
		expect(effectFor(other)?.tuning.pitch).toBe(100);
		expect(effectFor(other, {}, { nosRokurokubiVoiceEffect: false })).toBeNull();
	});

	it('keeps Citrus disguise in tasks and discussion only', () => {
		const other = makePlayer({ nosPlayer: makeNosPlayer({ hat: { name: 'noshat_catudon_Citrus_Lemon' } }) });
		expect(effectFor(other)?.tuning.pitch).toBe(100);
		expect(effectFor(other, { gameState: GameState.DISCUSSION })?.id).toBe('nosCitrus');
		expect(effectFor(other, { gameState: GameState.LOBBY })).toBeNull();
		expect(effectFor(other, {}, { nosCitrusVoiceEffect: false })).toBeNull();
		expect(effectFor(other, {}, { nosCitrusVoiceEffectStrength: 0 }, { nosCitrusVoiceEffectStrength: 35 })?.tuning.pitch).toBe(35);
		expect(effectFor(other, {}, {}, { nosCitrusVoiceEffectStrength: 0 })).toBeNull();
	});

	it('enables Rainbow Star echo only for a live star in tasks or discussion', () => {
		const other = makePlayer({
			nosRole: { roleId: 2, roleName: 'star', displayName: 'Star', runtimeClass: 'Star', isRainbowStar: true },
		});
		expect(shouldApplyRainbowStarEcho(state, other, lobby)).toBeTrue();
		expect(shouldApplyRainbowStarEcho({ ...state, gameState: GameState.DISCUSSION }, other, lobby)).toBeTrue();
		expect(shouldApplyRainbowStarEcho(state, { ...other, isDead: true }, lobby)).toBeFalse();
		expect(shouldApplyRainbowStarEcho(state, other, { ...lobby, nosRainbowStarEcho: false })).toBeFalse();
		expect(shouldApplyRainbowStarEcho(state, other, lobby, { ...settings, nosRainbowStarEchoStrength: 0 })).toBeFalse();
		expect(shouldApplyRainbowStarEcho(state, other, lobby, { ...settings, nosRainbowStarEchoStrength: 0,
			voiceEffectTunings: { nosRainbowStar: { pitch: -50, reverb: 0, echo: 0 } } })).toBeTrue();
	});

	it('preserves camouflage and mushroom voice disguises outside NoS', () => {
		const other = makePlayer({ id: 2, clientId: 2 });
		const disguised = effectFor(other, { mod: 'NONE', camouflaged: true });
		expect(disguised?.id).toBe('disguise');
		expect(disguised?.tuning.pitch).toBe(-settings.voiceEffectStrength);
		expect(effectFor(other, { mod: 'NONE', mushroomMixupSabotaged: true })?.tuning.pitch).toBe(-settings.voiceEffectStrength);
	});

	it('avoids applying the task voice effect during an Airship outfit meeting', () => {
		const other = makePlayer({ nosPlayer: makeNosPlayer({ bodyRateX: 0.8, bodyRateY: 0.8 }) });
		expect(effectFor(other, { map: MapType.AIRSHIP, airshipMeetingByOutfit: true })).toBeNull();
	});
});
