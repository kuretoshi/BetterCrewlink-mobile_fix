import { VoiceEffectsComponent } from './voice-effects.component';
import { ISettings } from '../../common/ISettings';

describe('Rokuro personal controls',()=>{
	it('saves head/body/echo independently and restores the settings without changing pitch',()=>{
		let stored={voiceEffectTunings:{nosRokurokubi:{pitch:40,reverb:0,echo:0}}} as ISettings;
		const save=jasmine.createSpy('save');
		const create=()=>new VoiceEffectsComponent({cManager:{currentGameState:{mod:'NoS'}}} as never,
			{detectChanges() { return undefined; }} as never,{get:()=>stored,save} as never);
		const component=create();component.selectedVoiceEffect='nosRokurokubi';
		expect(component.rokuro()).toEqual({headVolume:100,bodyVolume:35,bodyEcho:50});
		component.onRokuroChange('headVolume',80);component.onRokuroChange('bodyVolume',25);component.onRokuroChange('bodyEcho',75);
		expect(save).toHaveBeenCalledTimes(3);
		stored=JSON.parse(JSON.stringify(stored));
		expect(create().rokuro()).toEqual({headVolume:80,bodyVolume:25,bodyEcho:75});
		expect(stored.voiceEffectTunings.nosRokurokubi?.pitch).toBe(40);
	});
});
