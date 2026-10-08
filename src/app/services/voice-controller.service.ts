import { Injectable } from '@angular/core';
import { AmongUsState, GameState, numberStringMap, Player } from '../common/AmongUsState';
import { ILobbySettings } from '../common/ISettings';
import { PlayerConnectionState, PlayerSetting } from './smallInterfaces';
import { ConnectingStage, ConnectionController, ConnectionState } from './ConnectionController.service';
import { MobileHostService } from './mobile-host.service';
import { SettingsService } from './settings.service';
import { isToh4eHostName } from '../common/Mods';
import { isTohRole, isTohRoleCatalog, TohRole, TohRoleDefinition } from '../common/TohRole';
import {
	isPlayerImpostor,
	withImpostorClassification,
	isTohImpostorEntries,
	TohImpostorEntry,
} from '../common/Impostor';
import { isSnrJackalTeam } from '../common/SnrRole';
import {
	canHearNosImpostorRadio,
	canHearNosJackalRadio,
	isNosRadioData,
	canUseNosRadio,
	canReceiveNosRadio,
	NosRadioData,
} from '../common/NosSnapshot';
import { HeldNosRadio, resolveNosRadioKind, isNosRadioEnabled } from '../common/nosRadio';
import { compareAppVersions, mismatchedAppVersions, requiredAppVersion } from '../common/appVersion';
import { environment } from '../../environments/environment';

const radioOnAudio = new Audio('assets/sounds/radio_on.wav');
radioOnAudio.volume = 0.02;
const radioOffAudio = new Audio('assets/sounds/radio_beep2.wav');
radioOffAudio.volume = 0.09;

interface VoicePlayerState {
	talking: boolean;
	audible: boolean;
	/** Latched: once true during TASKS it stays true until the round returns to LOBBY/DISCUSSION. */
	isDead: boolean;
	settings: PlayerSetting | undefined;
}

export interface RenderablePlayer {
	player: Player;
	settings: PlayerSetting | undefined;
	isDead: boolean;
	talking: boolean;
	audible: boolean;
	/** Desktop-parity presence indicator shown as a badge on the avatar. */
	connectionState: PlayerConnectionState;
}

/** Strips rich-text tags (desktop's `name.split(/<.*?>/).join('')`) and normalizes whitespace/case. */
export function normalizeUsername(name: string): string {
	return name
		.replace(/<[^>]*>/g, '')
		.replace(/\s+/g, ' ')
		.trim()
		.toLowerCase();
}

export function matchLocalPlayer(
	players: Player[],
	username: string
): { player: Player | undefined; ambiguous: boolean } {
	const target = normalizeUsername(username);
	const matches = players.filter((candidate) => normalizeUsername(candidate.name) === target);
	return { player: matches[0], ambiguous: matches.length > 1 };
}

/**
 * Stable per-player settings key: desktop's `playerConfigId` (a PUID hash) when the host sent
 * one, else the name hash older hosts computed. Volume/mute persisted under this key follows
 * the person, not their current display name.
 */
export function playerSettingsKey(player: Player): number {
	return player.playerConfigId ?? player.nameHash;
}

/**
 * Orchestrates game-state processing, per-player audio and impostor radio - mirroring desktop's
 * VoiceController, which sits on top of ConnectionController the same way. ConnectionController
 * owns the transport and a few shared state fields (currentGameState, localPLayer, lobbySettings);
 * this class is the logic that reads and updates them, plus the per-player render/audio state
 * (talking, audible, latched-dead, cached per-player volume) that used to live on the deleted
 * SocketElement.
 */
@Injectable({
	providedIn: 'root',
})
export class VoiceController {
	private playerStates = new Map<number, VoicePlayerState>();
	private impostorRadioClientId = -1;
	private impostorRadioClientIds: number[] = [];
	private impostorRadioPressed = false;
	private readonly heldNosRadio = new HeldNosRadio();
	private nosRadioKinds: Record<number, number | undefined> = {};
	private radioTransmitting = false;
	private radioStatusVersion = Date.now();
	private radioStatusVersions: Record<number, number> = {};
	private lastRadioStatusSentAt = 0;
	private nosRadiosByPlayer: Record<number, { clientId: number; radios: NosRadioData[]; receivedAt: number }> = {};
	private nosRadioSession = '';
	private nosRadioSentSignature = '';
	private nosRadioSentAt = 0;
	private toh4eLobby = false;
	private tohRoleOverride: TohRole | null = null;
	private tohRoleReceivedAt = 0;
	private tohCatalogReceivedAt = 0;
	private tohRoleCatalog: TohRoleDefinition[] = [];
	private tohImpostors: TohImpostorEntry[] = [];
	private tohGameStartNames: numberStringMap = {};
	private tohSession = '';
	private peerVersions: Record<string, string> = {};
	private versionSentAt = 0;
	private versionSession = '';
	/** Desktop 3.2.9's version-difference notice, shown on the game page; empty when none. */
	public versionWarning = '';

