import { afterEach, describe, expect, it, vi } from 'vitest';

import { samplePack } from '../data/sample-pack';
import { createInitialGameState } from '../state/game-store';
import { updateMonsters } from './monster-system';
import { updateProjectiles } from './projectile-system';

afterEach(() => {
	vi.restoreAllMocks();
});

	describe('updateProjectiles', () => {
	it('funnels projectile kills through shared death finalization and spawns drops', () => {
		const state = createInitialGameState(samplePack, 1200, 820, 'straight');
		vi.spyOn(Math, 'random').mockReturnValue(0);

		state.monsters = [
			{
				id: 'projectile-target',
				difficulty: 'easy',
				x: 520,
				y: 380,
				radius: 22,
				hp: 10,
				maxHp: 10,
				speed: 45,
				damage: 10,
				isDead: false,
				hurtFlashMs: 0,
				attackCooldownMs: 280,
				attackState: 'idle',
				attackWindupMs: 0,
				moving: false,
				moveDirX: 0,
				moveDirY: 1
			}
		];
		state.projectiles = [
			{
				id: 'projectile-hit',
				x: 520,
				y: 380,
				vx: 0,
				vy: 0,
				radius: 8,
				damage: 12,
				color: '#f59e0b',
				owner: 'player'
			}
		];

		updateProjectiles(state, 0);

		expect(state.battle.kills).toBe(1);
		expect(state.monsters).toHaveLength(0);
		expect(state.battlefieldDrops).toHaveLength(1);
		expect(state.battlefieldDrops[0].kind).toBe('weapon');
	});

	it('routes hostile projectiles into the player without damaging monsters', () => {
		const state = createInitialGameState(samplePack, 1200, 820, 'straight');
		state.player.x = 520;
		state.player.y = 380;
		state.monsters = [
			{
				id: 'nearby-monster',
				difficulty: 'medium',
				x: 520,
				y: 380,
				radius: 26,
				hp: 180,
				maxHp: 180,
				speed: 50,
				damage: 20,
				isDead: false,
				hurtFlashMs: 0,
				attackCooldownMs: 280,
				attackState: 'idle',
				attackWindupMs: 0,
				moving: false,
				moveDirX: 0,
				moveDirY: 1
			}
		];
		state.projectiles = [
			{
				id: 'hostile-hit',
				x: 520,
				y: 380,
				vx: 0,
				vy: 0,
				radius: 10,
				damage: 18,
				color: '#7f1d1d',
				owner: 'monster',
				ttlMs: 600
			}
		];

		updateProjectiles(state, 0);

		expect(state.player.hp).toBe(state.player.maxHp - 18);
		expect(state.runTelemetry.lastDamageSource).toBe('projectile');
		expect(state.runTelemetry.damageBySource.projectile.damage).toBe(18);
		expect(state.monsters[0].hp).toBe(state.monsters[0].maxHp);
		expect(state.projectiles).toHaveLength(0);
	});

	it('respects player i-frames for hostile projectiles while still expiring the projectile', () => {
		const state = createInitialGameState(samplePack, 1200, 820, 'straight');
		state.player.x = 520;
		state.player.y = 380;
		state.player.contactInvulnMs = 320;
		state.projectiles = [
			{
				id: 'hostile-iframe-hit',
				x: 520,
				y: 380,
				vx: 0,
				vy: 0,
				radius: 10,
				damage: 18,
				color: '#7f1d1d',
				owner: 'monster',
				ttlMs: 600
			}
		];

		updateProjectiles(state, 0);

		expect(state.player.hp).toBe(state.player.maxHp);
		expect(state.projectiles).toHaveLength(0);
	});

	it('keeps live monsters in place on non-lethal projectile hits', () => {
		const state = createInitialGameState(samplePack, 1200, 820, 'straight');
		state.monsters = [
			{
				id: 'survivor',
				difficulty: 'easy',
				x: 520,
				y: 380,
				radius: 22,
				hp: 40,
				maxHp: 40,
				speed: 45,
				damage: 10,
				isDead: false,
				hurtFlashMs: 0,
				attackCooldownMs: 280,
				attackState: 'idle',
				attackWindupMs: 0,
				moving: false,
				moveDirX: 0,
				moveDirY: 1
			}
		];
		state.projectiles = [
			{
				id: 'chip-shot',
				x: 520,
				y: 380,
				vx: 0,
				vy: 0,
				radius: 8,
				damage: 10,
				owner: 'player'
			}
		];

		updateProjectiles(state, 0);

		expect(state.battle.kills).toBe(0);
		expect(state.monsters).toHaveLength(1);
		expect(state.monsters[0].id).toBe('survivor');
		expect(state.monsters[0].hp).toBe(30);
	});

	it('keeps missiles locked on their assigned target while it is alive', () => {
		const state = createInitialGameState(samplePack, 1200, 820, 'straight');
		state.monsters = [
			{
				id: 'locked-target',
				difficulty: 'easy',
				x: 720,
				y: 380,
				radius: 22,
				hp: 60,
				maxHp: 60,
				speed: 45,
				damage: 10,
				isDead: false,
				hurtFlashMs: 0,
				attackCooldownMs: 280,
				attackState: 'idle',
				attackWindupMs: 0,
				moving: false,
				moveDirX: 0,
				moveDirY: 1
			},
			{
				id: 'nearer-other',
				difficulty: 'easy',
				x: 560,
				y: 380,
				radius: 22,
				hp: 60,
				maxHp: 60,
				speed: 45,
				damage: 10,
				isDead: false,
				hurtFlashMs: 0,
				attackCooldownMs: 280,
				attackState: 'idle',
				attackWindupMs: 0,
				moving: false,
				moveDirX: 0,
				moveDirY: 1
			}
		];
		state.projectiles = [
			{
				id: 'missile-locked',
				x: 600,
				y: 410,
				vx: 200,
				vy: 0,
				radius: 10,
				damage: 30,
				color: '#fb923c',
				owner: 'player',
				kind: 'missile',
				targetMonsterId: 'locked-target',
				homingStrength: 1,
				ttlMs: 1000
			}
		];

		updateProjectiles(state, 0.05);

		expect(state.projectiles).toHaveLength(1);
		expect(state.projectiles[0].targetMonsterId).toBe('locked-target');
		expect(state.projectiles[0].vx).toBeGreaterThan(0);
	});

	it('retargets missiles to the nearest live enemy when the locked target is already dead', () => {
		const state = createInitialGameState(samplePack, 1200, 820, 'straight');
		state.monsters = [
			{
				id: 'dead-target',
				difficulty: 'easy',
				x: 620,
				y: 410,
				radius: 22,
				hp: 0,
				maxHp: 60,
				speed: 45,
				damage: 10,
				isDead: true,
				hurtFlashMs: 0,
				attackCooldownMs: 280,
				attackState: 'idle',
				attackWindupMs: 0,
				moving: false,
				moveDirX: 0,
				moveDirY: 1
			},
			{
				id: 'next-target',
				difficulty: 'easy',
				x: 700,
				y: 410,
				radius: 22,
				hp: 60,
				maxHp: 60,
				speed: 45,
				damage: 10,
				isDead: false,
				hurtFlashMs: 0,
				attackCooldownMs: 280,
				attackState: 'idle',
				attackWindupMs: 0,
				moving: false,
				moveDirX: 0,
				moveDirY: 1
			}
		];
		state.projectiles = [
			{
				id: 'missile-retarget',
				x: 600,
				y: 410,
				vx: 0,
				vy: 0,
				radius: 10,
				damage: 30,
				color: '#fb923c',
				owner: 'player',
				kind: 'missile',
				targetMonsterId: 'dead-target',
				homingStrength: 1,
				ttlMs: 1000
			}
		];

		updateProjectiles(state, 0.05);

		expect(state.projectiles).toHaveLength(1);
		expect(state.projectiles[0].targetMonsterId).toBe('next-target');
		expect(state.projectiles[0].vx).toBeGreaterThan(0);
		expect(state.projectiles[0].x).toBeGreaterThan(600);
	});

	it('preserves missile travel speed while making a sharp retarget turn', () => {
		const state = createInitialGameState(samplePack, 1200, 820, 'straight');
		state.monsters = [
			{
				id: 'turn-target',
				difficulty: 'easy',
				x: 600,
				y: 520,
				radius: 22,
				hp: 60,
				maxHp: 60,
				speed: 45,
				damage: 10,
				isDead: false,
				hurtFlashMs: 0,
				attackCooldownMs: 280,
				attackState: 'idle',
				attackWindupMs: 0,
				moving: false,
				moveDirX: 0,
				moveDirY: 1
			}
		];
		state.projectiles = [
			{
				id: 'missile-sharp-turn',
				x: 600,
				y: 410,
				vx: 700,
				vy: 0,
				radius: 10,
				damage: 30,
				owner: 'player',
				kind: 'missile',
				targetMonsterId: 'turn-target',
				homingStrength: 0.08,
				ttlMs: 1000
			}
		];

		updateProjectiles(state, 0.05);

		const speed = Math.hypot(state.projectiles[0].vx, state.projectiles[0].vy);
		expect(speed).toBeCloseTo(700, 3);
	});

	it('spawns a burning ground zone instead of reusing monster bleed fields', () => {
		const state = createInitialGameState(samplePack, 1200, 820, 'straight');
		state.monsters = [
			{
				id: 'burn-target',
				difficulty: 'easy',
				x: 520,
				y: 380,
				radius: 22,
				hp: 60,
				maxHp: 60,
				speed: 45,
				damage: 10,
				isDead: false,
				hurtFlashMs: 0,
				attackCooldownMs: 280,
				attackState: 'idle',
				attackWindupMs: 0,
				moving: false,
				moveDirX: 0,
				moveDirY: 1
			}
		];
		state.projectiles = [
			{
				id: 'burn-missile',
				x: 520,
				y: 380,
				vx: 0,
				vy: 0,
				radius: 10,
				damage: 20,
				owner: 'player',
				kind: 'missile',
				explosionRadius: 92,
				leaveBurningMs: 2000,
				leaveBurningDps: 10
			}
		];

		updateProjectiles(state, 0);

		expect(state.deployables).toHaveLength(1);
		expect(state.deployables[0]).toMatchObject({
			kind: 'burn_zone',
			radius: 92,
			ttlMs: 2000,
			damagePerSecond: 10
		});
		expect(state.monsters[0].statusEffects ?? []).toHaveLength(0);
	});

	it('refreshes scatter bleed stacks without delaying the next scheduled tick', () => {
		const state = createInitialGameState(samplePack, 1200, 820, 'straight');
		state.monsters = [
			{
				id: 'bleed-refresh-target',
				difficulty: 'easy',
				x: 520,
				y: 380,
				radius: 22,
				hp: 60,
				maxHp: 60,
				speed: 45,
				damage: 10,
				isDead: false,
				hurtFlashMs: 0,
				attackCooldownMs: 280,
				attackState: 'idle',
				attackWindupMs: 0,
				moving: false,
				moveDirX: 0,
				moveDirY: 1,
				statusEffects: [
					{
						id: 'bleed_1',
						kind: 'bleed',
						source: 'scatter',
						damagePerTick: 3,
						tickIntervalMs: 1000,
						nextTickAt: Date.now(),
						remainingTicks: 1
					}
				]
			}
		];
		state.projectiles = [
			{
				id: 'refresh-pellet',
				x: 520,
				y: 380,
				vx: 0,
				vy: 0,
				radius: 8,
				damage: 1,
				owner: 'player',
				applyBleedDamagePerTick: 3,
				applyBleedTickIntervalMs: 1000,
				applyBleedMaxTicks: 3
			}
		];

		updateProjectiles(state, 0);
		updateMonsters(state, 0.1, 100);

		expect(state.monsters[0].hp).toBe(56);
		expect(state.monsters[0].statusEffects?.[0]?.remainingTicks).toBe(2);
	});
});
