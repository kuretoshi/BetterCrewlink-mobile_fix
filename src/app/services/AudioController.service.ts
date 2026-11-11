import { connectReverbMix, createReverbMix, reverbLevels } from '../voice/reverbMix';
import { setEffectGain } from '../voice/effectGain';
import { createVoicePeakGuard } from '../voice/voicePeakGuard';
import { applyVoiceJamming } from '../common/VoiceJammingState';
import { hasTanukiAddon } from '../common/tanukiAddon';
import { createParrotRecording } from '../voice/parrotRecording';
import { createInterviewerRecording } from '../voice/interviewerRecording';
import { createDyingVoiceRecording, inDyingVoiceRange } from '../voice/dyingVoiceRecording';
import { EventEmitter as EventEmitterO } from 'events';
import { AmongUsState, GameState, Player } from '../common/AmongUsState';
import { ILobbySettings, ISettings } from '../common/ISettings';
import { IDeviceInfo } from './smallInterfaces';
import { combineVoiceEffectTunings, getVoiceEffectTuning, VoiceEffectTuning } from '../common/VoiceEffectTuning';
import { ConnectingStage, ConnectionController } from './ConnectionController.service';
import { SettingsService } from './settings.service';
import { calculateVoiceAudio } from '../voice/spatialAudio';
import { calculateRokuroVoice, createRokuroVoice } from '../voice/rokuroVoice';
import { PeerAudioNodes, RadioEchoNodes } from '../voice/types';
import VAD from './vad';
import { voiceRoleLevel } from './voice-role-level';
import { selectVoiceEffect, shouldApplyRainbowStarEcho } from '../voice/voiceEffectRules';
import { createTunedVoiceEffect } from '../voice/tunedVoiceEffect';
import {
	prepareSourceFilter,
	disconnectProcessingEffect,
} from '../voice/sourceFilterEffect';

import { createBibiriEcho, updateBibiriEcho, stopBibiriEcho, disconnectBibiriEcho } from '../voice/bibiriEcho';

const REVERB_URL = 'assets/sounds/reverb.ogx';

export default class AudioController {
	constructor(
		private connectionController: ConnectionController,
		private settingsService: SettingsService
	) {}

	audioDeviceId = 'default';
	/** Outbound stream sent to peers - the raw mic stream, or a processed one when mic gain is enabled. */
	stream: MediaStream;
	permissionRequested: boolean;
	audioMuted: boolean;
	microphoneMuted: boolean;
	localTalking: boolean;
	/** True while the local player is holding down impostor radio; overrides mic mute, matching desktop. */
	radioTransmitting = false;
	private jammed = false;
	public events: EventEmitterO = new EventEmitterO();

	// Single shared context + master bus for everything this controller plays, mirroring
	// desktop's AudioController. Replaces mobile's previous one-AudioContext-per-peer model,
	// which leaked a context on every connect/reconnect and made master/ghost volume impossible
	// to apply (there was no single node all peers passed through).
	private context?: AudioContext;
	private masterGain?: GainNode;
	private masterDestination?: MediaStreamAudioDestinationNode;
	private masterElement?: HTMLAudioElement;
	private useContextSink = false;
	private convolverBuffer: AudioBuffer | null = null;
	private sourceFilterReady = false;
	private peers = new Map<string, PeerAudioNodes>();
	// Input chain (desktop's createInputChain): raw mic stream -> optional microphoneGain ->
	// optional processed MediaStreamDestination. `stream` above is the last stage's output.
	private parrotCommsBlocked = false;
	private parrots?: ReturnType<typeof createParrotRecording>;
	private interviewer?: ReturnType<typeof createInterviewerRecording>;
	private interviewMic?: { stream: MediaStream; source: MediaStreamAudioSourceNode };
	private interviewMuted = new Set<string>();
	private inputStream?: MediaStream;
	private voiceRoleTimer?: ReturnType<typeof setInterval>;
	private voiceRoleAnalyser?: AnalyserNode;
	private inputSource?: MediaStreamAudioSourceNode;
	private microphoneGain?: GainNode;
	private inputDestination?: MediaStreamAudioDestinationNode;
	private maxDistance = 2;
	private audioListener?: ReturnType<typeof VAD>;
	private audioElementsContainer = document.getElementById('AudioElements');

