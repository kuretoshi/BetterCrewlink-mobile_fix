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

	it('shows all five TanukiBCL footer icons in desktop order', () => {
		const fixture = TestBed.createComponent(GlobalFooterComponent);
		fixture.detectChanges();

		const links = Array.from(fixture.nativeElement.querySelectorAll('.footer-link')) as HTMLAnchorElement[];
		expect(links.length).toBe(5);
		expect(links.map((link) => link.getAttribute('href'))).toEqual([
			'https://github.com/kuretoshi/BetterCrewLink/tree/voice_fixed',
			'https://discord.gg/jEyDrpBsmJ',
			'https://ko-fi.com/kuretoshi',
			'https://x.com/tanukibcl?s=11',
			'https://discord.gg/jEyDrpBsmJ',
		]);
		for (const link of links) {
			expect(link.getAttribute('aria-label')).toBeTruthy();
			expect(link.getAttribute('rel')).toBe('noopener noreferrer');
		}
		expect(links[4].title).toContain('ログは自動送信されません');
	});
});