	constructor(
		private connectionController: ConnectionController,
		private mobileHostService: MobileHostService,
		private settingsService: SettingsService
	) {
		this.connectionController.events.on(
			'hostUpdate',
			(state: AmongUsState, lobbySettings: ILobbySettings | undefined) => {
				try {
					this.onLobbySettingsChange(lobbySettings);
					this.onGameState(this.getEffectiveGameState(state));
				} catch (e) {
					console.error('ERROR:', e);
					this.connectionController.error = e.message;
					this.connectionController.connectionState = ConnectionState.error;
				}
			}
		);
		this.connectionController.events.on('peerData', (socketId: string, data: Record<string, unknown>) => {
			this.onPeerData(socketId, data);
		});
		this.connectionController.events.on('player_talk', (clientId: number, talking: boolean) => {
			this.getOrCreatePlayerState(clientId).talking = talking;
		});
	}

	private getOrCreatePlayerState(clientId: number): VoicePlayerState {
		let state = this.playerStates.get(clientId);
		if (!state) {
			state = { talking: false, audible: false, isDead: false, settings: undefined };
			this.playerStates.set(clientId, state);
		}
		return state;
	}

	public isTalking(clientId: number): boolean {
		return this.playerStates.get(clientId)?.talking ?? false;
	}

	/** Resets impostor-radio state; call on disconnect. */
	public reset(): void {
		this.playerStates.clear();
		this.impostorRadioClientId = -1;
		this.impostorRadioClientIds = [];
		this.impostorRadioPressed = false;
		this.heldNosRadio.clear();
		this.nosRadioKinds = {};
		this.radioTransmitting = false;
		this.toh4eLobby = false;
		this.tohRoleOverride = null;
		this.tohRoleReceivedAt = 0;
		this.tohCatalogReceivedAt = 0;
		this.tohRoleCatalog = [];
		this.tohImpostors = [];
		this.tohGameStartNames = {};
		this.tohSession = '';
		this.radioStatusVersions = {};
		this.nosRadiosByPlayer = {};
		this.peerVersions = {};
		this.versionSentAt = 0;
		this.versionSession = '';
		this.versionWarning = '';
		this.connectionController.audioController.setRadioTransmitting(false);
	}

	/** Applies the TOH4E host's private role/name messages to the public host state. */
	private getEffectiveGameState(state: AmongUsState): AmongUsState {
		const session = `${state.lobbyCode}|${state.hostId}`;
		if (session !== this.tohSession || state.gameState === GameState.MENU || state.gameState === GameState.UNKNOWN) {
			this.tohSession = session;
			this.toh4eLobby = false;
			this.tohRoleOverride = null;
			this.tohRoleReceivedAt = 0;
			this.tohCatalogReceivedAt = 0;
			this.tohRoleCatalog = [];
			this.tohImpostors = [];
			this.tohGameStartNames = {};
		}

		const host = state.players?.find((player) => player.clientId === state.hostId);
		if (state.mod === 'TOH4E' || isToh4eHostName(host?.name) || isToh4eHostName(host?.appearanceName)) {
			this.toh4eLobby = true;
		}
		if (!this.toh4eLobby) return state;
		const roleFresh = state.gameState !== GameState.LOBBY && Date.now() - this.tohRoleReceivedAt <= 5000;
		if (!roleFresh) {
			this.tohRoleOverride = null;
			this.tohImpostors = [];
		}
		const catalogFresh = Date.now() - this.tohCatalogReceivedAt <= 5000;
		if (!catalogFresh) this.tohRoleCatalog = [];
		const rawCatalog = isTohRoleCatalog(state.tohRoleCatalog) ? state.tohRoleCatalog : [];
		const localName = normalizeUsername(this.connectionController.amongusUsername);
		return {
			...state,
			mod: 'TOH4E',
			tohRoleCatalog: catalogFresh && this.tohRoleCatalog.length ? this.tohRoleCatalog : rawCatalog,
			players: state.players.map((player) => this.getEffectiveTohPlayer(player, localName)),
		};
	}

	private getEffectiveTohPlayer(player: Player, localName: string): Player {
		const fixedName = this.tohGameStartNames[player.clientId];
		const namedPlayer = fixedName ? { ...player, name: fixedName, appearanceName: fixedName } : player;
		const entry = this.tohImpostors.find(
			(value) => value.playerId === player.id && value.clientId === player.clientId
		);
		const effectivePlayer = { ...namedPlayer, tohImpostor: entry?.isImpostor };
		if (normalizeUsername(namedPlayer.name) !== localName)
			return withImpostorClassification('TOH4E', effectivePlayer);
		return withImpostorClassification('TOH4E', {
			...effectivePlayer,
			tohRole: this.tohRoleOverride ?? undefined,
			roleName: this.tohRoleOverride?.roleName
				? `TOH4E: ${this.tohRoleOverride.roleName}`
				: 'TOH4E役職未取得（ホストからの受信待ち）',
		});
	}

