import { afterEach, describe, expect, it, vi } from 'vitest';

import { samplePack } from '../data/sample-pack';
import { createInitialGameState } from '../state/game-store';
import { castPulseAbility, grantPulseOvercharge, refreshPulseAbility } from './ability-system';

afterEach(() => {
	vi.restoreAllMocks();
});

describe('castPulseAbility', () => {
	it('damages nearby monsters, grants cooldown/fx, and heals the player', () => {
		const state = createInitialGameState(samplePack, 1200, 820, 'straight');
		vi.spyOn(Math, 'random').mockReturnValue(0);
		state.player.hp = 120;
		state.monsters = [
			{
				id: 'near',
				difficulty: 'easy',
				x: state.player.x + 40,
				y: state.player.y,
				radius: 22,
				hp: 60,
				maxHp: 60,
				speed: 45,
				damage: 10,
				isDead: false,
				hurtFlashMs: 0,
				attackCooldownMs: 0,
				attackState: 'idle',
				attackWindupMs: 0,
				moving: false,
				moveDirX: 0,
				moveDirY: 1
			},
			{
				id: 'far',
				difficulty: 'easy',
				x: state.player.x + 500,
				y: state.player.y,
				radius: 22,
				hp: 60,
				maxHp: 60,
				speed: 45,
				damage: 10,
				isDead: false,
				hurtFlashMs: 0,
				attackCooldownMs: 0,
				attackState: 'idle',
				attackWindupMs: 0,
				moving: false,
				moveDirX: 0,
				moveDirY: 1
			}
		];

		const casted = castPulseAbility(state);

		expect(casted).toBe(true);
		expect(state.runtime.abilityCooldownMs).toBeGreaterThan(0);
		expect(state.runtime.abilityPulseFxMs).toBeGreaterThan(0);
		expect(state.player.hp).toBeGreaterThan(120);
		expect(state.battle.kills).toBe(1);
		expect(state.monsters).toHaveLength(1);
		expect(state.monsters[0].id).toBe('far');
		expect(state.battlefieldDrops).toHaveLength(1);
		expect(state.battlefieldDrops[0].kind).toBe('weapon');
	});

	it('does nothing while the ability is on cooldown', () => {
		const state = createInitialGameState(samplePack, 1200, 820, 'straight');
		state.runtime.abilityCooldownMs = 3000;

		const casted = castPulseAbility(state);

		expect(casted).toBe(false);
		expect(state.runtime.abilityCooldownMs).toBe(3000);
	});

	it('refreshes pulse cooldown immediately', () => {
		const state = createInitialGameState(samplePack, 1200, 820, 'straight');
		state.runtime.abilityCooldownMs = 8000;

		refreshPulseAbility(state);

		expect(state.runtime.abilityCooldownMs).toBe(0);
	});

	it('spends one stored overcharge to strengthen the next pulse only', () => {
		const state = createInitialGameState(samplePack, 1200, 820, 'straight');
		state.player.hp = 90;
		state.monsters = [
			{
				id: 'overcharge-target',
				difficulty: 'easy',
				x: state.player.x + 210,
				y: state.player.y,
				radius: 22,
				hp: 110,
				maxHp: 110,
				speed: 45,
				damage: 10,
				isDead: false,
				hurtFlashMs: 0,
				attackCooldownMs: 0,
				attackState: 'idle',
				attackWindupMs: 0,
				moving: false,
				moveDirX: 0,
				moveDirY: 1
			}
		];
		grantPulseOvercharge(state);

		const casted = castPulseAbility(state);

		expect(casted).toBe(true);
		expect(state.monsters).toHaveLength(0);
		expect(state.buffs.pulseOverchargeStacks).toBe(0);
		expect(state.player.hp).toBeGreaterThan(90);
	});
});
