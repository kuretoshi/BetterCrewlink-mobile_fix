// Regression coverage for the connecting-screen status line. This used to read
// `cManager.oldGameState.gameState` unguarded, which threw on the first game-state frame
// (oldGameState is only set from the second one) - and because the render happens
// synchronously inside VoiceController's hostUpdate handler, that view-layer TypeError
// was caught there and turned into a full connection error.
import { connectionStageLabel } from './game-helper.service';
import { ConnectingStage } from './ConnectionController.service';
import { AmongUsState, GameState } from '../common/AmongUsState';

function ctx(overrides: { oldGameState?: AmongUsState } = {}) {
	return { gamecode: 'ABCD', amongusUsername: 'Guus', ...overrides };
}

describe('connectionStageLabel', () => {
	it('does not throw when no previous game state is known yet (first frame)', () => {
		expect(connectionStageLabel(ConnectingStage.waitingForYouToJoin, ctx())).toBe(
			'Guus という名前での参加を待っています → 不明'
		);
	});

	it('reports the previous game state once one is known', () => {
		const oldGameState = { gameState: GameState.LOBBY } as unknown as AmongUsState;
		expect(connectionStageLabel(ConnectingStage.waitingForYouToJoin, ctx({ oldGameState }))).toBe(
			'Guus という名前での参加を待っています → ロビー'
		);
	});

	it('falls back to UNKNOWN for an out-of-range game state', () => {
		const oldGameState = { gameState: 99 } as unknown as AmongUsState;
		expect(connectionStageLabel(ConnectingStage.waitingForYouToJoin, ctx({ oldGameState }))).toBe(
			'Guus という名前での参加を待っています → 不明'
		);
	});

	it('renders the other connecting stages', () => {
		expect(connectionStageLabel(ConnectingStage.connectingToVoiceServer, ctx())).toBe('ボイスサーバーへ接続しています…');
		expect(connectionStageLabel(ConnectingStage.searchingForHost, ctx())).toBe(
			'ロビー ABCD 内のBetterCrewlink PCプレイヤーを検索しています'
		);
		expect(connectionStageLabel(ConnectingStage.WaitingForGameData, ctx())).toBe(
			'プレイヤーからのゲームデータを待っています'
		);
		expect(connectionStageLabel(ConnectingStage.FullyConnected, ctx())).toBe('ゲームへ接続しました');
		expect(connectionStageLabel(99 as ConnectingStage, ctx())).toBe('不明な接続状態: 99');
	});
});
