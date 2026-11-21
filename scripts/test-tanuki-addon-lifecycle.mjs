import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';

// Existing dependencies may be shared by another checkout; no installation or copy is required.
const dependencyRequire = createRequire(resolve(process.env.TANUKI_MOBILE_DEPENDENCIES ?? '.', 'package.json'));
const { transformSync } = dependencyRequire('esbuild');
const timers = new Map();
let timerId = 0;
const cache = new Map();
const context = vm.createContext({
	console, URL, Blob, Uint8Array, Float32Array, Map, Set, Date, Math,
	Audio: class { volume = 0; play() { return Promise.resolve(); } },
	document: { getElementById: () => undefined },
	setInterval(callback) { const id = ++timerId; timers.set(id, callback); return id; },
	clearInterval(id) { timers.delete(id); },
	setTimeout, clearTimeout,
});
function load(path) {
	path = resolve(path);
	if (cache.has(path)) return cache.get(path).exports;
	const module = { exports: {} };
	cache.set(path, module);
	const text = readFileSync(path, 'utf8');
	const { code } = transformSync(text, { loader: 'ts', format: 'cjs', target: 'es2022' });
	const require = (name) => {
		if (name === '@angular/core') return { Injectable: () => (value) => value };
		if (!name.startsWith('.')) return dependencyRequire(name);
		const base = resolve(dirname(path), name);
		const file = [base + '.ts', base + '.json', base].find(existsSync);
		if (!file) throw new Error(`Missing test dependency: ${name}`);
		return file.endsWith('.json') ? JSON.parse(readFileSync(file, 'utf8')) : load(file);
	};
	vm.runInContext(`(function(require,module,exports){${code}\n})`, context, { filename: path })(require, module, module.exports);
	return module.exports;
}
const { GameState } = load('src/app/common/AmongUsState.ts');
const { bitCharacterStage } = load('src/app/common/BitCharacterState.ts');
const { wallEarFor } = load('src/app/common/WallEarState.ts');
const player = { id: 7, clientId: 42, x: 0, y: 0, disconnected: false, isDead: false, inVent: false };
const state = {
	mod: 'NoS', gameState: GameState.TASKS, nosAddonIds: [], players: [player],
	nosBitCharacters: [{ playerId: 7, stage: 2 }],
	nosWallEars: [{ playerId: 7, x: 0, y: 0, range: 5 }],
	nosLimitSpeechMuted: [7],
};
assert.equal(bitCharacterStage(state, player), -1, 'stale Bit state must not activate without the addon');
assert.equal(wallEarFor(state, player), undefined, 'stale Wall Ear state must not change listening position');
state.nosAddonIds = ['tanuki.bcl.roles'];
assert.equal(bitCharacterStage(state, player), 2);
assert.equal(wallEarFor(state, player)?.range, 5);
state.nosAddonIds = [];

const { limitSpeechMuted } = load('src/app/common/tanukiAddon.ts');
for (const gameState of [GameState.TASKS, GameState.DISCUSSION]) {
	state.gameState = gameState;
	assert.equal(limitSpeechMuted(state, 7), false, 'stale Limit Speech state must not mute');
	state.nosAddonIds = ['tanuki.bcl.roles'];
	assert.equal(limitSpeechMuted(state, 7), true);
	state.nosAddonIds = [];
}

const AudioController = load('src/app/services/AudioController.service.ts').default;
const counters = { processors: 0, analysers: 0, gains: 0 };
class Node {
	gain = { value: 1 };
	connect() { return this; }
	disconnect() {}
}
const audioContext = {
	currentTime: 0,
	createGain() { counters.gains++; return new Node(); },
	createAnalyser() { counters.analysers++; return { ...new Node(), fftSize: 2048, disconnect() {}, getFloatTimeDomainData() {} }; },
	createScriptProcessor() { counters.processors++; return new Node(); },
};
const connection = { currentGameState: state, localPLayer: undefined };
const audio = new AudioController(connection, { get: () => ({ masterVolume: 100 }) });
Object.assign(audio, { context: audioContext, masterGain: new Node(), inputSource: new Node() });
for (let i = 0; i < 1000; i++) audio.clearDyingVoicesOutsideGame(state);
assert.deepEqual(counters, { processors: 0, analysers: 0, gains: 0 }, 'no addon graph allocations during absent snapshots');
assert.equal(timers.size, 0);
state.nosAddonIds = ['tanuki.bcl.roles'];
audio.clearDyingVoicesOutsideGame(state);
assert.equal(timers.size, 1);
assert.equal(counters.analysers, 1);
state.nosAddonIds = [];
audio.clearDyingVoicesOutsideGame(state);
assert.equal(timers.size, 0);
assert.equal(audio.parrots, undefined);
assert.equal(audio.interviewer, undefined);

// Exercise the real state receiver with no local player after addon removal.
const { VoiceController } = load('src/app/services/voice-controller.service.ts');
const receiver = Object.create(VoiceController.prototype);
let cleanup = 0;
Object.assign(receiver, {
	connectionController: {
		currentGameState: { ...state, nosAddonIds: ['tanuki.bcl.roles'] },
		amongusUsername: 'missing-player',
		updateConnectingStage() {},
		audioController: { clearDyingVoicesOutsideGame() { cleanup++; }, silenceAllPeers() {} },
	},
});
receiver.onGameState({ ...state, players: [] });
assert.equal(cleanup, 1, 'addon removal must stop existing recording/timers even without a local player');
const { ConnectionController } = load('src/app/services/ConnectionController.service.ts');
const transport = Object.create(ConnectionController.prototype);
let sourceUpdates = 0, acknowledgements = 0;
Object.assign(transport, {
	currentGameState: state, currentHost: 'host',
	voiceRoleSources: { receive() { sourceUpdates++; return true; }, clear() {} },
	voiceRole: { acknowledge() { acknowledgements++; } },
	updateViews() {},
});
transport.handleSignal({ data: { type: 'nos-voice-source' }, from: 'peer' });
transport.handleSignal({ data: { type: 'nos-host-voice-ack' }, from: 'host' });
assert.equal(sourceUpdates, 0, 'addon source messages must not route voice while absent');
assert.equal(acknowledgements, 0, 'addon acknowledgements must not revive a stopped relay');
console.log('[PASS] Web/mobile addon absence, stale role state, graph lifecycle and missing-player cleanup');
