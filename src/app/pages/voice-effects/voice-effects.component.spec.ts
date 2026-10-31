import { TestBed, ComponentFixture } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { VoiceEffectsComponent } from './voice-effects.component';
import { GameHelperService } from '../../services/game-helper.service';
import { SettingsService } from '../../services/settings.service';
import { getVoiceEffectTuning } from '../../common/VoiceEffectTuning';

describe('Compact voice tuning controls', () => {
	let fixture: ComponentFixture<VoiceEffectsComponent>;
	let settings: SettingsService;
	beforeEach(async () => {
		settings = new SettingsService({ create: async () => undefined, get: async () => ({}), set: async () => undefined } as never,
			{ is: () => false } as never);
		await TestBed.configureTestingModule({ declarations: [VoiceEffectsComponent], imports: [FormsModule, IonicModule.forRoot()],
			providers: [{ provide: SettingsService, useValue: settings }, { provide: GameHelperService, useValue: {
				cManager: { currentGameState: { mod: 'NoS', nosAddonIds: ['UchuAddon', 'tanuki.bcl.roles'] } },
				events: { on() { return undefined; }, off() { return undefined; } },
			} }] }).compileComponents();
		fixture = TestBed.createComponent(VoiceEffectsComponent);
		fixture.detectChanges();
	});
	afterEach(() => fixture.destroy());
	it('shows one selector and three axes, and saves signed per-effect values independently', async () => {
		const component = fixture.componentInstance;
		expect(fixture.nativeElement.querySelectorAll('ion-select').length).toBe(1);
		const ranges = fixture.nativeElement.querySelectorAll('ion-range');
		expect(ranges.length).toBe(3);
		expect(Number(ranges[0].min)).toBe(-100);
		expect(Number(ranges[0].max)).toBe(100);
		component.selectedVoiceEffect = 'nosRainbowStar';
		component.onTuningChange(component.selectedVoiceEffect, 'pitch', -50);
		component.onTuningChange(component.selectedVoiceEffect, 'echo', 12);
		fixture.detectChanges();
		await fixture.whenStable();
		expect(getVoiceEffectTuning(settings.get(), 'nosRainbowStar')).toEqual({ pitch: -50, reverb: 100, echo: 12 });
		expect(getVoiceEffectTuning(settings.get(), 'disguise')).toEqual({ pitch: -100, reverb: 0, echo: 0 });
		expect(settings.get().nosRainbowStarEchoStrength).toBe(100);
		expect(Number(ranges[0].value)).toBe(-50);
	});
	it('returns to ordinary disguise when the selected addon is no longer detected', () => {
		const component = fixture.componentInstance;
		component.selectedVoiceEffect = 'nosRainbowStar';
		component.onTuningChange('nosRainbowStar', 'pitch', -20);
		const game = TestBed.inject(GameHelperService);
		game.cManager.currentGameState = undefined;
		fixture.detectChanges();
		expect(component.selectedVoiceEffect).toBe('disguise');
		expect(settings.get().voiceEffectTunings!.nosRainbowStar!.pitch).toBe(-20);
	});
});
