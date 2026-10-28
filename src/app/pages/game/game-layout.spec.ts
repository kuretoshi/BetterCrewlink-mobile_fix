import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

// Exercise the production layout rules with stable DOM. Ionic custom elements
// initialize asynchronously and make width measurements depend on test order.
@Component({
	selector: 'app-game-layout-harness',
	template: `
		<div class="connectedView">
			<div class="localPlayerRow">
				<div class="localAvatar"></div>
				<div class="localIdentity">長いプレイヤー名の表示確認</div>
				<div class="localAudioControls"><button>マイク</button><button>音声</button></div>
			</div>
			<div class="playersGrid">
				@for (player of players; track player) {
					<div class="playerCell"><div class="playerName">{{ player }}</div></div>
				}
			</div>
		</div>
	`,
	styleUrls: ['./game.component.scss'],
	standalone: false,
})
class GameLayoutHarnessComponent {
	players = Array.from({ length: 15 }, (_, index) => `Player ${index}`);
}

describe('Game adaptive layout', () => {
	let fixture: ComponentFixture<GameLayoutHarnessComponent>;
	beforeEach(async () => {
		await TestBed.configureTestingModule({
			declarations: [GameLayoutHarnessComponent],
		}).compileComponents();
		fixture = TestBed.createComponent(GameLayoutHarnessComponent);
		Object.assign(fixture.nativeElement.style, { display: 'block', width: '890px', container: 'app-layout / inline-size' });
		fixture.detectChanges();
	});
	afterEach(() => fixture.destroy());

	async function resize(width: number): Promise<number> {
		fixture.nativeElement.style.width = `${width}px`;
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