	async startAudio() {
		if (this.stream) {
			this.connectionController.updateConnectingStage(ConnectingStage.startingMicrophone);
			return;
		}

		this.ensureOutputBus();
		try {
			await prepareSourceFilter(this.context);
			this.sourceFilterReady = true;
		} catch (error) {
			console.warn('NoS source-filter audio is unavailable', error);
		}

		const settings = this.settingsService.get();
		const audio: MediaTrackConstraintSet = {
			deviceId: this.connectionController.deviceID,
			autoGainControl: settings.autoGainControl,
			echoCancellation: settings.echoCancellation,
			noiseSuppression: settings.noiseSuppression,
		};
		const inputStream = await navigator.mediaDevices.getUserMedia({ video: false, audio });
		this.inputStream = inputStream;
		this.stream = inputStream;

		const context = this.context;
		const inputSource = context.createMediaStreamSource(inputStream);
		this.inputSource = inputSource;
		this.syncTanukiAddon(this.connectionController.currentGameState);

		// Desktop's createInputChain: only wire a manual gain stage when a mic setting asks for
		// one and AGC isn't already doing it; the processed stream becomes what peers receive.
		if ((settings.microphoneGainEnabled || settings.micSensitivityEnabled) && !settings.autoGainControl) {
			const microphoneGain = context.createGain();
			const destination = context.createMediaStreamDestination();
			inputSource.connect(microphoneGain);
			microphoneGain.gain.value = settings.microphoneGainEnabled ? settings.microphoneGain / 100 : 1;
			microphoneGain.connect(destination);
			this.microphoneGain = microphoneGain;
			this.inputDestination = destination;
			this.stream = destination.stream;
		}

		const audioListener = VAD(context, inputSource, undefined, {
			onVoiceStart: () => {
				if (this.jammed) return;
				if (this.microphoneGain) {
					const current = this.settingsService.get();
					if (current.micSensitivityEnabled && !current.autoGainControl) {
						this.microphoneGain.gain.value = current.microphoneGainEnabled ? current.microphoneGain / 100 : 1;
					}
				}
				this.localTalking = true;
				this.events.emit('local_talk', true);
				this.connectionController?.socketIOClient?.emit('VAD', true);
			},
			onVoiceStop: () => {
				if (this.microphoneGain) {
					const current = this.settingsService.get();
					if (current.micSensitivityEnabled && !current.autoGainControl) {
						this.microphoneGain.gain.value = 0;
					}
				}
				this.localTalking = false;
				this.events.emit('local_talk', false);
				this.connectionController?.socketIOClient?.emit('VAD', false);
			},
			stereo: false,
		});
		audioListener.options.minNoiseLevel =
			settings.micSensitivityEnabled && !settings.autoGainControl ? settings.micSensitivity : 0.15;
		audioListener.options.maxNoiseLevel = 1;
		audioListener.init();
		this.audioListener = audioListener;

		this.applyTrackEnabled();
		this.connectionController.updateConnectingStage(ConnectingStage.startingMicrophone);
	}

	/** Applies live changes to mic gain/sensitivity without tearing the input chain down. */
	updateMicrophoneSettings(settings: ISettings): void {
		if (!this.microphoneGain?.gain) return;
		if (settings.autoGainControl) return;
		if (!settings.microphoneGainEnabled && !settings.micSensitivityEnabled) return;

		if (!settings.micSensitivityEnabled) {
			this.microphoneGain.gain.value = settings.microphoneGainEnabled ? settings.microphoneGain / 100 : 1;
		}
		if (this.audioListener?.options) {
			this.audioListener.options.minNoiseLevel = settings.micSensitivityEnabled ? settings.micSensitivity : 0.15;
			this.audioListener.init();
		}
	}

	/** Routes output to a selected speaker/headset where the platform supports sink selection. */
	setSpeaker(deviceId: string | undefined): void {
		const sinkId = !deviceId || deviceId.toLowerCase() === 'default' ? '' : deviceId;
		const onError = (error: unknown) => console.warn('Failed to set audio output device', error);

		if (this.useContextSink) {
			const context = this.context as (AudioContext & { setSinkId?: (id: string) => Promise<void> }) | undefined;
			context?.setSinkId?.(sinkId).catch(onError);
			return;
		}

		this.masterElement?.setSinkId(sinkId).catch(onError);
	}

	/** Held impostor radio overrides mic mute, mirroring desktop's setRadioTransmitting/applyTrackEnabled. */
	setRadioTransmitting(transmitting: boolean): void {
		this.radioTransmitting = transmitting;
		this.applyTrackEnabled();
	}

	setJammed(jammed: boolean): void {
		this.jammed = jammed;
		if (jammed && this.localTalking) {
			this.localTalking = false;
			this.events.emit('local_talk', false);
			this.connectionController?.socketIOClient?.emit('VAD', false);
		}
		this.applyTrackEnabled();
	}