	private onLobbySettingsChange(settings: ILobbySettings | undefined): void {
		if (!settings) {
			// Desktop 3.2.0 sent this payload under `activeLobbySettings` instead of
			// `lobbySettings`, so a 3.2.0 host's gameState frames carry no lobby settings at all
			// here. Keep whatever defaults/last-known settings are already in place instead of
			// treating a missing payload as fatal - lobby-setting-driven audio degrades to
			// defaults, but distance/dead/vent audio from onGameState still works.
			return;
		}
		const lobbySettings = this.connectionController.lobbySettings;
		let changed = false;

		for (const field of Object.keys(lobbySettings)) {
			if (field === 'tohGhostRoles' || !(field in settings) || lobbySettings[field] === settings[field]) continue;
			changed = true;
			lobbySettings[field] = settings[field];
		}
		const ghostRoles = settings.tohGhostRoles;
		lobbySettings.tohGhostRoles =
			ghostRoles && typeof ghostRoles === 'object' &&
			Object.values(ghostRoles).every((enabled) => typeof enabled === 'boolean')
				? { ...ghostRoles }
				: undefined;
		if (changed) {
			this.connectionController.audioController.setMaxDistance(lobbySettings.maxDistance);
		}
	}

	private muteAll(): void {
		this.connectionController.audioController.silenceAllPeers();
	}

	private onGameState(state: AmongUsState): void {
		const connectionController = this.connectionController;
		connectionController.oldGameState = connectionController.currentGameState;
		connectionController.currentGameState = state;

		const { player: newLocalPlayer, ambiguous } = matchLocalPlayer(state.players, connectionController.amongusUsername);
		if (ambiguous) {
			console.warn(
				`Multiple players in the lobby match the configured name "${connectionController.amongusUsername}"; using the first match.`
			);
		}

		connectionController.updateConnectingStage(ConnectingStage.WaitingForGameData);
		if (!newLocalPlayer) {
			this.muteAll(); // if localplayer not found mute all players in lobby.
			return;
		}
		connectionController.updateConnectingStage(ConnectingStage.waitingForYouToJoin);

		if (
			connectionController.connectionState === ConnectionState.conencted &&
			connectionController.localPLayer &&
			(connectionController.localPLayer.id !== newLocalPlayer.id ||
				connectionController.localPLayer.clientId !== newLocalPlayer.clientId)
		) {
			// Re-claim our account identity too, not just the ids: the server keys bans/spoof
			// detection off friendCode/playerUid/playerIdentifier (desktop's emitId).
			connectionController.emitId(
				newLocalPlayer.id,
				newLocalPlayer.clientId,
				newLocalPlayer.friendCode,
				newLocalPlayer.playerUid,
				newLocalPlayer.playerIdentifier
			);
		}

		connectionController.localPLayer = newLocalPlayer;
		connectionController.audioController.setJammed(
			state.mod === 'NoS' &&
				connectionController.lobbySettings.nosFixerJammingVoiceBlock !== false &&
				newLocalPlayer.nosPlayer?.isJammed === true
		);
		this.syncNosRadioReports(state, newLocalPlayer);
		this.syncAppVersion(state, newLocalPlayer);

		if (
			connectionController.connectionState === ConnectionState.connecting ||
			connectionController.currentGameCode !== connectionController.gamecode
		) {
			connectionController.currentGameCode = connectionController.gamecode;
			connectionController.joinGameRoom(
				newLocalPlayer.id,
				newLocalPlayer.clientId,
				newLocalPlayer.friendCode,
				newLocalPlayer.playerUid,
				newLocalPlayer.playerIdentifier
			);
			connectionController.updateConnectingStage(ConnectingStage.parsingGameData);
			connectionController.connectionState = ConnectionState.conencted;
		}

		this.updateMaxDistance(state, newLocalPlayer);
		this.updatePlayerDeadStates(state, newLocalPlayer);
		this.updatePeerAudio(state, newLocalPlayer);
		this.updateImpostorRadioTransmission();
		this.cleanupImpostorRadio(state, newLocalPlayer);
	}

	/**
	 * Latches the dead flag for every other player, including ones with no voice peer, so the
	 * player grid can render disconnected players with the correct alive/dead sprite. This used
	 * to live in `updatePeerAudio`, which only visits players that have a peer.
	 */
	private updatePlayerDeadStates(state: AmongUsState, myPlayer: Player): void {
		for (const player of state.players) {
			if (player.clientId === myPlayer.clientId) continue;
			const playerState = this.getOrCreatePlayerState(player.clientId);
			playerState.isDead = this.computeLatchedDead(playerState.isDead, player.isDead, myPlayer);
		}
	}

