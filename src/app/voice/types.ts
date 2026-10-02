import { ILobbySettings } from '../common/ISettings';
import type { VoiceDisguiseEffect } from '../services/voiceEffect';

// --- verbatim from bettercrewlink (desktop) v3.2.1 src/renderer/voice/types.ts ---
export interface PeerAudioNodes {
	stream: MediaStream;
	dummyAudioElement: HTMLAudioElement;
	gain: GainNode;
	pan: PannerNode;
	reverb: ConvolverNode;
	muffle: BiquadFilterNode;
	source: MediaStreamAudioSourceNode;
	reverbConnected: boolean;
	muffleConnected: boolean;
	voiceEffect: VoiceDisguiseEffect;
	voiceEffectConnected: boolean;
	radioEcho: RadioEchoNodes;
	radioEchoConnected: boolean;
}

export interface RadioEchoNodes {
	input: GainNode;
	output: GainNode;
	dry: GainNode;
	wet: GainNode;
	delay: DelayNode;
	feedback: GainNode;
}

export const defaultLobbySettings: ILobbySettings = {
	maxDistance: 5.32,
	haunting: false,
	snrJumboVoice: false,
	jackalHaunting: false,
	jackalHearOutsideVents: false,
	jackalTalkInVents: false,
	jackalRadioEnabled: false,
	sidekickHaunting: false,
	sidekickHearOutsideVents: false,
	sidekickTalkInVents: false,
	nosNeutralKillerHaunting: false,
	nosVoicePositions: false,
	nosSizeVoiceEffect: true,
	nosFixerJammingVoiceBlock: true,
	tohNeutralKillerHaunting: false,
	hearImpostorsInVents: false,
	impostersHearImpostersInvent: false,
	impostorRadioEnabled: false,
	impostorRadioOnlyMode: false,
	commsSabotage: false,
	voiceEffectEnabled: true,
	deadOnly: false,
	hearThroughCameras: false,
	wallsBlockAudio: false,
	meetingGhostOnly: false,
	visionHearing: false,
	publicLobby_on: false,
	publicLobby_title: '',
	publicLobby_language: 'ja',
};

export interface ClientPeerConfig {
	forceRelayOnly: boolean;
	iceServers: RTCIceServer[];
}

export const DEFAULT_ICE_CONFIG: RTCConfiguration = {
	iceTransportPolicy: 'all',
	iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

export const DEFAULT_ICE_CONFIG_TURN: RTCConfiguration = {
	iceTransportPolicy: 'relay',
	iceServers: [
		{
			urls: 'turn:turn.bettercrewl.ink:3478',
			username: 'M9DRVaByiujoXeuYAAAG',
			credential: 'TpHR9HQNZ8taxjb3',
		},
	],
};
// --- end verbatim block ---
