import AudioController from '../services/AudioController.service';
import { calculateVoiceAudio } from './spatialAudio';
import { calculateRokuroVoice } from './rokuroVoice';
import { defaultLobbySettings, PeerAudioNodes } from './types';
import { AmongUsState, GameState, Player } from '../common/AmongUsState';
import { ISettings } from '../common/ISettings';
import { CameraLocation, MapType } from '../common/AmongusMap';
import { getRokuroVoice } from '../common/RokuroVoice';

describe('Rokuro two positional voices', () => {
	const state = {mod:'NoS',gameState:GameState.TASKS,map:MapType.UNKNOWN,currentCamera:CameraLocation.NONE,closedDoors:[]} as AmongUsState;
	const me = {id:1,clientId:1,isLocal:true,x:0,y:0} as Player;
	const other = {id:2,clientId:2,x:1,y:0,nosPlayer:{bodyType:3,neckLength:40,speakerPositionX:60,speakerPositionY:0}} as Player;
	const settings = {enableSpatialAudio:true,voiceEffectTunings:{nosRokurokubi:{pitch:0,reverb:0,echo:0}}} as ISettings;
	const input = {state,me,other,settings,activeLobbySettings:defaultLobbySettings,maxDistance:5,impostorRadioClientId:-1};
	it('uses independent head/body distances and preserves the selected listener',()=>{
		expect(calculateVoiceAudio(input).gain).toBe(0);
		expect(calculateRokuroVoice(input)?.body.gain).toBe(1);
		expect(calculateVoiceAudio({...input,me:{...me,x:59}}).gain).toBe(1);
		expect(calculateRokuroVoice({...input,me:{...me,x:59}})?.body.gain).toBe(0);
		expect(getRokuroVoice({headVolume:-1,bodyVolume:120,bodyEcho:NaN})).toEqual({headVolume:0,bodyVolume:100,bodyEcho:50});
	});
	for (const gate of ['meeting','death','radio','retract','host off','bad coordinate']) {
		it(`does not add a body path during ${gate}`,()=>{
			const current={...input,state:{...state},other:{...other,nosPlayer:{...other.nosPlayer!}},activeLobbySettings:{...defaultLobbySettings}};
			if(gate==='meeting')current.state.gameState=GameState.DISCUSSION;
			if(gate==='death')current.other.isDead=true;
			if(gate==='radio')current.impostorRadioClientId=2;
			if(gate==='retract')current.other.nosPlayer.neckLength=0;
			if(gate==='host off')current.activeLobbySettings.nosRokurokubiVoiceEffect=false;
			if(gate==='bad coordinate')current.other.nosPlayer.speakerPositionX=NaN;
			expect(calculateRokuroVoice(current)).toBeUndefined();
		});
	}
	async function render(echo:number,face=false,mute=false) {
		const context=new OfflineAudioContext(2,48000,48000),source=context.createBufferSource();
		source.buffer=context.createBuffer(1,48000,48000);const data=source.buffer.getChannelData(0);
		for(let i=960;i<2880;i++)data[i]=.25*Math.sin(2*Math.PI*500*i/48000);
		const pan=context.createPanner();pan.panningModel='equalpower';pan.distanceModel='linear';pan.refDistance=.1;pan.rolloffFactor=1;
		const gain=context.createGain();gain.gain.value=0;source.connect(pan);pan.connect(gain);gain.connect(context.destination);
		const peer={source,pan,gain,muffle:context.createBiquadFilter(),reverb:context.createConvolver(),
			reverbConnected:false,muffleConnected:false,radioEchoConnected:false,voiceEffectConnected:false} as unknown as PeerAudioNodes;
		const controller=new AudioController(null!,null!);
		Object.assign(controller,{context,masterGain:context.destination,maxDistance:5,peers:new Map([['peer',peer]])});
		const amount=controller.applyVoiceAudio('peer',state,{...settings,rokuroVoice:{headVolume:100,bodyVolume:35,bodyEcho:echo}},
			defaultLobbySettings,face?{...me,x:59}:me,other,-1)!;
		controller.setPeerGain('peer',amount);
		expect(amount).toBeCloseTo(face?1:.35);
		expect(peer.gain.gain.value).toBe(face?1:0);
		source.start();const paused=context.suspend(.1),rendering=context.startRendering();await paused;
		if(mute)controller.setPeerGain('peer',0);await context.resume();
		const result=await rendering;
		const energy=(a:number,b:number)=>[0,1].reduce((sum,channel)=>sum+result.getChannelData(channel)
			.slice(a*48000,b*48000).reduce((s,x)=>s+x*x,0),0);
		return {direct:energy(.025,.055),tail:energy(.205,.235)};
	}
	it('renders body echo, leaves the face dry, and mutes queued echoes',async()=>{
		const dry=await render(0),echo=await render(100),face=await render(100,true),muted=await render(100,false,true);
		expect(dry.direct).toBeGreaterThan(.01);expect(dry.tail).toBe(0);
		expect(echo.tail).toBeGreaterThan(.01);expect(face.direct).toBeGreaterThan(.1);expect(face.tail).toBe(0);
		expect(muted.tail).toBe(0);
	});
});