	private updateMaxDistance(state: AmongUsState, myPlayer: Player): void {
		const lobbySettings = this.connectionController.lobbySettings;
		let maxDistance = lobbySettings.maxDistance;
		if (lobbySettings.visionHearing && !isPlayerImpostor(state.mod, myPlayer))
			maxDistance = state.lightRadius + 0.5;
		if (maxDistance <= 0.6) maxDistance = 1;
		this.connectionController.audioController.setMaxDistance(maxDistance);
	}

	private computeLatchedDead(current: boolean, isNowDead: boolean, myPlayer: Player): boolean {
		const connectionController = this.connectionController;
		if (current && !isNowDead) {
			return false;
		}
		if (
			isNowDead &&
			(myPlayer.isDead ||
				connectionController.oldGameState?.gameState === GameState.DISCUSSION ||
				connectionController.oldGameState?.gameState === GameState.LOBBY)
		) {
			return true;
		}
		return current;
	}

	private updatePeerAudio(state: AmongUsState, myPlayer: Player): void {
		const settings = this.settingsService.get();
		const lobbySettings = this.connectionController.lobbySettings;
		const playerSocketIds = this.connectionController.playerSocketIds;
		const audioController = this.connectionController.audioController;
		const handledPeerIds: string[] = [];

		for (const player of state.players) {
			if (player.clientId === myPlayer.clientId) continue;
			const peerId = playerSocketIds[player.clientId];
			if (!peerId || !audioController.hasPeer(peerId)) continue;

			handledPeerIds.push(peerId);
			const playerState = this.getOrCreatePlayerState(player.clientId);
			if (!playerState.settings) {
				playerState.settings = this.settingsService.getPlayerSettings(playerSettingsKey(player));
			}
			player.isbetter = this.mobileHostService.isKnownDesktopHost(peerId);

			let endGain = audioController.applyVoiceAudio(
				peerId,
				state,
				settings,
				lobbySettings,
				myPlayer,
				player,
				this.impostorRadioClientId,
				this.impostorRadioClientIds,
				this.canNosJackalRadioReach(state, player, myPlayer),
				this.canNosImpostorRadioReach(state, player, myPlayer)
			);
			if (endGain === null) {
				endGain = 0;
			}
			if (endGain > 0 && playerState.settings?.isMuted) {
				// Per-player mute, mirroring desktop's updatePeerAudio (`playerConfigs[..].isMuted`).
				endGain = 0;
			}
			if (endGain > 0) {
				if (playerState.settings) {
					endGain *= playerState.settings.volume / 100;
				}
				if (myPlayer.isDead && !player.isDead) {
					endGain *= settings.crewVolumeAsGhost / 100;
				}
				endGain *= settings.masterVolume / 100;
			}
			audioController.setPeerGain(peerId, endGain);
			playerState.audible = endGain > 0;
		}
		audioController.silencePeersExcept(handledPeerIds);
	}

	/**
	 * Renders the player grid from `state.players`, cross-referenced with this controller's
	 * audio/talking state. Every other player is returned - including ones with no voice
	 * connection - so the grid matches desktop (which renders the full lobby and flags each
	 * player with a Wi-Fi/link badge). Only the *badge* depends on the peer: disconnected
	 * players still render, they just aren't audible and never reach the native overlay
	 * (which is driven solely by talking events from connected peers).
	 */
	public getRenderablePlayers(): RenderablePlayer[] {
		const state = this.connectionController.currentGameState;
		const myPlayer = this.connectionController.localPLayer;
		if (!state?.players || !myPlayer) return [];

		const playerSocketIds = this.connectionController.playerSocketIds;

		return state.players
			.filter((player) => player.clientId !== myPlayer.clientId)
			.map((player) => {
				const playerState = this.getOrCreatePlayerState(player.clientId);
				return {
					player,
					settings: playerState.settings,
					isDead: playerState.isDead,
					talking: playerState.talking,
					audible: playerState.audible,
					connectionState: this.getPlayerConnectionState(player.clientId, playerSocketIds),
				};
			})
			.sort((a, b) => a.player.colorId - b.player.colorId);
	}

	/**
	 * Mirrors desktop VoiceView's per-player check:
	 * `!connected ? 'disconnected' : audioConnected[peer] ? 'connected' : 'novoice'`.
	 * "Connected" means the voice server still lists a client whose `clientId` matches the
	 * player; "novoice" means that client exists but no audio stream/peer is established.
	 */
	private getPlayerConnectionState(clientId: number, playerSocketIds: numberStringMap): PlayerConnectionState {
		const peerId = playerSocketIds[clientId];
		const connected = peerId !== undefined && this.connectionController.getClient(peerId)?.clientId === clientId;
		if (!connected) return 'disconnected';
		return this.connectionController.audioController.hasPeer(peerId) ? 'connected' : 'novoice';
	}