	private applyTrackEnabled(): void {
		const track = this.stream?.getAudioTracks()[0];
		if (!track) return;
		track.enabled = !this.jammed && (this.radioTransmitting || (!this.microphoneMuted && !this.audioMuted));
	}

	private ensureOutputBus() {
		if (this.context) {
			this.syncTanukiAddon(this.connectionController.currentGameState);
			return;
		}

		const AudioContextCtor = window.webkitAudioContext || window.AudioContext;
		const context = new AudioContextCtor();
		this.context = context;
		void context.resume().catch(() => {
			/* resumed on first user gesture instead */
		});

		const masterGain = context.createGain();
		masterGain.gain.value = 1;
		this.masterGain = masterGain;
		this.syncTanukiAddon(this.connectionController.currentGameState);

		this.useContextSink = 'setSinkId' in AudioContext.prototype;
		if (this.useContextSink) {
			masterGain.connect(context.destination);
		} else {
			const masterDestination = context.createMediaStreamDestination();
			masterGain.connect(masterDestination);
			const element = document.createElement('audio');
			element.setAttribute('autoplay', '');
			element.setAttribute('playsinline', 'true');
			element.srcObject = masterDestination.stream;
			this.audioElementsContainer?.appendChild(element);
			this.masterDestination = masterDestination;
			this.masterElement = element;
		}

		this.setSpeaker(this.settingsService.get().selectedSpeaker?.deviceId);
		void this.loadConvolverBuffer();
	}

	private async loadConvolverBuffer() {
		const context = this.context;
		if (!context) return;
		try {
			const response = await fetch(REVERB_URL);
			const buffer = await context.decodeAudioData(await response.arrayBuffer());
			this.convolverBuffer = buffer;
			for (const peer of this.peers.values()) {
				peer.reverb.buffer = buffer;
			}
		} catch (error) {
			console.warn('Failed to load reverb impulse response', error);
		}
	}

	changeMuteState(microphoneMuted: boolean, audioMuted: boolean) {
		this.microphoneMuted = microphoneMuted;
		this.audioMuted = audioMuted;
		if (audioMuted) {
			this.interviewer?.silence();
			this.parrots?.silence();
		}

		if (this.audioMuted) {
			this.silenceAllPeers();
		}
		this.applyTrackEnabled();
	}

	setMaxDistance(maxDistance: number): void {
		this.maxDistance = maxDistance;
		for (const peer of this.peers.values()) {
			peer.pan.maxDistance = maxDistance;
		}
	}

	hasPeer(peerId: string): boolean {
		return this.peers.has(peerId);
	}

	addPeer(peerId: string, stream: MediaStream): void {
		if (this.peers.get(peerId)?.stream === stream) return;
		this.removePeer(peerId);

		this.ensureOutputBus();
		const context = this.context;
		const masterGain = this.masterGain;
		if (!context || !masterGain) return;

		// Mobile WebViews are pickier than desktop's Electron/Chromium about actually pulling
		// data from a MediaStreamTrack that's only wired into a WebAudio graph - keep the stream
		// attached (hidden, unplayed through the DOM) to an <audio> element too, matching the
		// pre-refactor mobile behavior this replaces.
		const dummyAudioElement = document.createElement('audio');
		dummyAudioElement.setAttribute('playsinline', 'true');
		dummyAudioElement.srcObject = stream;
		this.audioElementsContainer?.appendChild(dummyAudioElement);

		const source = context.createMediaStreamSource(stream);

		const gain = context.createGain();
		gain.gain.value = 0;

		const pan = context.createPanner();
		pan.refDistance = 0.1;
		pan.panningModel = 'equalpower';
		pan.distanceModel = 'linear';
		pan.maxDistance = this.maxDistance;
		pan.rolloffFactor = 1;

		const muffle = context.createBiquadFilter();
		muffle.type = 'lowpass';

		const reverb = context.createConvolver();
		reverb.buffer = this.convolverBuffer;
		const radioEcho = createRadioEcho(context);

		source.connect(pan);
		pan.connect(gain);
		gain.connect(masterGain);

		this.peers.set(peerId, {
			stream,
			dummyAudioElement,
			gain,
			pan,
			reverb,
			muffle,
			muffleConnected: false,
			reverbConnected: false,
			voiceEffectConnected: false,
			radioEcho,
			radioEchoConnected: false,
			source,
		});
		this.syncTanukiAddon(this.connectionController.currentGameState);
	}

