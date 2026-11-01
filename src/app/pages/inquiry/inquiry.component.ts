import { Component } from '@angular/core';
import { DiagnosticsService } from '../../services/diagnostics.service';
import { InquiryService, InquiryTag } from '../../services/inquiry.service';

@Component({ selector: 'app-inquiry', standalone: false, templateUrl: './inquiry.component.html',
	styles: ['form {max-width:640px;margin:auto;padding:16px;display:grid;gap:16px} label {display:grid;gap:8px} input,textarea,select {width:100%;padding:12px;background:#25232a;color:white;border:1px solid #888;border-radius:6px;box-sizing:border-box} pre {white-space:pre-wrap;overflow-wrap:anywhere;max-height:200px;overflow:auto}'] })
export class InquiryComponent {
	subject = '';
	body = '';
	tag: InquiryTag = 'bug';
	files: File[] = [];
	consent = false;
	sending = false;
	error = '';
	issueUrl = '';
	log = '';
	constructor(private diagnostics: DiagnosticsService, private inquiry: InquiryService) { this.refreshLog(); }
	refreshLog(): void { this.log = this.diagnostics.export(); }
	selectFiles(event: Event): void { this.files = Array.from((event.target as HTMLInputElement).files ?? []); }
	async submit(): Promise<void> {
		if (this.sending || this.issueUrl) return;
		this.sending = true;
		this.error = '';
		try { this.issueUrl = await this.inquiry.submit(this.subject, this.body, this.tag, this.files, this.consent, this.log); }
		catch (error) { this.error = error instanceof Error ? error.message : '送信できませんでした。入力を残しています。'; }
		finally { this.sending = false; }
	}
}
