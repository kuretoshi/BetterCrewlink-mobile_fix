import { groupPlayersForLayout } from './game.component';

describe('Survivor and afterlife grouping', () => {
	it('keeps standard order and separates revealed ghosts without losing player settings', () => {
		const players = Array.from({ length: 15 }, (_, id) => ({
			id,
			isDead: id >= 8,
			player: { isDead: false },
			settings: { volume: 70 },
		}));
		expect(groupPlayersForLayout(players, 'standard')[0].players).toBe(players);
		const groups = groupPlayersForLayout(players, 'aliveAboveGhosts');
		expect(groups.map((g) => g.label)).toEqual(['生存者', '霊界']);
		expect(groups[0].players.map((p) => p.id)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
		expect(groups[1].players.map((p) => p.id)).toEqual([8, 9, 10, 11, 12, 13, 14]);
		expect(groups[0].players[0]).toBe(players[0]);
		players[0].player.isDead = true;
		expect(groupPlayersForLayout(players, 'aliveAboveGhosts')[0].players[0]).toBe(players[0]);
		players[0].isDead = true;
		expect(groupPlayersForLayout(players, 'aliveAboveGhosts')[1].players[0]).toBe(players[0]);
		players[0].isDead = false;
		expect(groupPlayersForLayout(players, 'aliveAboveGhosts')[0].players[0]).toBe(players[0]);
		expect(players[0].settings.volume).toBe(70);
	});
	it('handles empty, all-alive and all-ghost rosters and unknown old settings', () => {
		expect(groupPlayersForLayout([], 'aliveAboveGhosts').map((g) => g.players.length)).toEqual([0, 0]);
		expect(groupPlayersForLayout([{ isDead: false }], 'aliveAboveGhosts').map((g) => g.players.length)).toEqual([1, 0]);
		expect(groupPlayersForLayout([{ isDead: true }], 'aliveAboveGhosts').map((g) => g.players.length)).toEqual([0, 1]);
		expect(groupPlayersForLayout([], 'unknown').length).toBe(1);
	});
});
