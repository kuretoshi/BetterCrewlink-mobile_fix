import { EventEmitter as EventEmitterO } from 'events';
import { AmongUsState, GameState, Player } from '../common/AmongUsState';
import { ILobbySettings, ISettings } from '../common/ISettings';
import { IDeviceInfo } from './smallInterfaces';
import { ConnectingStage, ConnectionController } from './ConnectionController.service';
import { SettingsService } from './settings.service';
import { calculateVoiceAudio } from '../voice/spatialAudio';
import { PeerAudioNodes, RadioEchoNodes } from '../voice/types';
import VAD from './vad';
import { selectVoiceEffect, shouldApplyRainbowStarEcho, type VoiceEffectSetting } from '../voice/voiceEffectRules';
import { createVoiceDisguiseEffect, updateVoiceDisguiseEffect } from './voiceEffect';
import { createBerserkerEffect } from '../voice/berserkerEffect';
import {
	prepareSourceFilter,
	createSourceFilterEffect,
	updateSourceFilterEffect,
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
		const analyser = context.createAnalyser();
		analyser.fftSize = 2048;
		analyser.smoothingTimeConstant = 0;
		inputSource.connect(analyser);
		this.voiceRoleAnalyser = analyser;
		const samples = new Float32Array(analyser.fftSize);
		this.voiceRoleTimer = setInterval(() => {
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
			this.events.emit('voiceRoleSample', Math.min(1, Math.sqrt(sum / samples.length)), active);
		}, 50);

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
		if (this.context) return;

		const AudioContextCtor = window.webkitAudioContext || window.AudioContext;
		const context = new AudioContextCtor();
		this.context = context;
		void context.resume().catch(() => {
			/* resumed on first user gesture instead */
		});

		const masterGain = context.createGain();
		masterGain.gain.value = 1;
		this.masterGain = masterGain;

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
		const bibiriEcho = createBibiriEcho(context, gain, masterGain);

		this.peers.set(peerId, {
			bibiriEcho,
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
	}

	removePeer(peerId: string): void {
		const peer = this.peers.get(peerId);
		if (!peer) return;
		this.peers.delete(peerId);

		this.teardownAudioElement(peer.dummyAudioElement);
		peer.source.disconnect();
		peer.pan.disconnect();
		peer.gain.disconnect();
		peer.reverb?.disconnect();
		peer.muffle?.disconnect();
		if (peer.voiceEffect) disconnectProcessingEffect(peer.voiceEffect);
		disconnectRadioEcho(peer.radioEcho);
		if (peer.starEcho) disconnectRadioEcho(peer.starEcho);
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

	silenceAllPeers(): void {
		for (const peer of this.peers.values()) {
			peer.gain.gain.value = 0;
			if (peer.bibiriEcho) stopBibiriEcho(peer.bibiriEcho);
		}
	}

	silencePeersExcept(peerIds: string[]): void {
		for (const [peerId, peer] of this.peers) {
			if (!peerIds.includes(peerId)) {
				peer.gain.gain.value = 0;
				if (peer.bibiriEcho) stopBibiriEcho(peer.bibiriEcho);
			}
		}
	}

	setPeerGain(peerId: string, gain: number): void {
		const peer = this.peers.get(peerId);
		if (peer) peer.gain.gain.value = gain;
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
		const peer = this.peers.get(peerId);
		const destination = this.masterGain;
		if (!peer || !destination) return null;

		// Mobile-only: a local "mute all incoming audio" toggle desktop doesn't have.
		if (this.audioMuted) {
			peer.gain.gain.value = 0;
			return 0;
		}

		if (peer.bibiriEcho)
			updateBibiriEcho(
				peer.bibiriEcho,
				state.mod === 'NoS' &&
					!other.disconnected &&
					(state.gameState === GameState.TASKS || state.gameState === GameState.DISCUSSION),
				other.isDead,
				state.nosBibiriEchoes?.find((e) => e.playerId === other.id)?.unixMs,
				state.nosVoiceFrameTime
			);
		const { pan, muffle } = peer;
		const result = calculateVoiceAudio({
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
		});

		pan.maxDistance = result.panMaxDistance ?? this.maxDistance;

		if (result.muffle) {
			muffle.type = result.muffle.type;
			muffle.frequency.value = result.muffle.frequency;
			muffle.Q.value = result.muffle.q;
		}

		const wantReverb = result.reverb === null ? peer.reverbConnected : result.reverb;
		const wantMuffle = result.muffle === null ? peer.muffleConnected : result.muffle !== false;
		const wantRadioEcho = result.radioEcho;
		let effect =
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
		if (effect?.sourceFilter && !this.sourceFilterReady) effect = null;
		const wantKind = effect?.berserker ? 'berserker' : effect?.sourceFilter ? 'source-filter' : 'disguise';
		const currentKind = peer.voiceEffect && 'kind' in peer.voiceEffect ? peer.voiceEffect.kind : 'disguise';
		if (effect && peer.voiceEffect && wantKind !== currentKind) {
			disconnectProcessingEffect(peer.voiceEffect);
			peer.voiceEffect = undefined;
			peer.voiceEffectConnected = false;
		}
		if (effect && this.context) {
			updatePeerVoiceEffect(peer, this.context, effect);
		} else if (peer.voiceEffect) {
			disconnectProcessingEffect(peer.voiceEffect);
			peer.voiceEffect = undefined;
		}
		const wantStarEcho = result.gain > 0 && shouldApplyRainbowStarEcho(state, other, activeLobbySettings);
		if (wantStarEcho && !peer.starEcho && this.context) {
			peer.starEcho = createRadioEcho(this.context);
			peer.starEcho.dry.gain.value = 0.94;
			peer.starEcho.wet.gain.value = 0.08;
			peer.starEcho.delay.delayTime.value = 0.075;
			peer.starEcho.feedback.gain.value = 0.08;
		}
		rebuildEffectChain(peer, destination, wantReverb, wantMuffle, !!effect, wantRadioEcho, wantStarEcho);

		if (result.panPosition) {
			const time = pan.context.currentTime;
			pan.positionX.setValueAtTime(result.panPosition[0], time);
			pan.positionY.setValueAtTime(result.panPosition[1], time);
			pan.positionZ.setValueAtTime(-0.5, time);
		}

		return result.gain;
	}

	disconnect() {
		if (this.voiceRoleTimer) clearInterval(this.voiceRoleTimer);
		this.voiceRoleTimer = undefined;
		this.voiceRoleAnalyser?.disconnect();
		this.voiceRoleAnalyser = undefined;
		this.audioListener?.destroy();
		this.audioListener = undefined;

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

function updatePeerVoiceEffect(peer: PeerAudioNodes, context: AudioContext, effect: VoiceEffectSetting): void {
	if (effect.berserker) {
		peer.voiceEffect ??= createBerserkerEffect(context);
		return;
	}
	if (effect.sourceFilter) {
		peer.voiceEffect ??= createSourceFilterEffect(context);
		if ('kind' in peer.voiceEffect && peer.voiceEffect.kind === 'source-filter')
			updateSourceFilterEffect(peer.voiceEffect, effect.sourceFilter);
		return;
	}
	peer.voiceEffect ??= createVoiceDisguiseEffect(context, effect.strength);
	if (!('kind' in peer.voiceEffect))
		updateVoiceDisguiseEffect(
			peer.voiceEffect,
			effect.strength,
			effect.direction,
			effect.formantScale,
			effect.jumbo,
			effect.squash,
			effect.toneRate,
			effect.directPitch
		);
}

function rebuildEffectChain(
	peer: PeerAudioNodes,
	destination: AudioNode,
	wantReverb: boolean,
	wantMuffle: boolean,
	wantVoiceEffect: boolean,
	wantRadioEcho: boolean,
	wantStarEcho: boolean
): void {
	if (
		peer.reverbConnected === wantReverb &&
		peer.muffleConnected === wantMuffle &&
		peer.voiceEffectConnected === wantVoiceEffect &&
		peer.radioEchoConnected === wantRadioEcho &&
		!!peer.starEchoConnected === wantStarEcho
	)
		return;

	for (const node of [peer.gain, peer.muffle, peer.reverb]) {
		try {
			node.disconnect();
		} catch {
			/* not connected */
		}
	}
	if (peer.bibiriEcho) peer.gain.connect(peer.bibiriEcho.input);
	peer.voiceEffect?.output.disconnect();
	try {
		peer.radioEcho.output.disconnect();
	} catch {
		/* not connected */
	}
	peer.starEcho?.output.disconnect();

	const chain: AudioNode[] = [peer.gain];
	if (wantMuffle) chain.push(peer.muffle);
	if (wantReverb) chain.push(peer.reverb);

	try {
		for (let index = 0; index < chain.length - 1; index++) {
			chain[index].connect(chain[index + 1]);
		}
		let tail = chain[chain.length - 1];
		if (wantVoiceEffect && peer.voiceEffect) {
			tail.connect(peer.voiceEffect.input);
			tail = peer.voiceEffect.output;
		}
		if (wantStarEcho && peer.starEcho) {
			tail.connect(peer.starEcho.input);
			tail = peer.starEcho.output;
		}
		if (wantRadioEcho) {
			tail.connect(peer.radioEcho.input);
			peer.radioEcho.output.connect(destination);
		} else {
			tail.connect(destination);
		}
		peer.reverbConnected = wantReverb;
		peer.muffleConnected = wantMuffle;
		peer.voiceEffectConnected = wantVoiceEffect;
		peer.radioEchoConnected = wantRadioEcho;
		peer.starEchoConnected = wantStarEcho;
	} catch (error) {
		console.warn('Failed to rebuild audio effect chain', error);
		peer.reverbConnected = false;
		peer.muffleConnected = false;
		peer.voiceEffectConnected = false;
		peer.radioEchoConnected = false;
		peer.starEchoConnected = false;
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
