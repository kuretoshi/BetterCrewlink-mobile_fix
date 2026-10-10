import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
const WebSocket = require('ws');
globalThis.WebSocket = WebSocket;
const directory = await mkdtemp(join(tmpdir(), 'tanuki-direct-web-'));
const child = spawn(
	'dotnet',
	['run', '--project', resolve('../TanukiBCL-NoS-Addon/tests/GateTests.csproj'), '--', '--direct-test-server'],
	{ stdio: ['pipe', 'pipe', 'pipe'] }
);
let client, interval;
try {
	const result = await build({
		entryPoints: [resolve('src/app/services/direct-voice-client.ts')],
		bundle: true,
		platform: 'node',
		format: 'esm',
		write: false,
	});
	const file = join(directory, 'client.mjs');
	await writeFile(file, result.outputFiles[0].contents);
	const { DirectVoiceClient } = await import(pathToFileURL(file));
	let pending = '';
	const lines = [];
	child.stdout.on('data', (chunk) => {
		pending += chunk;
		const complete = pending.split(/\r?\n/);
		pending = complete.pop();
		lines.push(...complete);
	});
	let errors = '';
	child.stderr.on('data', (chunk) => (errors += chunk));
	async function until(predicate, label) {
		const started = Date.now();
		while (!predicate()) {
			if (Date.now() - started > 20000) throw new Error(label + ' timed out: ' + errors + '; ' + client?.status);
			await new Promise((r) => setTimeout(r, 25));
		}
	}
	await until(() => lines.some((l) => l.startsWith('READY|')), 'NoS WSS test server');
	const address = lines.find((l) => l.startsWith('READY|')).slice(6);
	// Only the test client bypasses verification for a freshly generated test certificate.
	client = new DirectVoiceClient(
		() => {},
		(url) => {
			const ws = new WebSocket(url, { rejectUnauthorized: false });
			ws.on('error', (e) => {
				errors += e.message;
			});
			ws.on('close', (code) => {
				errors += ' close:' + code;
			});
			return ws;
		}
	);
	const player = { id: 7, clientId: 42, disconnected: false, isDead: false };
	const state = { mod: 'NoS', gameState: 2, lobbyCode: 'ABCDEF', players: [player] };
	let rms = 0.6,
		active = true;
	client.enable(address);
	interval = setInterval(() => client.sample(rms, active, state, player, true, Date.now()), 50);
	await until(() => lines.some((l) => l === 'SAMPLE|0.6|1'), 'Web microphone to NoS role bridge');
	rms = 0.4;
	active = false;
	await until(() => lines.some((l) => l === 'SAMPLE|0.4|0'), 'mute state to NoS role bridge');
	assert.ok(client.status.includes('ミュート'));
	client.release();
	assert.equal(client.code, '');
	console.log(
		'PASS direct Web/APK client -> real WSS/TLS -> NoS shared voice bridge, RMS and mute; no desktop BCL or relay server.'
	);
} finally {
	clearInterval(interval);
	client?.reset();
	child.stdin.end('\n');
	await new Promise((resolve) => {
		if (child.exitCode !== null) return resolve();
		const timer = setTimeout(() => {
			child.kill();
			resolve();
		}, 5000);
		child.once('exit', () => {
			clearTimeout(timer);
			resolve();
		});
	});
	await rm(directory, { recursive: true, force: true });
}
