import { ChangeDetectorRef } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { AvatarComponent } from './avatar.component';
import { CosmeticRender, CosmeticType } from '../../services/cosmetics.service';
import { SettingsService } from '../../services/settings.service';
import { Player } from '../../common/AmongUsState';
import { nosCosmeticAssets } from '../../lib/nosCosmeticAssets';

function makePlayer(overrides: Partial<Player> = {}): Player {
	return {
		ptr: 0,
		id: 0,
		clientId: 0,
		name: 'Player',
		nameHash: 0,
		playerConfigId: 0,
		friendCode: '',
		playerUid: '',
		playerIdentifier: '',
		colorId: 0,
		hatId: 'hat_pizza',
		petId: 0,
		skinId: 'skin_hazmat',
		visorId: 'visor_sun',
		disconnected: false,
		isImpostor: false,
		isDead: false,
		taskPtr: 0,
		objectPtr: 0,
		isLocal: false,
		shiftedColor: 0,
		bugged: false,
		x: 0,
		y: 0,
		inVent: false,
		isDummy: false,
		isbetter: false,
		...overrides,
	};
}

const RENDER: CosmeticRender = { src: 'resolved.png', top: 'top', left: 'left', width: 'width', zIndex: 4 };

function makeComponent(player: Player = makePlayer()) {
	const cosmetics = {
		version$: new BehaviorSubject(0),
		initializeHats: jasmine.createSpy('initializeHats'),
		getCosmeticRender: jasmine.createSpy('getCosmeticRender').and.returnValue(RENDER),
	};
	const changeDetectorRef = { markForCheck: jasmine.createSpy('markForCheck') };
	const component = new AvatarComponent(
		{} as SettingsService,
		cosmetics as never,
		changeDetectorRef as unknown as ChangeDetectorRef
	);
	component.player = player;
	return { component, cosmetics, changeDetectorRef };
}