	removePeer(peerId: string): void {
		this.parrots?.removeInput(peerId);
		this.interviewer?.removeInput(peerId);
		this.interviewMuted.delete(peerId);
		const peer = this.peers.get(peerId);
		if (!peer) return;
		this.peers.delete(peerId);
		peer.dyingVoiceRecording?.disconnect();

		this.teardownAudioElement(peer.dummyAudioElement);
		peer.source.disconnect();
		peer.pan.disconnect();
		peer.rokuroVoice?.disconnect();
		peer.gain.disconnect();
		peer.reverb?.disconnect();
		if (peer.reverbMix) for (const node of Object.values(peer.reverbMix)) node.disconnect();
		peer.muffle?.disconnect();
		if (peer.voiceEffect) disconnectProcessingEffect(peer.voiceEffect);
		peer.peakGuard?.disconnect();
		disconnectRadioEcho(peer.radioEcho);
		if (peer.bibiriEcho) disconnectBibiriEcho(peer.bibiriEcho);
	}

	private teardownAudioElement(element: HTMLAudioElement): void {
		element.pause();
		if (element.srcObject) {
			(element.srcObject as MediaStream).getTracks().forEach((track) => track.stop());
		}
		element.removeAttribute('src');
		element.srcObject = null;
		element.load();
		element.remove();
	}

	silenceAllPeers(clearRecordings = false): void {
		if (clearRecordings) this.parrots?.clear();
		else this.parrots?.silence();
		if (clearRecordings) this.interviewer?.clear();
		else this.interviewer?.silence();
		for (const [peerId, peer] of this.peers) {
			peer.dyingVoiceRecording?.cancel();
			this.setPeerGain(peerId, 0);
			if (peer.bibiriEcho) stopBibiriEcho(peer.bibiriEcho);
		}
	}

	silencePeersExcept(peerIds: string[]): void {
		for (const [peerId, peer] of this.peers) {
			if (!peerIds.includes(peerId)) {
				peer.dyingVoiceRecording?.cancel();
				this.setPeerGain(peerId, 0);
				if (peer.bibiriEcho) stopBibiriEcho(peer.bibiriEcho);
			}
		}
	}

	setDyingVoicePlaybackVolume(peerId: string, volume: number): void {
		this.parrots?.setVolume(peerId, volume);
		if (volume > 0) this.interviewMuted.delete(peerId);
		else this.interviewMuted.add(peerId);
		this.peers.get(peerId)?.dyingVoiceRecording?.setVolume(volume);
		const echo = this.peers.get(peerId)?.bibiriEcho;
		if (echo && volume <= 0) stopBibiriEcho(echo);
	}

	isCloneTalking(id: number): boolean {
		return this.parrots?.isCloneTalking(id) ?? false;
	}

	private updateInterviewer(state: AmongUsState): void {
		const local = this.connectionController.localPLayer;
		if (local && this.stream && this.context) {
			if (this.interviewMic?.stream !== this.stream) {
				this.interviewMic?.source.disconnect();
				this.interviewMic = { stream: this.stream, source: this.context.createMediaStreamSource(this.stream) };
			}
			if (state.nosParrots?.length)
				this.parrots?.setInput(
					'local',
					this.interviewMic.source,
					local.id,
					() =>
						!this.parrotCommsBlocked &&
						!this.microphoneMuted &&
						!this.audioMuted &&
						!this.jammed &&
						!this.radioTransmitting &&
						!!this.stream?.getAudioTracks()[0]?.enabled
				);
			this.interviewer?.setInput(
				'local',
				this.interviewMic.source,
				local.id,
				() => !this.microphoneMuted && !this.audioMuted && !this.jammed && !!this.stream?.getAudioTracks()[0]?.enabled
			);
		}
		this.parrots?.update(
			state.nosParrots ?? [],
			state,
			local,
			this.audioMuted || this.parrotCommsBlocked ? 0 : this.settingsService.get().masterVolume / 100,
			state.nosVoiceFrameTime ?? NaN
		);
		this.interviewer?.update(
			state.nosInterviews ?? [],
			state.mod === 'NoS' && (state.gameState === GameState.TASKS || state.gameState === GameState.DISCUSSION),
			state.gameState === GameState.DISCUSSION,
			this.audioMuted ? 0 : this.settingsService.get().masterVolume / 100,
			state.nosVoiceFrameTime
		);
	}

