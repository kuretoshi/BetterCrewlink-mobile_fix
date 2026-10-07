/* eslint-disable @typescript-eslint/no-explicit-any */
import { ConnectionController } from './ConnectionController.service';
import { SettingsService } from './settings.service';
import { nosCosmeticAssets } from '../lib/nosCosmeticAssets';

describe('NoS cosmetic host transfer', () => {
	afterEach(() => nosCosmeticAssets.clear());
	it('accepts image assets from the selected host and requests only missing images', () => {
		const connection = new ConnectionController({} as SettingsService);
		const emit = jasmine.createSpy('emit');
		connection.socketIOClient = { emit } as any;
		connection.currentHost = 'selected';
		connection.gamecode = 'ABCDEF';
		const id = 'b'.repeat(64);
		const ref = `nos-web://${id}`;
		const gameState = { lobbyCode: 'ABCDEF', players: [{ nosCosmetics: { hat: ref } }] };
		const handle = (data: any, from: string) => (connection as any).handleSignal({ data, from });
		handle({ gameState }, 'other');
		expect(emit).not.toHaveBeenCalled();
		handle({ gameState }, 'selected');
		expect(emit).toHaveBeenCalledWith('signal', {
			to: 'selected',
			data: { mobilePlayerInfo: { code: 'ABCDEF', askingForHost: false, nosCosmeticIds: [id] } },
		});
		const png =
			'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aT1sAAAAASUVORK5CYII=';
		handle({ gameState, nosCosmeticAssets: { [id]: png } }, 'other');
		expect(nosCosmeticAssets.get(ref)).toBeUndefined();
		handle({ gameState, nosCosmeticAssets: { [id]: png } }, 'selected');
		expect(nosCosmeticAssets.get(ref)).toBe(png);
	});
});