	// --- Impostor radio, ported from desktop v3.2.1 VoiceController.applyImpostorRadio/cleanupImpostorRadio. ---
	// Desktop binds this to a held hotkey; mobile has no keyboard, so `applyImpostorRadio` is
	// driven by a hold-to-transmit button instead (see game.component.ts). `!player.isLocal` in
	// desktop's version means "not the desktop host's own character" - meaningless on mobile,
	// where `isLocal` reflects the *host's* perspective, not the phone's. Replaced throughout with
	// `player.clientId !== myPlayer.clientId`, mobile's actual "not me" check.

	/** Call with `true` on press, `false` on release (including forced release on blur/disconnect). */
	applyImpostorRadio(pressing: boolean, kind = 0): void {
		const state = this.connectionController.currentGameState;
		if (state?.mod === 'NoS') {
			const player = this.connectionController.localPLayer;
			if (
				pressing &&
				(!player ||
					player.isDead ||
					(state.gameState !== GameState.TASKS && state.gameState !== GameState.DISCUSSION) ||
					!isNosRadioEnabled(kind, this.connectionController.lobbySettings) ||
					!this.getNosRadios(state, player)?.some((radio) => radio.kind === kind))
			)
				return;
			const previous = this.heldNosRadio.kind;
			this.heldNosRadio.set(kind, pressing);
			if (previous === this.heldNosRadio.kind) return;
			pressing = this.heldNosRadio.kind !== undefined;
		} else if (kind !== 0) return;
		this.radioStatusVersion = Math.max(Date.now(), this.radioStatusVersion + 1);
		this.impostorRadioPressed = pressing;
		this.updateImpostorRadioTransmission(true);
	}

	public canTransmitRadio(kind = 0): boolean {
		const state = this.connectionController.currentGameState;
		const player = this.connectionController.localPLayer;
		if (
			!state ||
			!player ||
			player.isDead ||
			(state.gameState !== GameState.TASKS && state.gameState !== GameState.DISCUSSION)
		)
			return false;
		if (state.mod !== 'NoS') return kind === 0 && this.canUseRadio(state, player);
		return (
			isNosRadioEnabled(kind, this.connectionController.lobbySettings) &&
			(this.getNosRadios(state, player)?.some((radio) => radio.kind === kind) ?? false)
		);
	}

	public releaseRadio(): void {
		this.stopAllRadio();
	}

	private stopAllRadio(): void {
		this.heldNosRadio.clear();
		this.impostorRadioPressed = false;
		this.radioStatusVersion = Math.max(Date.now(), this.radioStatusVersion + 1);
		this.updateImpostorRadioTransmission(true);
	}

	private updateImpostorRadioTransmission(forceSend = false): void {
		const connectionController = this.connectionController;
		const state = connectionController.currentGameState;
		const myPlayer = connectionController.localPLayer;
		const granted =
			this.impostorRadioPressed &&
			(state?.gameState === GameState.TASKS || state?.gameState === GameState.DISCUSSION) &&
			myPlayer !== undefined &&
			this.canUseRadio(state, myPlayer) &&
			!myPlayer.isDead;

		if (granted === this.radioTransmitting && !forceSend) return;
		const changed = granted !== this.radioTransmitting;
		this.radioTransmitting = granted;
		connectionController.audioController.setRadioTransmitting(granted);
		if (myPlayer) this.setRadioClientActive(myPlayer.clientId, granted);

		if (changed)
			void (granted ? radioOnAudio : radioOffAudio).play().catch(() => {
				/* autoplay blocked */
			});

		const playerSocketIds = connectionController.playerSocketIds;
		const targets = (state?.players ?? [])
			.filter(
				(player) =>
					myPlayer !== undefined && player.clientId !== myPlayer.clientId && !player.bugged && !player.disconnected
			)
			.map((player) => playerSocketIds[player.clientId])
			.filter((peerId): peerId is string => Boolean(peerId));
		connectionController.sendToPeers(
			targets,
			JSON.stringify({
				impostorRadio: granted,
				impostorRadioVersion: this.radioStatusVersion,
				nosRadioKind: state?.mod === 'NoS' ? this.heldNosRadio.kind : undefined,
			})
		);
		this.lastRadioStatusSentAt = Date.now();
	}

	private cleanupImpostorRadio(state: AmongUsState, myPlayer: Player | undefined): void {
		if (!state.players || !myPlayer) return;
		if (!this.impostorRadioClientIds.length && this.impostorRadioClientId >= 0)
			this.impostorRadioClientIds = [this.impostorRadioClientId];
		if (
			this.impostorRadioPressed &&
			(myPlayer.isDead ||
				(state.mod !== 'NoS' && this.heldNosRadio.kind !== undefined) ||
				(state.gameState !== GameState.TASKS && state.gameState !== GameState.DISCUSSION) ||
				!this.canUseRadio(state, myPlayer))
		)
			this.stopAllRadio();
		else if (this.impostorRadioPressed && Date.now() - this.lastRadioStatusSentAt >= 1000)
			this.updateImpostorRadioTransmission(true);
		const valid = this.impostorRadioClientIds.filter((clientId) => {
			if (clientId === myPlayer.clientId) return this.impostorRadioPressed && this.canUseRadio(state, myPlayer);
			const player = state.players.find((candidate) => candidate.clientId === clientId);
			return Boolean(
				player &&
				(state.mod === 'NoS' || this.canUseRadio(state, player)) &&
				!player.isDead &&
				!player.disconnected &&
				!player.bugged
			);
		});
		this.impostorRadioClientIds = valid;
		this.impostorRadioClientId = valid[0] ?? -1;
	}