	clearDyingVoicesOutsideGame(state: AmongUsState): void {
		this.syncTanukiAddon(state);
		if (!hasTanukiAddon(state)) return;
		this.updateInterviewer(state);
		if (state.mod === 'NoS' && (state.gameState === GameState.TASKS || state.gameState === GameState.DISCUSSION))
			return;
		for (const peer of this.peers.values()) peer.dyingVoiceRecording?.cancel();
	}

	setPeerGain(peerId: string, gain: number): void {
		const peer = this.peers.get(peerId);
		if (!peer) return;
		const headGain = peer.rokuroVoice?.setGain(gain) ?? gain;
		peer.gain.gain.value = headGain;
		for (const output of [peer.voiceEffect?.output, peer.reverbMix?.output, peer.radioEcho?.output])
			if (output) output.gain.value = headGain > 0 ? 1 : 0;
	}
	stopPeerDeathEcho(peerId: string): void {
		const echo = this.peers.get(peerId)?.bibiriEcho;
		if (echo) stopBibiriEcho(echo);
	}

	/**
	 * Returns the pre-volume gain for the peer, or `null` when the peer has no audio graph yet.
	 */
	applyVoiceAudio(
		peerId: string,
		state: AmongUsState,
		settings: ISettings,
		activeLobbySettings: ILobbySettings,
		me: Player,
		other: Player,
		impostorRadioClientId: number,
		impostorRadioClientIds?: readonly number[],
		nosJackalRadioHearable?: boolean,
		nosImpostorRadioHearable?: boolean
	): number | null {
		this.parrotCommsBlocked = activeLobbySettings.commsSabotage && state.comsSabotaged && !me.isImpostor;
		if (this.parrotCommsBlocked) this.parrots?.silence();
		const peer = this.peers.get(peerId);
		const destination = this.masterGain;
		if (!peer || !destination) return null;
		if (hasTanukiAddon(state)) {
		if (state.nosParrots?.length)
			this.parrots?.setInput(
				peerId,
				peer.source,
				other.id,
				() =>
					!this.parrotCommsBlocked &&
					!this.audioMuted &&
					!other.disconnected &&
					!this.interviewMuted.has(peerId) &&
					!(impostorRadioClientIds ?? [impostorRadioClientId]).includes(other.clientId)
			);
			this.interviewer?.setInput(
				peerId,
				peer.source,
				other.id,
				() => !this.audioMuted && !other.disconnected && !this.interviewMuted.has(peerId)
			);
			const message = state.nosDyingVoices?.find((entry) => entry.playerId === other.id);
			peer.dyingVoiceRecording?.update(
				message,
				state.mod === 'NoS' &&
					(state.gameState === GameState.TASKS || state.gameState === GameState.DISCUSSION) &&
					other.isDead &&
					!other.disconnected &&
					Number.isFinite(state.nosVoiceFrameTime),
				inDyingVoiceRange(message, me, state.gameState === GameState.TASKS) && !this.audioMuted,
				state.nosVoiceFrameTime
			);
		}

		// Mobile-only: a local "mute all incoming audio" toggle desktop doesn't have.
		if (this.audioMuted) {
			peer.gain.gain.value = 0;
		}

		if (hasTanukiAddon(state) && peer.bibiriEcho)
			updateBibiriEcho(
				peer.bibiriEcho,
				state.mod === 'NoS' &&
					(settings.nosBibiriEchoStrength ?? 100) > 0 &&
					!other.disconnected &&
					!this.audioMuted &&
					(state.gameState === GameState.TASKS || state.gameState === GameState.DISCUSSION),
				other.isDead,
				state.nosBibiriEchoes?.find((e) => e.playerId === other.id)?.unixMs,
				state.nosVoiceFrameTime,
				getVoiceEffectTuning(settings, 'nosBibiri'),
				this.convolverBuffer,
				this.sourceFilterReady
			);
		const { pan, muffle } = peer;
		const voiceInput = {
			state,
			settings,
			activeLobbySettings,
			me,
			other,
			maxDistance: this.maxDistance,
			impostorRadioClientId,
			impostorRadioClientIds,
			nosJackalRadioHearable,
			nosImpostorRadioHearable,
		};
		const result = calculateVoiceAudio(voiceInput);
		if (this.audioMuted) result.gain = 0;

		pan.maxDistance = result.panMaxDistance ?? this.maxDistance;
		applyVoiceJamming(state, other.id, result);
		const rokuro = !this.audioMuted ? calculateRokuroVoice(voiceInput) : undefined;
		if (rokuro && this.context) {
			if (!peer.rokuroVoice) { peer.rokuroVoice = createRokuroVoice(this.context, peer.source, destination); peer.rokuroDestinationChanged = true; }
		} else if (peer.rokuroVoice) {
			peer.rokuroVoice.disconnect(); peer.rokuroVoice = undefined; peer.rokuroDestinationChanged = true;
		}
		if (state.mod === 'NoS' && (state.gameState === GameState.TASKS || state.gameState === GameState.DISCUSSION) &&
			state.nosLimitSpeechMuted?.includes(other.id)) result.gain = 0;

		if (result.muffle) {
			muffle.type = result.muffle.type;
			muffle.frequency.value = result.muffle.frequency;
			muffle.Q.value = result.muffle.q;
		}

		const effect =
			result.gain > 0
				? selectVoiceEffect(
						state,
						settings,
						activeLobbySettings,
						me,
						other,
						impostorRadioClientId,
						impostorRadioClientIds
					)
				: null;
		const tunings: VoiceEffectTuning[] = effect ? [effect.tuning] : [];
		if (result.gain > 0 && shouldApplyRainbowStarEcho(state, other, activeLobbySettings, settings))
			tunings.push(getVoiceEffectTuning(settings, 'nosRainbowStar'));
		const falling = result.reverbStrength !== undefined;
		if (result.gain > 0 && falling && activeLobbySettings.snrPushReverb !== false)
			tunings.push(getVoiceEffectTuning(settings, 'snrPush'));
		const tuning = combineVoiceEffectTunings(tunings);
		const roleReverb = !!this.convolverBuffer && tuning.reverb > 0;
		const ordinaryReverb = falling ? false : result.reverb;
		const wantReverb =
			roleReverb || (ordinaryReverb === null ? peer.reverbConnected && !peer.roleReverbConnected : ordinaryReverb);
		if (wantReverb && this.context) {
			if (!peer.reverb) {
				peer.reverb = this.context.createConvolver();
				peer.reverb.buffer = this.convolverBuffer;
			}
			peer.reverbMix ??= createReverbMix(this.context);
			const strength =
				ordinaryReverb === true
					? Math.max(tuning.reverb, result.reverbStrength ?? 100)
					: roleReverb
						? tuning.reverb
						: 100;
			const levels = reverbLevels(strength);
			setEffectGain(peer.reverbMix.dry, levels.dry);
			setEffectGain(peer.reverbMix.wet, levels.wet);
		}
		const wantMuffle = result.muffle === null ? peer.muffleConnected : result.muffle !== false;
		const wantRadioEcho = result.radioEcho;
		if (wantRadioEcho && this.context) peer.radioEcho ??= createRadioEcho(this.context);
		const grit =
			effect?.id === 'nosBerserker'
				? Math.max(Math.abs(effect.tuning.pitch), effect.tuning.reverb, effect.tuning.echo)
				: 0;
		const wantProcessing = tuning.pitch !== 0 || tuning.echo > 0 || grit > 0;
		if (wantProcessing && this.context) {
			if (peer.voiceEffect && (!('kind' in peer.voiceEffect) || peer.voiceEffect.kind !== 'tuned')) {
				disconnectProcessingEffect(peer.voiceEffect);
				peer.voiceEffect = undefined;
				peer.voiceEffectConnected = false;
			}
			peer.voiceEffect ??= createTunedVoiceEffect(this.context);
			if ('kind' in peer.voiceEffect && peer.voiceEffect.kind === 'tuned')
				peer.voiceEffect.update(tuning, grit, this.sourceFilterReady);
		} else if (peer.voiceEffect) {
			disconnectProcessingEffect(peer.voiceEffect);
			peer.voiceEffect = undefined;
		}
		rebuildEffectChain(peer, peer.rokuroVoice?.mix ?? destination, wantReverb, wantMuffle, wantRadioEcho, wantProcessing);
		peer.roleReverbConnected = roleReverb && peer.reverbConnected;

		if (result.panPosition) {
			const time = pan.context.currentTime;
			pan.positionX.setValueAtTime(result.panPosition[0], time);
			pan.positionY.setValueAtTime(result.panPosition[1], time);
			pan.positionZ.setValueAtTime(-0.5, time);
		}

		return rokuro && peer.rokuroVoice ? peer.rokuroVoice.configure(
			result.gain * rokuro.settings.headVolume / 100, rokuro.body.gain * rokuro.settings.bodyVolume / 100,
			rokuro.body.panPosition, rokuro.body.panMaxDistance ?? this.maxDistance, rokuro.settings.bodyEcho,
			rokuro.body.muffle ? rokuro.body.muffle.frequency : 1800) : result.gain;
	}

