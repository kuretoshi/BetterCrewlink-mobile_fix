import { Injectable } from '@angular/core';
import { DiagnosticsService } from './diagnostics.service';

export const INQUIRY_URL = 'https://debug-auth.kuretoshi.work/v1/inquiries';
export type InquiryTag = 'question' | 'bug' | 'request';

@Injectable({ providedIn: 'root' })
export class InquiryService {
	constructor(private diagnostics: DiagnosticsService) {}
	async submit(subject: string, body: string, tag: InquiryTag, files: File[], consent: boolean, log: string): Promise<string> {
		if (!consent) throw new Error('公開送信への同意が必要です。');
		if (!subject.trim() || subject.trim().length > 100 || !body.trim() || body.trim().length > 1800 ||
			!['question', 'bug', 'request'].includes(tag)) throw new Error('件名・本文・種別を確認してください。');
		const attachments: Blob[] = [...files, new Blob([log], { type: 'text/plain;charset=utf-8' })];
		if (files.length > 9 || attachments.reduce((total, file) => total + file.size, 0) > 24 * 1024 * 1024)
			throw new Error('添付は9件まで、ログを含め合計24MB以下にしてください。');
		const form = new FormData();
		form.append('payload_json', JSON.stringify({ product: 'mobile', public_issue_consent: true, subject: subject.trim(), body: body.trim(), tag }));
		attachments.forEach((file, index) => form.append(`files[${index}]`, file,
			index < files.length ? files[index].name : 'mobile-diagnostics.log'));
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 60000);
		try {
			const response = await fetch(INQUIRY_URL, { method: 'POST', body: form, signal: controller.signal });
			if (!response.ok) throw new Error(`送信できませんでした（HTTP ${response.status}）。入力を残しています。`);
			const result = await response.json();
			if (!/^https:\/\/github\.com\/kuretoshi\/BetterCrewlink-mobile_fix\/issues\/[1-9]\d*$/.test(result.issue_url))
				throw new Error('モバイル版のIssue作成を確認できませんでした。再送前に投稿先を確認してください。');
			this.diagnostics.record('inquiry-submitted');
			return result.issue_url;
		} finally { clearTimeout(timeout); }
	}
}
