import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { GameComponent } from './game.component';
import { GameHelperService } from '../../services/game-helper.service';

// Render the actual connected-page template/styles without a game or microphone.
// Changing the containing width models unfolding and split views without reloads.
describe('Game adaptive layout', () => {
	let fixture: ComponentFixture<GameComponent>;
	beforeEach(async () => {
		await TestBed.configureTestingModule({
			imports: [IonicModule.forRoot()],
			declarations: [GameComponent],
			schemas: [CUSTOM_ELEMENTS_SCHEMA],
			providers: [{ provide: GameHelperService, useValue: {
				events: { on: () => undefined, off: () => undefined },
				cManager: { connectionState: 2, localPLayer: { name: '長いプレイヤー名の表示確認', isDead: false }, currentGameCode: 'ABCDEF' },
				voiceController: {
					getRenderablePlayers: () => Array.from({ length: 15 }, (_, id) => ({ player: { clientId: id, name: `Player ${id}` } })),
					canTransmitRadio: () => false,
					releaseRadio: () => undefined,
				},
				localTalking: () => false, microphoneMuted: () => false, audioMuted: () => false,
			} }],
		}).compileComponents();
		fixture = TestBed.createComponent(GameComponent);
		Object.assign(fixture.nativeElement.style, { display: 'block', width: '890px', container: 'app-layout / inline-size' });
		fixture.detectChanges();
		const content = fixture.nativeElement.querySelector('ion-content') as HTMLElement & {
			componentOnReady?: () => Promise<unknown>;
		};
		await customElements.whenDefined('ion-content');
		await content.componentOnReady?.();
	});
	afterEach(() => fixture.destroy());

	async function resize(width: number): Promise<number> {
		fixture.nativeElement.style.width = `${width}px`;
		await fixture.whenStable();
		await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
		await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
		const host: HTMLElement = fixture.nativeElement;
		expect(host.scrollWidth).toBeLessThanOrEqual(host.clientWidth + 1);
		const grid = host.querySelector('.playersGrid');
		return getComputedStyle(grid).gridTemplateColumns.split(' ').length;
	}

	it('keeps player controls inside a narrow split view', async () => {
		expect(await resize(320)).toBe(2);
	});

	it('expands the player grid and restores the compact layout without recreating the page', async () => {
		const localPlayer = fixture.nativeElement.querySelector('.localIdentity');
		const foldedColumns = await resize(466);
		expect(await resize(890)).toBeGreaterThan(foldedColumns);
		expect(await resize(466)).toBe(foldedColumns);
		expect(fixture.nativeElement.querySelector('.localIdentity')).toBe(localPlayer);
		expect(fixture.nativeElement.querySelectorAll('.playerCell').length).toBe(15);
	});
});
