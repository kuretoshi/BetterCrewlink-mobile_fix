import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class DiagnosticsService {
	private entries: string[] = [];
	record(event: string, details: Record<string, string | number | boolean> = {}): void {
		this.entries.push(JSON.stringify({ time: new Date().toISOString(), event, ...details }));
		if (this.entries.length > 200) this.entries.shift();
	}
	export(): string {
		return [JSON.stringify({ version: environment.appVersion, compatibility: environment.desktopCompatVersion,
			platform: Capacitor.getPlatform(), userAgent: navigator.userAgent }), ...this.entries].join('\n');
	}
}
