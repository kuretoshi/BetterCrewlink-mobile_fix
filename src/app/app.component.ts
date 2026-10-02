import { AfterViewInit, Component, ElementRef, OnDestroy, OnInit, ViewChild, ChangeDetectionStrategy } from '@angular/core';
import { SettingsService } from './services/settings.service';
import { environment } from '../environments/environment';
@Component({
	selector: 'app-root',
	templateUrl: 'app.component.html',
	styleUrls: ['app.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: false,
})
export class AppComponent implements OnInit, AfterViewInit, OnDestroy {
	readonly appVersion = environment.appVersion;
	public selectedIndex = 0;
	public appPages = [
		{
			title: 'ゲーム',
			url: '/game',
			icon: 'home',
		},
		{
			title: 'ロビー設定',
			url: '/lobby-settings',
			icon: 'options',
		},
		{
			title: '音声設定',
			url: '/audio-settings',
			icon: 'volume-high',
		},
		{
			title: '接続設定',
			url: '/settings',
			icon: 'settings',
		},
	];

	@ViewChild('appHeaderEl', { read: ElementRef }) private appHeaderEl: ElementRef<HTMLElement>;
	@ViewChild('appFooterEl', { read: ElementRef }) private appFooterEl: ElementRef<HTMLElement>;
	private layoutResizeObserver: ResizeObserver;

	constructor(private settingsService: SettingsService) {}

	async ngOnInit() {
		console.log('AppComponent initialized');
		await this.settingsService.load();
	}

	ngAfterViewInit() {
		// Ionic adds device-specific safe-area padding to the header and footer.
		// Keep the routed page between their rendered edges so its last setting
		// remains reachable by scrolling on phones with large bottom insets.
		const headerElement = this.appHeaderEl?.nativeElement;
		const footerElement = this.appFooterEl?.nativeElement;
		if (!headerElement || !footerElement) {
			return;
		}
		const updateLayoutHeights = () => {
			document.documentElement.style.setProperty('--app-header-height', `${headerElement.offsetHeight}px`);
			document.documentElement.style.setProperty('--app-footer-height', `${footerElement.offsetHeight}px`);
		};
		updateLayoutHeights();
		this.layoutResizeObserver = new ResizeObserver(updateLayoutHeights);
		this.layoutResizeObserver.observe(headerElement);
		this.layoutResizeObserver.observe(footerElement);
	}

	ngOnDestroy() {
		this.layoutResizeObserver?.disconnect();
	}
}