	private syncNosRadioReports(state: AmongUsState, myPlayer: Player): void {
		const active =
			state.mod === 'NoS' && (state.gameState === GameState.TASKS || state.gameState === GameState.DISCUSSION);
		const session = active ? `${state.lobbyCode}|${myPlayer.clientId}` : '';
		if (session !== this.nosRadioSession) {
			this.nosRadioSession = session;
			this.nosRadioSentSignature = '';
			this.nosRadioSentAt = 0;
			this.nosRadiosByPlayer = {};
		}
		if (!active || !state.nosRadios) return;
		const now = Date.now();
		for (const [playerId, report] of Object.entries(this.nosRadiosByPlayer)) {
			if (
				now - report.receivedAt > 10000 ||
				!state.players.some((player) => player.id === Number(playerId) && player.clientId === report.clientId)
			)
				delete this.nosRadiosByPlayer[Number(playerId)];
		}
		const signature = JSON.stringify(state.nosRadios);
		if (signature === this.nosRadioSentSignature && now - this.nosRadioSentAt < 3000) return;
		const targets = state.players
			.filter((player) => player.clientId !== myPlayer.clientId && !player.disconnected)
			.map((player) => this.connectionController.playerSocketIds[player.clientId])
			.filter((peerId): peerId is string => Boolean(peerId));
		this.connectionController.sendToPeers(
			targets,
			JSON.stringify({
				type: 'nos-radio-data',
				lobbyCode: state.lobbyCode,
				playerId: myPlayer.id,
				radios: state.nosRadios,
			})
		);
		this.nosRadioSentSignature = signature;
		this.nosRadioSentAt = now;
	}

	/**
	 * Ported from desktop 3.2.9 VoiceController: every 3s, tell peers which release we run and
	 * recompute the notice. Mobile reports the desktop release it is ported from, since desktop
	 * only accepts x.y.z versions and compares them against its own.
	 */
	private syncAppVersion(state: AmongUsState, myPlayer: Player): void {
		const inactive = state.gameState === GameState.MENU || state.gameState === GameState.UNKNOWN;
		const session = `${state.lobbyCode}|${myPlayer.clientId}`;
		if (inactive || session !== this.versionSession) {
			this.peerVersions = {};
			this.versionSentAt = 0;
			this.versionSession = session;
		}
		if (!inactive && Date.now() - this.versionSentAt >= 3000) {
			const targets = state.players
				.filter((player) => player.clientId !== myPlayer.clientId && !player.disconnected)
				.map((player) => this.connectionController.playerSocketIds[player.clientId])
				.filter((peerId): peerId is string => Boolean(peerId));
			this.connectionController.sendToPeers(
				targets,
				JSON.stringify({ type: 'app-version', lobbyCode: state.lobbyCode, version: environment.desktopCompatVersion })
			);
			this.versionSentAt = Date.now();
		}
		this.updateVersionWarning(state, myPlayer);
	}

	private updateVersionWarning(state: AmongUsState, myPlayer: Player | undefined): void {
		const local = environment.desktopCompatVersion;
		const isHost = myPlayer !== undefined && myPlayer.clientId === state.hostId;
		const participants = Object.entries(this.peerVersions).flatMap(([peerId, version]) => {
			const clientId = this.connectionController.getClient(peerId)?.clientId;
			const player = state.players?.find((candidate) => candidate.clientId === clientId && !candidate.disconnected);
			return player ? [{ name: player.appearanceName || player.name, clientId: player.clientId, version }] : [];
		});
		const hostVersion = isHost ? local : participants.find((player) => player.clientId === state.hostId)?.version;
		const required = requiredAppVersion(
			local,
			hostVersion,
			isHost,
			participants.map((player) => player.version)
		);
		const mismatches = mismatchedAppVersions(local, participants);
		const mismatchWarning = mismatches.length
			? `TanukiBCLのバージョンが異なるプレイヤーがいます: ${mismatches
					.map((player) => `${player.name}（v${player.version}）`)
					.join('、')}。このモバイル版はPC版v${local}相当です。`
			: '';
		const updateWarning = required
			? isHost
				? `参加者はv${required}です。ホストのTanukiBCLをアップデートしてください（このモバイル版はPC版v${local}相当）。`
				: `ホストはv${required}です。TanukiBCLモバイルをアップデートしてください（現在PC版v${local}相当）。`
			: '';
		this.versionWarning = [mismatchWarning, updateWarning].filter(Boolean).join(' ');
	}

