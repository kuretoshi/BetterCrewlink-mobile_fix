import { AfterViewInit, Component, ElementRef, OnDestroy, OnInit, ViewChild, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { SettingsService } from './services/settings.service';
import { GameHelperService } from './services/game-helper.service';
import { environment } from '../environments/environment';
import { Capacitor } from '@capacitor/core';
import { AlertController } from '@ionic/angular';
import { reloadWebApplication } from './services/app-reload';
@Component({
	selector: 'app-root',
	templateUrl: 'app.component.html',
	styleUrls: ['app.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: false,
})
export class AppComponent implements OnInit, AfterViewInit, OnDestroy {
	readonly appVersion = environment.appVersion;
	readonly isWeb = !Capacitor.isNativePlatform();
	reloading = false;
	reloadError = '';
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
			title: 'ボイスエフェクト',
			url: '/voice-effects',
			icon: 'musical-notes',
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

	constructor(private settingsService: SettingsService, public gameHelper: GameHelperService,
		private changes: ChangeDetectorRef, private alerts: AlertController) {
		this.gameHelper.events.on('onChange', () => this.changes.markForCheck());
	}

	async ngOnInit() {
		console.log('AppComponent initialized');
		await this.settingsService.load();
	}

	async confirmReload(): Promise<void> {
		if (!this.isWeb || this.reloading) return;
		const alert = await this.alerts.create({
			header: 'アプリ再読み込み',
			message: '通話を切断し、最新の画面を読み直します。保存済みの設定は保持されます。送信前の問い合わせ内容は失われます。',
			buttons: [{ text: 'キャンセル', role: 'cancel' }, { text: '再読み込み', handler: () => { void this.reloadApp(); } }],
		});
		await alert.present();
	}

	private async reloadApp(): Promise<void> {
		this.reloading = true;
		this.reloadError = '';
		try { await reloadWebApplication(() => this.gameHelper.disconnect()); }
		catch { this.reloadError = '再読み込みできませんでした。通信環境を確認して、再試行してください。'; }
		finally { this.reloading = false; this.changes.markForCheck(); }
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