	private syncTanukiAddon(state: AmongUsState | undefined): void {
		if (!hasTanukiAddon(state)) {
			this.stopTanukiAddon();
			return;
		}
		const context = this.context,
			destination = this.masterGain;
		if (!context || !destination) return;
		this.interviewer ??= createInterviewerRecording(context, destination);
		this.parrots ??= createParrotRecording(context, destination);
		const inputSource = this.inputSource;
		if (inputSource && !this.voiceRoleAnalyser) {
			const analyser = context.createAnalyser();
			analyser.fftSize = 2048;
			analyser.smoothingTimeConstant = 0;
			inputSource.connect(analyser);
			this.voiceRoleAnalyser = analyser;
			const samples = new Float32Array(analyser.fftSize);
			this.voiceRoleTimer = setInterval(() => {
				if (this.voiceRoleAnalyser !== analyser || !hasTanukiAddon(this.connectionController.currentGameState)) return;
				analyser.getFloatTimeDomainData(samples);
				let sum = 0;
				for (const sample of samples) sum += sample * sample;
				const track = this.inputStream?.getAudioTracks()[0];
				const active =
					!!track &&
					track.enabled &&
					track.readyState === 'live' &&
					!track.muted &&
					context.state === 'running' &&
					!this.microphoneMuted &&
					!this.audioMuted &&
					!this.jammed;
				const rms = Math.min(1, Math.sqrt(sum / samples.length));
				this.events.emit(
					'voiceRoleSample',
					voiceRoleLevel(rms, this.settingsService.get().nosRoleMicrophoneSensitivity),
					active
				);
			}, 50);
		}
		for (const peer of this.peers.values()) {
			peer.dyingVoiceRecording ??= createDyingVoiceRecording(context, peer.source, destination);
			peer.bibiriEcho ??= createBibiriEcho(context, peer.gain, destination);
		}
	}