describe('AvatarComponent', () => {
	it('renders received NoS layers and mask, then removes them on death or unequip', () => {
		const id = 'a'.repeat(64);
		const png =
			'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aT1sAAAAASUVORK5CYII=';
		nosCosmeticAssets.receive('test-host', 'ABCDEF', { [id]: png });
		const ref = `nos-web://${id}`;
		const { component, cosmetics } = makeComponent(
			makePlayer({ nosCosmetics: { skin: ref, hat: ref, hatBack: ref, visor: ref, bodyMask: ref } })
		);
		component.mod = 'NoS';
		expect(component.getHat().src).toBe(png);
		expect(component.getHatBack().zIndex).toBe(1);
		expect(component.getSkin().width).toBe('140%');
		expect(component.getVisor().top).toBe('-52%');
		expect(component.getBodyMask()).toBe(`url("${png}")`);
		expect(cosmetics.getCosmeticRender).not.toHaveBeenCalled();
		component.isDead = true;
		expect(component.getHat()).toBeUndefined();
		expect(component.getBodyMask()).toBeUndefined();
		component.isDead = false;
		component.player = makePlayer({ nosCosmetics: {} });
		expect(component.getBodyMask()).toBeUndefined();
		component.ngOnDestroy();
		nosCosmeticAssets.clear();
	});
	it('starts loading the shared hat collection', () => {
		const { cosmetics } = makeComponent();
		expect(cosmetics.initializeHats).toHaveBeenCalled();
	});

	it('resolves each cosmetic through the service with the player colour and lobby mod', () => {
		const { component, cosmetics } = makeComponent(makePlayer({ colorId: 4 }));
		component.mod = 'LAS_MONJAS';

		expect(component.getHat()).toBe(RENDER);
		expect(component.getVisor()).toBe(RENDER);
		expect(component.getSkin()).toBe(RENDER);
		expect(component.getHatBack()).toBe(RENDER);

		expect(cosmetics.getCosmeticRender).toHaveBeenCalledWith(4, CosmeticType.hat, 'hat_pizza', 'LAS_MONJAS');
		expect(cosmetics.getCosmeticRender).toHaveBeenCalledWith(4, CosmeticType.visor, 'visor_sun', 'LAS_MONJAS');
		expect(cosmetics.getCosmeticRender).toHaveBeenCalledWith(4, CosmeticType.skin, 'skin_hazmat', 'LAS_MONJAS');
		expect(cosmetics.getCosmeticRender).toHaveBeenCalledWith(4, CosmeticType.hatBack, 'hat_pizza', 'LAS_MONJAS');
	});

	it('hides every cosmetic while the player is dead', () => {
		const { component, cosmetics } = makeComponent(makePlayer({ isDead: true }));
		component.isDead = true;

		expect(component.getHat()).toBeUndefined();
		expect(component.getVisor()).toBeUndefined();
		expect(component.getSkin()).toBeUndefined();
		expect(component.getHatBack()).toBeUndefined();
		expect(cosmetics.getCosmeticRender).not.toHaveBeenCalled();
	});

	it('re-checks the view whenever the cosmetics version changes', () => {
		const { cosmetics, changeDetectorRef } = makeComponent();
		// The BehaviorSubject already emitted its current value on subscribe.
		changeDetectorRef.markForCheck.calls.reset();
		cosmetics.version$.next(1);
		expect(changeDetectorRef.markForCheck).toHaveBeenCalledTimes(1);
	});

	it('stops listening once destroyed', () => {
		const { component, cosmetics, changeDetectorRef } = makeComponent();
		changeDetectorRef.markForCheck.calls.reset();
		component.ngOnDestroy();
		cosmetics.version$.next(2);
		expect(changeDetectorRef.markForCheck).not.toHaveBeenCalled();
	});

	describe('getBodyImage', () => {
		it('uses the bundled body sprite for the player colour', () => {
			const { component } = makeComponent(makePlayer({ colorId: 3 }));
			expect(component.getBodyImage()).toBe('assets/avatar/players/3-alive.png');
		});

		it('falls back to color 0 for an out-of-range colour so the avatar is never broken', () => {
			const { component } = makeComponent(makePlayer({ colorId: 99 }));
			expect(component.getBodyImage()).toBe('assets/avatar/players/0-alive.png');
		});

		it('uses the ghost sprite when dead', () => {
			const { component } = makeComponent(makePlayer({ colorId: 3 }));
			component.isDead = true;
			expect(component.getBodyImage()).toBe('assets/avatar/players/3-dead.png');
		});

		it('uses the NoS published RGB instead of the base color', () => {
			const { component, cosmetics } = makeComponent(
				makePlayer({
					colorId: 0,
					nosPlayer: {
						playerId: 1,
						name: 'NoS',
						isKiller: false,
						isImpostor: false,
						isCrewmate: true,
						isNeutral: false,
						isImpostorlike: false,
						speakerPositionX: 0,
						speakerPositionY: 0,
						colorR: 0x13 / 255,
						colorG: 0x2e / 255,
						colorB: 0xd1 / 255,
					},
				})
			);
			component.mod = 'NoS';
			expect(component.getBodyImage()).toBe('assets/avatar/players/1-alive.png');
			component.getHat();
			expect(cosmetics.getCosmeticRender).toHaveBeenCalledWith(1, CosmeticType.hat, 'hat_pizza', 'NoS');
		});

		it('prefers the NoS costume names over the game cosmetic ids', () => {
			const { component, cosmetics } = makeComponent(
				makePlayer({
					nosPlayer: {
						playerId: 1,
						name: 'NoS',
						isKiller: false,
						isImpostor: false,
						isCrewmate: true,
						isNeutral: false,
						isImpostorlike: false,
						speakerPositionX: 0,
						speakerPositionY: 0,
						colorR: Number.NaN,
						colorG: 0,
						colorB: 0,
						hat: { name: 'NosHat' },
						skin: { name: 'NosSkin' },
					},
				})
			);
			component.getHat();
			expect(cosmetics.getCosmeticRender).toHaveBeenCalledWith(0, CosmeticType.hat, 'hat_pizza', 'NONE');
			component.mod = 'NoS';
			component.getHat();
			component.getSkin();
			expect(cosmetics.getCosmeticRender).toHaveBeenCalledWith(0, CosmeticType.hat, 'NosHat', 'NoS');
			expect(cosmetics.getCosmeticRender).toHaveBeenCalledWith(0, CosmeticType.skin, 'NosSkin', 'NoS');
		});

		it('uses NoS lobby colour and current outfit before round PlayerData arrives', () => {
			const { component, cosmetics } = makeComponent(
				makePlayer({
					colorId: 0,
					nosLobbyColor: '#132ed1',
					appearanceHatId: 'LobbyHat',
					appearanceSkinId: 'LobbySkin',
					appearanceVisorId: 'LobbyVisor',
				})
			);
			component.mod = 'NoS';
			component.isLobby = true;
			expect(component.getBodyImage()).toBe('assets/avatar/players/1-alive.png');
			component.getHat();
			component.getSkin();
			component.getVisor();
			expect(cosmetics.getCosmeticRender).toHaveBeenCalledWith(1, CosmeticType.hat, 'LobbyHat', 'NoS');
			expect(cosmetics.getCosmeticRender).toHaveBeenCalledWith(1, CosmeticType.skin, 'LobbySkin', 'NoS');
			expect(cosmetics.getCosmeticRender).toHaveBeenCalledWith(1, CosmeticType.visor, 'LobbyVisor', 'NoS');
		});

		it('uses the appearance colour when the NoS lobby RGB has no bundled sprite', () => {
			const { component } = makeComponent(makePlayer({ colorId: 0, appearanceColorId: 3, nosLobbyColor: '#123456' }));
			component.mod = 'NoS';
			component.isLobby = true;
			expect(component.getBodyImage()).toBe('assets/avatar/players/3-alive.png');
		});

		it('keeps a removed NoS lobby hat removed instead of restoring the old game ID', () => {
			const { component, cosmetics } = makeComponent(makePlayer({ appearanceHatId: '' }));
			component.mod = 'NoS';
			component.isLobby = true;
			component.getHat();
			expect(cosmetics.getCosmeticRender).toHaveBeenCalledWith(0, CosmeticType.hat, '', 'NoS');
		});

		it('does not replace host-local NoS images with unrelated CDN sprites', () => {
			const { component, cosmetics } = makeComponent(
				makePlayer({
					nosCosmetics: {
						hat: 'nos-cosmetic://image/hat',
						hatBack: 'nos-cosmetic://image/hat-back',
						skin: 'nos-cosmetic://image/skin',
						visor: 'nos-cosmetic://image/visor',
					},
				})
			);
			component.mod = 'NoS';
			expect(component.getHat()).toBeUndefined();
			expect(component.getHatBack()).toBeUndefined();
			expect(component.getSkin()).toBeUndefined();
			expect(component.getVisor()).toBeUndefined();
			expect(cosmetics.getCosmeticRender).not.toHaveBeenCalled();
		});

		it('uses the active appearance color during a disguise', () => {
			const { component } = makeComponent(makePlayer({ colorId: 2, currentOutfit: 1, appearanceColorId: 5 }));
			expect(component.getBodyImage()).toBe('assets/avatar/players/5-alive.png');
		});
	});
});
