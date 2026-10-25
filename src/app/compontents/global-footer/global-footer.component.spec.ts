import { TestBed } from '@angular/core/testing';
import { IonicModule } from '@ionic/angular';
import { GlobalFooterComponent } from './global-footer.component';

describe('GlobalFooterComponent', () => {
	beforeEach(async () => {
		await TestBed.configureTestingModule({
			imports: [IonicModule.forRoot()],
			declarations: [GlobalFooterComponent],
		}).compileComponents();
	});

	it('shows the support picker alongside the other footer links', () => {
		const fixture = TestBed.createComponent(GlobalFooterComponent);
		fixture.detectChanges();

		const links = Array.from(fixture.nativeElement.querySelectorAll('a.footer-link')) as HTMLAnchorElement[];
		expect(links.length).toBe(3);
		expect(links.map((link) => link.getAttribute('href'))).toEqual([
			'https://github.com/kuretoshi/BetterCrewLink/tree/voice_fixed',
			'https://discord.gg/jEyDrpBsmJ',
			'https://x.com/tanukibcl?s=11',
		]);
		const supportButton = fixture.nativeElement.querySelector('#support-site-button') as HTMLButtonElement;
		expect(supportButton.getAttribute('aria-label')).toBe('支援先を選ぶ');
		expect(supportButton.getAttribute('type')).toBe('button');
		const supportMenu = fixture.nativeElement.querySelector('ion-popover[trigger="support-site-button"]') as HTMLElement;
		expect(supportMenu).toBeTruthy();
		for (const link of links) {
			expect(link.getAttribute('aria-label')).toBeTruthy();
			expect(link.getAttribute('rel')).toBe('noopener noreferrer');
		}
	});
});