	private stopTanukiAddon(): void {
		this.parrots?.disconnect();
		this.parrots = undefined;
		if (this.voiceRoleTimer !== undefined) clearInterval(this.voiceRoleTimer);
		this.voiceRoleTimer = undefined;
		if (this.voiceRoleAnalyser) this.inputSource?.disconnect(this.voiceRoleAnalyser);
		this.voiceRoleAnalyser?.disconnect();
		this.voiceRoleAnalyser = undefined;
		this.interviewer?.disconnect();
		this.interviewer = undefined;
		this.interviewMic?.source.disconnect();
		this.interviewMic = undefined;
		for (const peer of this.peers.values()) {
			peer.dyingVoiceRecording?.disconnect();
			peer.dyingVoiceRecording = undefined;
			if (peer.bibiriEcho) {
				peer.gain.disconnect(peer.bibiriEcho.input);
				disconnectBibiriEcho(peer.bibiriEcho);
				peer.bibiriEcho = undefined;
			}
		}
	}

	disconnect() {
		this.stopTanukiAddon();
		this.interviewer?.disconnect();
		this.interviewer = undefined;
		if (this.voiceRoleTimer) clearInterval(this.voiceRoleTimer);
		this.voiceRoleTimer = undefined;
		this.voiceRoleAnalyser?.disconnect();
		this.voiceRoleAnalyser = undefined;
		this.audioListener?.destroy();
		this.audioListener = undefined;

		this.parrots?.removeInput('local');
		this.interviewer?.removeInput('local');
		this.interviewMic?.source.disconnect();
		this.interviewMic = undefined;
		this.inputSource?.disconnect();
		this.inputSource = undefined;

		this.microphoneGain?.disconnect();
		this.microphoneGain = undefined;

		this.inputDestination?.disconnect();
		this.inputDestination = undefined;

		if (this.inputStream) {
			this.inputStream.getTracks().forEach((track) => track.stop());
			this.inputStream = undefined;
		}
		this.stream = undefined;
		for (const peerId of Array.from(this.peers.keys())) {
			this.removePeer(peerId);
		}
	}

	async requestPermissions() {
		if (!this.permissionRequested) {
			const stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
			stream.getTracks().forEach((track) => {
				track.stop();
			});
			this.permissionRequested = true;
		}
	}

	async getDevices(output = true): Promise<IDeviceInfo[]> {
		await this.requestPermissions();
		let deviceId = 0;
		return (await navigator.mediaDevices.enumerateDevices())
			.filter((o) => (o.kind === 'audiooutput' && output) || o.kind === 'audioinput')
			.sort((a, b) => b.kind.localeCompare(a.kind))
			.map((o) => {
				const id = deviceId++;
				return {
					id,
					kind: o.kind,
					label: o.label || `mic ${o.kind.charAt(5)} ${id}`,
					deviceId: o.deviceId,
				};
			});
	}
}

