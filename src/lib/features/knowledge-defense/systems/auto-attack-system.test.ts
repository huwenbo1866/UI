import { describe, expect, it } from 'vitest';

import { MISSILE_BURST_COUNT, STRAIGHT_BURST_INTERVAL_MS } from '../config/constants';
import { samplePack } from '../data/sample-pack';
import { createInitialGameState } from '../state/game-store';
import { tickAttackSequences } from './auto-attack-system';

describe('tickAttackSequences', () => {
	it('spaces straight burst shots across sequence ticks instead of stacking them at once', () => {
		const state = createInitialGameState(samplePack, 1200, 820, 'straight');
		state.monsters = [
			{
				id: 'target',
				difficulty: 'easy',
				x: 700,
				y: 410,
				radius: 22,
				hp: 100,
				maxHp: 100,
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
		state.build.mods.straightBurstExtra = 1;
		state.attackSequences = [
			{
				id: 'single-seq',
				weaponDefinitionId: 'weapon_main_straight',
				pattern: 'single',
				timeUntilNextMs: 0,
				shotIntervalMs: STRAIGHT_BURST_INTERVAL_MS,
				shotsRemaining: 2
			}
		];

		tickAttackSequences(state, 0);
		expect(state.projectiles).toHaveLength(1);
		expect(state.attackSequences[0]?.shotsRemaining).toBe(1);

		tickAttackSequences(state, STRAIGHT_BURST_INTERVAL_MS - 1);
		expect(state.projectiles).toHaveLength(1);

		tickAttackSequences(state, 1);
		expect(state.projectiles).toHaveLength(2);
	});

	it('applies straight pierce upgrades to straight4 sequence projectiles', () => {
		const state = createInitialGameState(samplePack, 1200, 820, 'straight');
		state.monsters = [
			{
				id: 'target',
				difficulty: 'easy',
				x: 700,
				y: 410,
				radius: 22,
				hp: 100,
				maxHp: 100,
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
		state.build.mods.straightPierce = 2;
		state.attackSequences = [
			{
				id: 'straight4-seq',
				weaponDefinitionId: 'weapon_buff_straight4',
				pattern: 'straight4',
				timeUntilNextMs: 0,
				shotIntervalMs: 160,
				shotsRemaining: 4
			}
		];

		tickAttackSequences(state, 0);

		expect(state.projectiles).toHaveLength(1);
		expect(state.projectiles[0].pierceRemaining).toBe(2);
		expect(state.projectiles[0].hitMonsterIds).toEqual([]);
	});

	it('launches missiles from above the player with different curved opening vectors', () => {
		const state = createInitialGameState(samplePack, 1200, 820, 'straight');
		state.monsters = [
			{
				id: 'target',
				difficulty: 'easy',
				x: 700,
				y: 410,
				radius: 22,
				hp: 100,
				maxHp: 100,
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
		state.attackSequences = [
			{
				id: 'missile-seq',
				weaponDefinitionId: 'weapon_main_missile',
				pattern: 'missileBurst',
				timeUntilNextMs: 0,
				shotIntervalMs: 140,
				shotsRemaining: MISSILE_BURST_COUNT
			}
		];

		tickAttackSequences(state, 0);
		tickAttackSequences(state, 140);

		expect(state.projectiles).toHaveLength(2);
		expect(state.projectiles.every((projectile) => projectile.kind === 'missile')).toBe(true);
		expect(state.projectiles.every((projectile) => projectile.y < state.player.y)).toBe(true);
		expect(state.projectiles[0].x).not.toBe(state.projectiles[1].x);
		expect(state.projectiles[0].vy).not.toBe(state.projectiles[1].vy);
	});

	it('fires baseline scatter as three pellets without bleed payload', () => {
		const state = createInitialGameState(samplePack, 1200, 820, 'scatter');
		state.monsters = [
			{
				id: 'scatter-target',
				difficulty: 'easy',
				x: 700,
				y: 410,
				radius: 22,
				hp: 100,
				maxHp: 100,
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
		state.attackSequences = [
			{
				id: 'scatter-seq',
				weaponDefinitionId: 'weapon_main_scatter',
				pattern: 'scatter',
				timeUntilNextMs: 0,
				shotIntervalMs: 0,
				shotsRemaining: 1
			}
		];

		tickAttackSequences(state, 0);

		expect(state.projectiles).toHaveLength(3);
		expect(state.projectiles.every((projectile) => projectile.applyBleedDamagePerTick === undefined)).toBe(true);
		expect(state.projectiles.every((projectile) => projectile.applyBleedTickIntervalMs === undefined)).toBe(true);
		expect(state.projectiles.every((projectile) => projectile.applyBleedMaxTicks === undefined)).toBe(true);
	});

	it('fires karate as a close-range main weapon without spawning bullets', () => {
		const state = createInitialGameState(samplePack, 1200, 820, 'straight');
		state.loadout.mainWeaponId = 'weapon_main_karate';
		state.monsters = [
			{
				id: 'karate-target',
				difficulty: 'easy',
				x: state.player.x + 30,
				y: state.player.y,
				radius: 22,
				hp: 100,
				maxHp: 100,
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
		state.attackSequences = [
			{
				id: 'karate-seq',
				weaponDefinitionId: 'weapon_main_karate',
				pattern: 'karateStrike',
				timeUntilNextMs: 0,
				shotIntervalMs: 0,
				shotsRemaining: 1
			}
		];

		tickAttackSequences(state, 0);

		expect(state.projectiles).toHaveLength(0);
		expect(state.runtime.abilityKarateFxMs).toBeGreaterThan(0);
		expect(state.monsters[0].hp).toBeLessThan(100);
	});
});