	private onPeerData(socketId: string, data: Record<string, unknown>): void {
		const state = this.connectionController.currentGameState;
		const senderClientId = this.connectionController.getClient(socketId)?.clientId;
		const fromHost = Boolean(state && senderClientId !== undefined && senderClientId === state.hostId);
		if (data.type === 'app-version') {
			if (
				!state ||
				data.lobbyCode !== state.lobbyCode ||
				typeof data.version !== 'string' ||
				compareAppVersions(data.version, environment.desktopCompatVersion) === undefined ||
				senderClientId === undefined ||
				!state.players?.some((player) => player.clientId === senderClientId && !player.disconnected)
			)
				return;
			this.peerVersions[socketId] = data.version;
			this.updateVersionWarning(state, this.connectionController.localPLayer);
			return;
		}
		if (data.type === 'nos-radio-data') {
			const sender = state?.players.find((player) => player.clientId === senderClientId);
			if (
				!state ||
				state.mod !== 'NoS' ||
				(state.gameState !== GameState.TASKS && state.gameState !== GameState.DISCUSSION) ||
				data.lobbyCode !== state.lobbyCode ||
				!sender ||
				sender.disconnected ||
				data.playerId !== sender.id ||
				!Array.isArray(data.radios) ||
				data.radios.length > 8 ||
				!data.radios.every(isNosRadioData)
			)
				return;
			this.nosRadiosByPlayer[sender.id] = { clientId: sender.clientId, radios: data.radios, receivedAt: Date.now() };
			return;
		}
		if (data.type === 'toh4e-lobby' || data.type === 'toh4e-roster' || data.type === 'toh4e-role') {
			if (
				!state ||
				!fromHost ||
				data.lobbyCode !== state.lobbyCode ||
				state.gameState === GameState.MENU ||
				state.gameState === GameState.UNKNOWN
			)
				return;
		}
		if (data.type === 'toh4e-lobby' && typeof data.enabled === 'boolean') {
			if (data.roleCatalog !== undefined && !isTohRoleCatalog(data.roleCatalog)) return;
			this.tohCatalogReceivedAt = Date.now();
			this.tohRoleCatalog = data.enabled && isTohRoleCatalog(data.roleCatalog) ? data.roleCatalog : [];
			this.toh4eLobby = data.enabled;
			if (!data.enabled) {
				this.tohRoleOverride = null;
				this.tohRoleReceivedAt = 0;
				this.tohImpostors = [];
				this.tohGameStartNames = {};
			}
			return;
		}
		if (data.type === 'toh4e-roster' && Array.isArray(data.players)) {
			if (data.players.length > 20) return;
			const names: numberStringMap = {};
			for (const value of data.players) {
				if (!value || typeof value !== 'object') return;
				const player = value as { clientId?: unknown; name?: unknown };
				if (!Number.isInteger(player.clientId) || typeof player.name !== 'string' || player.name.length > 100) return;
				names[player.clientId as number] = player.name;
			}
			this.tohGameStartNames = names;
			this.toh4eLobby = true;
			return;
		}
		if (data.type === 'toh4e-role' && state) {
			const configuredName = normalizeUsername(this.connectionController.amongusUsername);
			const me =
				this.connectionController.localPLayer ??
				state.players.find((player) => {
					const originalName = this.tohGameStartNames[player.clientId] ?? player.name;
					return normalizeUsername(originalName) === configuredName;
				});
			if (
				!me ||
				data.targetClientId !== me.clientId ||
				data.targetPlayerId !== me.id ||
				(state.gameState !== GameState.TASKS && state.gameState !== GameState.DISCUSSION) ||
				(data.role !== null && !isTohRole(data.role)) ||
				(data.impostors !== undefined && !isTohImpostorEntries(data.impostors))
			)
				return;
			this.tohRoleOverride = isTohRole(data.role) ? data.role : null;
			this.tohImpostors = isTohImpostorEntries(data.impostors) ? data.impostors : [];
			this.tohRoleReceivedAt = Date.now();
			this.toh4eLobby = true;
			return;
		}
		if (Object.prototype.hasOwnProperty.call(data, 'impostorRadio')) {
			if (data.nosRadioKind !== undefined && data.nosRadioKind !== 0 && data.nosRadioKind !== 1) return;
			const clientId = this.connectionController.getClient(socketId)?.clientId;
			const myPlayer = this.connectionController.localPLayer;
			const sender = state?.players.find((player) => player.clientId === clientId);
			const version = data.impostorRadioVersion;
			if (
				!state ||
				clientId === undefined ||
				!myPlayer ||
				!sender ||
				typeof data.impostorRadio !== 'boolean' ||
				(typeof version === 'number'
					? !Number.isSafeInteger(version) || version < (this.radioStatusVersions[clientId] ?? 0)
					: this.radioStatusVersions[clientId] !== undefined) ||
				(data.impostorRadio &&
					((state.gameState !== GameState.TASKS && state.gameState !== GameState.DISCUSSION) ||
						sender.isDead ||
						(state.mod !== 'NoS' && !this.canUseRadio(state, sender))))
			)
				return;
			if (typeof version === 'number') this.radioStatusVersions[clientId] = version;
			if (state.mod === 'NoS')
				this.nosRadioKinds[clientId] = data.impostorRadio ? (data.nosRadioKind as number | undefined) : undefined;
			this.setRadioClientActive(clientId, data.impostorRadio);
			return;
		}

		if (Object.prototype.hasOwnProperty.call(data, 'maxDistance')) {
			// A defensive/parity path: mobile's primary lobby-settings source is the selected
			// Mobile Host's gameState broadcast, but any connected desktop peer that's the actual
			// Among Us game host also pushes its lobby settings over the data channel 1s after
			// connecting (desktop-to-desktop parity behavior) - only trust it from that host.
			if (!state || senderClientId === undefined || senderClientId !== state.hostId) return;
			this.onLobbySettingsChange(data as unknown as ILobbySettings);
		}
	}

