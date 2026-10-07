import { BehaviorSubject } from 'rxjs';

/** Session-local cache: never resolve desktop URLs or arbitrary received URLs. */
export class NosCosmeticAssets {
	readonly version$ = new BehaviorSubject(0);
	private session = '';
	private images = new Map<string, string>();
	private bytes = 0;
	private requestedAt = 0;

	receive(host: string, lobby: string, assets: unknown): void {
		const session = `${host}:${lobby}`;
		if (session !== this.session) {
			this.clear();
			this.session = session;
		}
		if (!assets || typeof assets !== 'object' || Array.isArray(assets)) return;
		for (const [id, png] of Object.entries(assets).slice(0, 1)) {
			if (
				!/^[a-f0-9]{64}$/.test(id) ||
				typeof png !== 'string' ||
				png.length > 262166 ||
				!/^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(png)
			)
				continue;
			if (this.images.has(id)) continue;
			while (this.bytes + png.length > 8 * 1024 * 1024 && this.images.size) {
				const oldest = this.images.keys().next().value!;
				this.bytes -= this.images.get(oldest)!.length;
				this.images.delete(oldest);
			}
			this.images.set(id, png);
			this.bytes += png.length;
			this.version$.next(this.version$.value + 1);
		}
	}

	get(reference: string | undefined): string | undefined {
		return reference?.startsWith('nos-web://') ? this.images.get(reference.slice(10)) : undefined;
	}

	missingRequest(references: string[]): string[] {
		if (Date.now() - this.requestedAt < 2000) return [];
		const missing = [
			...new Set(
				references.filter((ref) => /^nos-web:\/\/[a-f0-9]{64}$/.test(ref) && !this.get(ref)).map((ref) => ref.slice(10))
			),
		].slice(0, 75);
		if (!missing.length) return [];
		this.requestedAt = Date.now();
		return missing;
	}

	clear(): void {
		this.session = '';
		this.images.clear();
		this.bytes = 0;
		this.requestedAt = 0;
		this.version$.next(this.version$.value + 1);
	}
}

export const nosCosmeticAssets = new NosCosmeticAssets();
