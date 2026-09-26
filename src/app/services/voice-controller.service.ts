import { Injectable } from '@angular/core';
import { AmongUsState, GameState, numberStringMap, Player } from '../common/AmongUsState';
import { ILobbySettings } from '../common/ISettings';
import { PlayerConnectionState, PlayerSetting } from './smallInterfaces';
import { ConnectingStage, ConnectionController, ConnectionState } from './ConnectionController.service';
import { MobileHostService } from './mobile-host.service';
import { SettingsService } from './settings.service';
import { isToh4eHostName } from '../common/Mods';
import { isTohRole, TohRole } from '../common/TohRole';

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

export function matchLocalPlayer(players: Player[], username: string): { player: Player | undefined; ambiguous: boolean } {
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
	private impostorRadioPressed = false;
	private radioTransmitting = false;
	private toh4eLobby = false;
	private tohRoleOverride: TohRole | null = null;
	private tohRoleReceivedAt = 0;
	private tohGameStartNames: numberStringMap = {};
	private tohSession = '';

	constructor(
		private connectionController: ConnectionController,
		private mobileHostService: MobileHostService,
		private settingsService: SettingsService
	) {
		this.connectionController.events.on('hostUpdate', (state: AmongUsState, lobbySettings: ILobbySettings | undefined) => {
			try {
				this.onLobbySettingsChange(lobbySettings);
				this.onGameState(this.getEffectiveGameState(state));
			} catch (e) {
				console.error('ERROR:', e);
				this.connectionController.error = e.message;
				this.connectionController.connectionState = ConnectionState.error;
			}
		});
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
		this.impostorRadioPressed = false;
		this.radioTransmitting = false;
		this.toh4eLobby = false;
		this.tohRoleOverride = null;
		this.tohRoleReceivedAt = 0;
		this.tohGameStartNames = {};
		this.tohSession = '';
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
			this.tohGameStartNames = {};
		}

		const host = state.players?.find((player) => player.clientId === state.hostId);
		if (state.mod === 'TOH4E' || isToh4eHostName(host?.name) || isToh4eHostName(host?.appearanceName)) {
			this.toh4eLobby = true;
		}
		if (!this.toh4eLobby) return state;
		if (state.gameState === GameState.LOBBY || Date.now() - this.tohRoleReceivedAt > 5000) {
			this.tohRoleOverride = null;
		}

		const localName = normalizeUsername(this.connectionController.amongusUsername);
		return {
			...state,
			mod: 'TOH4E',
			players: state.players.map((player) => {
				const fixedName = this.tohGameStartNames[player.clientId];
				const namedPlayer = fixedName ? { ...player, name: fixedName, appearanceName: fixedName } : player;
				return normalizeUsername(namedPlayer.name) === localName
					? {
							...namedPlayer,
							tohRole: this.tohRoleOverride ?? namedPlayer.tohRole,
							roleName: this.tohRoleOverride?.roleName
								? `TOH4E: ${this.tohRoleOverride.roleName}`
								: namedPlayer.roleName,
						}
					: namedPlayer;
			}),
		};
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

		Object.keys(lobbySettings).forEach((field: string) => {
			if (field in settings) {
				if (lobbySettings[field] !== settings[field]) {
					changed = true;
					lobbySettings[field] = settings[field];
				}
			}
		});
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
		let maxDistance = lobbySettings.visionHearing
			? myPlayer.isImpostor
				? lobbySettings.maxDistance
				: state.lightRadius + 0.5
			: lobbySettings.maxDistance;
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
				this.impostorRadioClientId
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
	public applyImpostorRadio(pressing: boolean): void {
		this.impostorRadioPressed = pressing;
		this.updateImpostorRadioTransmission();
	}

	private updateImpostorRadioTransmission(): void {
		const connectionController = this.connectionController;
		const state = connectionController.currentGameState;
		const myPlayer = connectionController.localPLayer;
		const granted =
			this.impostorRadioPressed &&
			state?.gameState === GameState.TASKS &&
			myPlayer !== undefined &&
			myPlayer.isImpostor &&
			!myPlayer.isDead &&
			(this.impostorRadioClientId === -1 || this.impostorRadioClientId === myPlayer.clientId) &&
			connectionController.lobbySettings.impostorRadioEnabled;

		if (granted === this.radioTransmitting) return;
		this.radioTransmitting = granted;
		connectionController.audioController.setRadioTransmitting(granted);
		this.impostorRadioClientId = granted && myPlayer ? myPlayer.clientId : -1;

		void (granted ? radioOnAudio : radioOffAudio).play().catch(() => {
			/* autoplay blocked */
		});

		const playerSocketIds = connectionController.playerSocketIds;
		const targets = (state?.players ?? [])
			.filter((player) => player.clientId !== myPlayer?.clientId && !player.bugged)
			.map((player) => playerSocketIds[player.clientId])
			.filter((peerId): peerId is string => Boolean(peerId));
		connectionController.sendToPeers(targets, JSON.stringify({ impostorRadio: granted }));
	}

	private cleanupImpostorRadio(state: AmongUsState, myPlayer: Player | undefined): void {
		if (this.impostorRadioClientId === -1) return;

		if (!state.players || !myPlayer || state.gameState !== GameState.TASKS) {
			this.impostorRadioClientId = -1;
			return;
		}
		if (this.impostorRadioClientId === myPlayer.clientId) return;

		const peerId = this.connectionController.playerSocketIds[this.impostorRadioClientId];
		const stillActive =
			Boolean(peerId) &&
			this.connectionController.audioController.hasPeer(peerId) &&
			state.players.some(
				(player) =>
					player.clientId !== myPlayer.clientId &&
					player.clientId === this.impostorRadioClientId &&
					player.isImpostor &&
					!player.isDead &&
					!player.disconnected &&
					!player.bugged
			);

		if (!stillActive) {
			this.impostorRadioClientId = -1;
		}
	}

	private onPeerData(socketId: string, data: Record<string, unknown>): void {
		const state = this.connectionController.currentGameState;
		const senderClientId = this.connectionController.getClient(socketId)?.clientId;
		const fromHost = Boolean(state && senderClientId !== undefined && senderClientId === state.hostId);
		if (data.type === 'toh4e-lobby' || data.type === 'toh4e-roster' || data.type === 'toh4e-role') {
			if (
				!state ||
				!fromHost ||
				data.lobbyCode !== state.lobbyCode ||
				state.gameState === GameState.MENU ||
				state.gameState === GameState.UNKNOWN
			) return;
		}
		if (data.type === 'toh4e-lobby' && typeof data.enabled === 'boolean') {
			this.toh4eLobby = data.enabled;
			if (!data.enabled) {
				this.tohRoleOverride = null;
				this.tohRoleReceivedAt = 0;
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
			const me = this.connectionController.localPLayer ?? state.players.find((player) => {
				const originalName = this.tohGameStartNames[player.clientId] ?? player.name;
				return normalizeUsername(originalName) === configuredName;
			});
			if (
				!me ||
				data.targetClientId !== me.clientId ||
				data.targetPlayerId !== me.id ||
				(state.gameState !== GameState.TASKS && state.gameState !== GameState.DISCUSSION) ||
				(data.role !== null && !isTohRole(data.role))
			) return;
			this.tohRoleOverride = isTohRole(data.role) ? data.role : null;
			this.tohRoleReceivedAt = Date.now();
			this.toh4eLobby = true;
			return;
		}
		if (Object.prototype.hasOwnProperty.call(data, 'impostorRadio')) {
			const clientId = this.connectionController.getClient(socketId)?.clientId;
			if (clientId === undefined) return;
			if (this.impostorRadioClientId === -1 && data.impostorRadio) {
				this.impostorRadioClientId = clientId;
			} else if (this.impostorRadioClientId === clientId && !data.impostorRadio) {
				this.impostorRadioClientId = -1;
			}
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
}
