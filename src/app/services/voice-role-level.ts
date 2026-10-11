/** Calibrates role input independently of call volume and the voice activity gate. */
export function voiceRoleLevel(rms: number, sensitivity: number | undefined): number {
	if (!Number.isFinite(rms) || rms < 0 || rms > 1) return 0;
	const percent = Number.isFinite(sensitivity) ? Math.max(25, Math.min(1000, sensitivity!)) : 100;
	return Math.min(1, rms * percent / 100);
}