export function rebuildEffectChain(
	peer: PeerAudioNodes,
	destination: AudioNode,
	wantReverb: boolean,
	wantMuffle: boolean,
	wantRadioEcho: boolean,
	wantVoiceEffect: boolean
): void {
	const effect = peer.voiceEffect;
	const wantPeakGuard =
		wantReverb ||
		(wantVoiceEffect &&
			!!effect &&
			(!('kind' in effect) || effect.kind !== 'tuned' || !!(effect.pitch || effect.berserker || effect.echo)));
	if (
		peer.reverbConnected === wantReverb &&
		peer.muffleConnected === wantMuffle &&
		peer.radioEchoConnected === wantRadioEcho &&
		peer.voiceEffectConnected === wantVoiceEffect &&
		!!peer.peakGuard === wantPeakGuard && !peer.rokuroDestinationChanged
	)
		return;
	peer.rokuroDestinationChanged = false;

	for (const node of [peer.gain, peer.muffle, peer.reverb, peer.radioEcho?.output]) {
		try {
			node?.disconnect();
		} catch {
			/* not connected */
		}
	}
	peer.peakGuard?.output.disconnect();
	// Chain rebuilds disconnect gain, including this live audio tap.
	if (peer.bibiriEcho) peer.gain.connect(peer.bibiriEcho.input);

	const chain: AudioNode[] = [peer.gain];
	if (wantVoiceEffect && peer.voiceEffect) {
		peer.voiceEffect.output.disconnect();
		peer.gain.connect(peer.voiceEffect.input);
		chain[0] = peer.voiceEffect.output;
	}
	if (wantMuffle && peer.muffle) chain.push(peer.muffle);
	if (peer.reverbMix) for (const node of Object.values(peer.reverbMix)) node.disconnect();

	try {
		for (let index = 0; index < chain.length - 1; index++) {
			chain[index].connect(chain[index + 1]);
		}
		let chainOutput = chain[chain.length - 1];
		if (wantReverb && peer.reverb && peer.reverbMix) {
			chainOutput = connectReverbMix(chainOutput, peer.reverb, peer.reverbMix);
		} else if (wantReverb && peer.reverb) {
			chainOutput.connect(peer.reverb);
			chainOutput = peer.reverb;
		}
		if (wantRadioEcho && peer.radioEcho) {
			chainOutput.connect(peer.radioEcho.input);
			chainOutput = peer.radioEcho.output;
		}
		if (wantPeakGuard) {
			peer.peakGuard ??= createVoicePeakGuard(peer.gain.context);
			chainOutput.connect(peer.peakGuard.input);
			chainOutput = peer.peakGuard.output;
		} else {
			peer.peakGuard?.disconnect();
			peer.peakGuard = undefined;
		}
		chainOutput.connect(destination);
		peer.reverbConnected = wantReverb;
		peer.muffleConnected = wantMuffle;
		peer.radioEchoConnected = wantRadioEcho;
		peer.voiceEffectConnected = wantVoiceEffect;
	} catch (error) {
		console.warn('Failed to rebuild audio effect chain', error);
		peer.reverbConnected = false;
		peer.muffleConnected = false;
		peer.radioEchoConnected = false;
		peer.voiceEffectConnected = false;
		try {
			peer.gain.connect(destination);
		} catch {
			/* destination already gone */
		}
	}
}

function createRadioEcho(context: AudioContext): RadioEchoNodes {
	const input = context.createGain();
	const output = context.createGain();
	const dry = context.createGain();
	const wet = context.createGain();
	const delay = context.createDelay(1);
	const feedback = context.createGain();
	dry.gain.value = 0.92;
	wet.gain.value = 0.2;
	delay.delayTime.value = 0.09;
	feedback.gain.value = 0.12;
	input.connect(dry);
	dry.connect(output);
	input.connect(delay);
	delay.connect(wet);
	wet.connect(output);
	delay.connect(feedback);
	feedback.connect(delay);
	return { input, output, dry, wet, delay, feedback };
}

function disconnectRadioEcho(nodes: RadioEchoNodes): void {
	for (const node of [nodes.input, nodes.output, nodes.dry, nodes.wet, nodes.delay, nodes.feedback]) {
		try {
			node.disconnect();
		} catch {
			/* already disconnected */
		}
	}
}