	private isJackalRadioPlayer(state: AmongUsState, player: Player): boolean {
		return state.mod === 'SUPER_NEW_ROLES' && isSnrJackalTeam(player.snrRole);
	}

	private setRadioClientActive(clientId: number, active: boolean): void {
		const ids = new Set(this.impostorRadioClientIds);
		if (active) ids.add(clientId);
		else ids.delete(clientId);
		this.impostorRadioClientIds = [...ids];
		this.impostorRadioClientId = this.impostorRadioClientIds[0] ?? -1;
	}

	private getNosRadios(state: AmongUsState, player: Player): readonly NosRadioData[] | undefined {
		if (state.mod !== 'NoS') return undefined;
		if (player.clientId === this.connectionController.localPLayer?.clientId) return state.nosRadios;
		const report = this.nosRadiosByPlayer[player.id];
		return report?.clientId === player.clientId ? report.radios : undefined;
	}

	private senderNosRadioKind(state: AmongUsState, sender: Player): number | undefined {
		const selected =
			sender.clientId === this.connectionController.localPLayer?.clientId
				? this.heldNosRadio.kind
				: this.nosRadioKinds[sender.clientId];
		return resolveNosRadioKind(this.getNosRadios(state, sender), selected);
	}

	private canNosJackalRadioReach(state: AmongUsState, sender: Player, listener: Player): boolean {
		return (
			this.senderNosRadioKind(state, sender) === 1 &&
			canHearNosJackalRadio(this.getNosRadios(state, sender), listener.id)
		);
	}

	private canNosImpostorRadioReach(state: AmongUsState, sender: Player, listener: Player): boolean {
		return (
			this.senderNosRadioKind(state, sender) === 0 &&
			canHearNosImpostorRadio(this.getNosRadios(state, sender), listener.id)
		);
	}

	private canNosRadioReach(state: AmongUsState, sender: Player, listener: Player): boolean {
		const kind = this.senderNosRadioKind(state, sender);
		if (kind === undefined) return false;
		return canReceiveNosRadio(
			this.getNosRadios(state, sender)?.filter((radio) => radio.kind === kind),
			listener.id,
			this.connectionController.lobbySettings
		);
	}

	private canUseRadio(state: AmongUsState, player: Player): boolean {
		const settings = this.connectionController.lobbySettings;
		if (state.mod === 'NoS') {
			const kind =
				player.clientId === this.connectionController.localPLayer?.clientId ? this.heldNosRadio.kind : undefined;
			const radios = this.getNosRadios(state, player);
			return canUseNosRadio(kind === undefined ? radios : radios?.filter((radio) => radio.kind === kind), settings);
		}
		if (this.isJackalRadioPlayer(state, player)) {
			return settings.jackalRadioEnabled === true && settings.impostorRadioOnlyMode !== true;
		}
		return isPlayerImpostor(state.mod, player) &&
			(settings.impostorRadioEnabled || settings.impostorRadioOnlyMode === true);
	}

	private areRadioTeammates(state: AmongUsState, first: Player, second: Player): boolean {
		if (state.mod === 'NoS') return this.canNosRadioReach(state, first, second);
		if (this.isJackalRadioPlayer(state, first)) return this.isJackalRadioPlayer(state, second);
		return isPlayerImpostor(state.mod, first) && isPlayerImpostor(state.mod, second) &&
			!this.isJackalRadioPlayer(state, second);
	}

	private areRadioPartners(state: AmongUsState, first: Player, second: Player): boolean {
		if (state.mod === 'NoS') return this.canNosRadioReach(state, second, first);
		return this.areRadioTeammates(state, first, second) && this.canUseRadio(state, first);
	}
}
