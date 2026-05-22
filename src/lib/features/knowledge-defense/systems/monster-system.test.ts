import { describe, expect, it } from 'vitest';

import {
	MONSTER_ATTACK_WINDUP_MS,
	MONSTER_DASH_COOLDOWN_MS,
	MONSTER_DASH_RECOVERY_MS,
	MONSTER_DASH_TELEGRAPH_MS,
	MONSTER_THROW_PROJECTILE_TTL_MS,
	MONSTER_THROW_TELEGRAPH_MS
} from '../config/constants';
import type { MonsterState } from '../core/types';
import { samplePack } from '../data/sample-pack';
import { createInitialGameState } from '../state/game-store';
import { maybeSpawnMonster, updateMonsters } from './monster-system';

function createMonster(overrides: Partial<MonsterState> = {}): MonsterState {
	return {
		id: 'monster-test',
		difficulty: 'easy',
		x: 520,
		y: 380,
		radius: 22,
		hp: 100,
		maxHp: 100,
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
		...overrides
	};
}

describe('updateMonsters', () => {
	it('spreads monsters that approach from the same lane', () => {
		const state = createInitialGameState(samplePack, 1200, 820, 'straight');
		state.player.x = 600;
		state.player.y = 410;
		state.monsters = [
			createMonster({ id: 'm1', x: 520, y: 380 }),
			createMonster({ id: 'm2', x: 522, y: 382 })
		];

		for (let i = 0; i < 12; i += 1) updateMonsters(state, 0.1, 100);

		expect(
			Math.hypot(
				state.monsters[0].x - state.monsters[1].x,
				state.monsters[0].y - state.monsters[1].y
			)
		).toBeGreaterThan(44);
	});

	it('spawns monsters with an explicit idle melee attack state', () => {
		const state = createInitialGameState(samplePack, 1200, 820, 'straight');
		state.runtime.spawnCooldownMs = 0;

		maybeSpawnMonster(state, 0);

		expect(state.monsters).toHaveLength(1);
		expect(state.monsters[0].attackState).toBe('idle');
		expect(state.monsters[0].attackWindupMs).toBe(0);
	});

	it('enters a telegraph state before melee damage lands', () => {
		const state = createInitialGameState(samplePack, 1200, 820, 'straight');
		state.player.x = 600;
		state.player.y = 410;
		state.monsters = [
			createMonster({
				id: 'telegraph-monster',
				x: state.player.x + state.player.radius + 20,
				y: state.player.y,
				speed: 0,
				damage: 40,
				attackCooldownMs: 0
			})
		];

		updateMonsters(state, 0.05, 50);

		expect(state.monsters[0].attackState).toBe('telegraph');
		expect(state.monsters[0].attackWindupMs).toBe(MONSTER_ATTACK_WINDUP_MS);
		expect(state.player.hp).toBe(state.player.maxHp);

		updateMonsters(state, 0.2, 200);

		expect(state.monsters[0].attackState).toBe('telegraph');
		expect(state.monsters[0].attackWindupMs).toBe(120);
		expect(state.player.hp).toBe(state.player.maxHp);

		updateMonsters(state, 0.12, 120);

		expect(state.monsters[0].attackState).toBe('idle');
		expect(state.monsters[0].attackCooldownMs).toBeGreaterThan(0);
		expect(state.player.hp).toBe(state.player.maxHp - 40);
		expect(state.runTelemetry.lastDamageSource).toBe('melee');
		expect(state.runTelemetry.damageBySource.melee.damage).toBe(40);
	});

	it('holds position while telegraphing and cancels cleanly when the player escapes melee range', () => {
		const state = createInitialGameState(samplePack, 1200, 820, 'straight');
		state.player.x = 600;
		state.player.y = 410;
		state.monsters = [
			createMonster({
				id: 'telegraph-hold-monster',
				x: state.player.x + state.player.radius + 20,
				y: state.player.y,
				speed: 90,
				attackCooldownMs: 0
			})
		];

		updateMonsters(state, 0.05, 50);

		const { x: telegraphX, y: telegraphY } = state.monsters[0];

		updateMonsters(state, 0.1, 100);

		expect(state.monsters[0].attackState).toBe('telegraph');
		expect(state.monsters[0].x).toBe(telegraphX);
		expect(state.monsters[0].y).toBe(telegraphY);
		expect(state.player.hp).toBe(state.player.maxHp);

		state.player.x += 240;

		updateMonsters(state, 0.05, 50);

		expect(state.monsters[0].attackState).toBe('idle');
		expect(state.monsters[0].attackWindupMs).toBe(0);
		expect(state.monsters[0].x).toBe(telegraphX);
		expect(state.monsters[0].y).toBe(telegraphY);
		expect(state.player.hp).toBe(state.player.maxHp);
	});

	it('clears the telegraph state when the player leaves melee range', () => {
		const state = createInitialGameState(samplePack, 1200, 820, 'straight');
		state.player.x = 600;
		state.player.y = 410;
		state.monsters = [
			createMonster({
				id: 'reset-monster',
				x: state.player.x + state.player.radius + 20,
				y: state.player.y,
				speed: 0,
				attackCooldownMs: 0
			})
		];

		updateMonsters(state, 0.05, 50);
		state.player.x += 300;

		updateMonsters(state, 0.05, 50);

		expect(state.monsters[0].attackState).toBe('idle');
		expect(state.monsters[0].attackWindupMs).toBe(0);
		expect(state.player.hp).toBe(state.player.maxHp);
	});

	it('commits medium monsters to a telegraphed dash path before recovery and cooldown', () => {
		const state = createInitialGameState(samplePack, 1200, 820, 'straight');
		state.player.x = 600;
		state.player.y = 410;
		state.monsters = [
			createMonster({
				id: 'dash-monster',
				difficulty: 'medium',
				x: state.player.x - 110,
				y: state.player.y,
				radius: 26,
				hp: 180,
				maxHp: 180,
				speed: 50,
				damage: 40,
				attackCooldownMs: 0
			})
		];

		updateMonsters(state, 0.05, 50);

		expect(state.monsters[0].attackState).toBe('telegraph');
		expect(state.monsters[0].attackWindupMs).toBe(MONSTER_DASH_TELEGRAPH_MS);

		const dashStartY = state.monsters[0].y;
		const dashStartX = state.monsters[0].x;
		state.player.y += 220;

		updateMonsters(
			state,
			MONSTER_DASH_TELEGRAPH_MS / 1000,
			MONSTER_DASH_TELEGRAPH_MS
		);

		expect(state.monsters[0].attackState).toBe('active');

		updateMonsters(state, 0.1, 100);

		expect(state.monsters[0].x).toBeGreaterThan(dashStartX);
		expect(state.monsters[0].y).toBeCloseTo(dashStartY, 3);
		expect(state.player.hp).toBe(state.player.maxHp);

		updateMonsters(state, 0.08, 80);

		expect(state.monsters[0].attackState).toBe('recovery');
		expect(state.monsters[0].attackCooldownMs).toBe(MONSTER_DASH_COOLDOWN_MS);

		updateMonsters(
			state,
			MONSTER_DASH_RECOVERY_MS / 1000,
			MONSTER_DASH_RECOVERY_MS
		);

		expect(state.monsters[0].attackState).toBe('idle');
		expect(state.monsters[0].attackCooldownMs).toBeGreaterThan(0);
	});

	it('damages the player at most once per medium dash burst', () => {
		const state = createInitialGameState(samplePack, 1200, 820, 'straight');
		state.player.x = 600;
		state.player.y = 410;
		state.monsters = [
			createMonster({
				id: 'dash-hit-monster',
				difficulty: 'medium',
				x: state.player.x - 96,
				y: state.player.y,
				radius: 26,
				hp: 180,
				maxHp: 180,
				speed: 50,
				damage: 40,
				attackCooldownMs: 0
			})
		];

		updateMonsters(state, 0.05, 50);
		updateMonsters(
			state,
			MONSTER_DASH_TELEGRAPH_MS / 1000,
			MONSTER_DASH_TELEGRAPH_MS
		);
		updateMonsters(state, 0.06, 60);

		expect(state.monsters[0].attackState).toBe('active');
		expect(state.player.hp).toBe(state.player.maxHp - 40);
		expect(state.runTelemetry.lastDamageSource).toBe('dash');
		expect(state.runTelemetry.damageBySource.dash.damage).toBe(40);

		state.player.contactInvulnMs = 0;
		const hpAfterFirstDashHit = state.player.hp;

		updateMonsters(state, 0.06, 60);

		expect(state.monsters[0].attackState).toBe('active');
		expect(state.player.hp).toBe(hpAfterFirstDashHit);
	});

	it('spawns a committed hostile projectile for hard monster throws', () => {
		const state = createInitialGameState(samplePack, 1200, 820, 'straight');
		state.player.x = 600;
		state.player.y = 410;
		state.monsters = [
			createMonster({
				id: 'throw-monster',
				difficulty: 'hard',
				x: state.player.x - 140,
				y: state.player.y,
				radius: 30,
				hp: 300,
				maxHp: 300,
				speed: 60,
				damage: 50,
				attackCooldownMs: 0
			})
		];

		updateMonsters(state, 0.05, 50);

		expect(state.monsters[0].attackState).toBe('telegraph');
		expect(state.monsters[0].attackWindupMs).toBe(MONSTER_THROW_TELEGRAPH_MS);

		state.player.y += 200;

		updateMonsters(
			state,
			MONSTER_THROW_TELEGRAPH_MS / 1000,
			MONSTER_THROW_TELEGRAPH_MS
		);

		expect(state.monsters[0].attackState).toBe('idle');
		expect(state.projectiles).toHaveLength(1);
		expect(state.projectiles[0].owner).toBe('monster');
		expect(state.projectiles[0].ttlMs).toBe(MONSTER_THROW_PROJECTILE_TTL_MS);
		expect(state.projectiles[0].vx).toBeGreaterThan(0);
		expect(Math.abs(state.projectiles[0].vy)).toBeLessThan(1);

		updateMonsters(state, 0.1, 100);

		expect(state.projectiles).toHaveLength(1);
	});

	it('applies discrete bleed ticks and expires after the configured count', () => {
		const state = createInitialGameState(samplePack, 1200, 820, 'straight');
		state.monsters = [
			createMonster({
				id: 'bleeding-monster',
				hp: 30,
				maxHp: 30,
				statusEffects: [
					{
						id: 'bleed_1',
						kind: 'bleed',
						source: 'scatter',
						damagePerTick: 3,
						tickIntervalMs: 1000,
						nextTickAt: Date.now(),
						remainingTicks: 3
					}
				]
			})
		];

		updateMonsters(state, 0.1, 100);
		expect(state.monsters[0].hp).toBe(27);
		expect(state.monsters[0].statusEffects).toHaveLength(1);

		state.monsters[0].statusEffects![0].nextTickAt = Date.now();
		updateMonsters(state, 0.1, 100);
		expect(state.monsters[0].hp).toBe(24);

		state.monsters[0].statusEffects![0].nextTickAt = Date.now();
		updateMonsters(state, 0.1, 100);
		expect(state.monsters[0].hp).toBe(21);
		expect(state.monsters[0].statusEffects).toHaveLength(0);
	});
});
