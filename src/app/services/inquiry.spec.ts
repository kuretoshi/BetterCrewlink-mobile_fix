import { DiagnosticsService } from './diagnostics.service';
import { InquiryService } from './inquiry.service';
import { InquiryComponent } from '../pages/inquiry/inquiry.component';

describe('Mobile inquiries', () => {
	it('bounds the diagnostic history and exports the version and disconnect reason', () => {
		const logs = new DiagnosticsService();
		for (let i = 0; i < 250; i++) logs.record('server-disconnected', { reason: 'ping timeout', sequence: i });
		const lines = logs.export().split('\n');
		expect(lines.length).toBe(201);
		expect(JSON.parse(lines[0]).version).toBeDefined();
		expect(JSON.parse(lines[1]).sequence).toBe(50);
		expect(JSON.parse(lines[200]).reason).toBe('ping timeout');
	});
	it('requires consent and rejects oversized files before any network request', async () => {
		const fetchSpy = spyOn(window, 'fetch');
		const service = new InquiryService(new DiagnosticsService());
		await expectAsync(service.submit('件名', '本文', 'bug', [], false, 'log')).toBeRejected();
		await expectAsync(service.submit('件名', '本文', 'bug', [new File([new Uint8Array(24 * 1024 * 1024)], 'large')], true, 'log')).toBeRejected();
		expect(fetchSpy).not.toHaveBeenCalled();
	});
	it('sends the reviewed logs and attachment with the mobile product and public consent', async () => {
		const fetchSpy = spyOn(window, 'fetch').and.resolveTo(new Response(JSON.stringify({ issue_url: 'https://github.com/kuretoshi/BetterCrewlink-mobile_fix/issues/12' })));
		const service = new InquiryService(new DiagnosticsService());
		await service.submit(' 件名 ', ' 本文 ', 'request', [new File(['file'], 'chosen.txt')], true, 'reviewed log');
		const form = fetchSpy.calls.mostRecent().args[1].body as FormData;
		expect(JSON.parse(form.get('payload_json') as string)).toEqual({ product: 'mobile', public_issue_consent: true, subject: '件名', body: '本文', tag: 'request' });
		expect((form.get('files[0]') as File).name).toBe('chosen.txt');
		expect(await (form.get('files[1]') as File).text()).toBe('reviewed log');
	});
	it('retains the form on delivery failure and prevents concurrent submissions', async () => {
		const service = new InquiryService(new DiagnosticsService());
		const send = spyOn(service, 'submit').and.rejectWith(new Error('offline'));
		const page = new InquiryComponent(new DiagnosticsService(), service);
		page.subject = '件名'; page.body = '本文'; page.consent = true;
		await page.submit();
		expect(page.subject).toBe('件名');
		expect(page.body).toBe('本文');
		expect(page.error).toBe('offline');
		page.sending = true;
		await page.submit();
		expect(send).toHaveBeenCalledTimes(1);
	});
	it('does not accept an unrelated issue URL as a successful mobile report', async () => {
		spyOn(window, 'fetch').and.resolveTo(new Response(JSON.stringify({ issue_url: 'https://github.com/kuretoshi/BetterCrewLink_Net/issues/12' })));
		await expectAsync(new InquiryService(new DiagnosticsService()).submit('件名', '本文', 'bug', [], true, 'log')).toBeRejected();
	});
});
