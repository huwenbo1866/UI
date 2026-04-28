import { describe, expect, it } from 'vitest';

import { samplePack } from '../data/sample-pack';
import { createInitialGameState } from '../state/game-store';
import {
	applyBattlefieldDropPickup,
	finalizeMonsterDeath,
	getBattlefieldDropDefinition,
	updateBattlefieldDrops
} from './battlefield-drop-system';

describe('battlefield drop system', () => {
	it('spawns drops from the shared monster death finalizer', () => {
		const state = createInitialGameState(samplePack, 1200, 820, 'straight');
		const monster = {
			id: 'shared-finalizer',
			difficulty: 'hard' as const,
			x: 400,
			y: 320,
			radius: 30,
			hp: 0,
			maxHp: 300,
			speed: 60,
			damage: 40,
			isDead: false,
			hurtFlashMs: 0,
			attackCooldownMs: 0,
			attackState: 'idle' as const,
			attackWindupMs: 0,
			moving: false,
			moveDirX: 0,
			moveDirY: 1
		};

		const values = [0, 0.2];
		const drop = finalizeMonsterDeath(state, monster, {
			random: () => values.shift() ?? 0
		});

		expect(monster.isDead).toBe(true);
		expect(state.battle.kills).toBe(1);
		expect(state.progress.exp).toBeGreaterThan(0);
		expect(drop?.kind).toBe('weapon');
		expect(state.battlefieldDrops).toHaveLength(1);
	});

	it('expires uncollected drops after their ttl elapses', () => {
		const state = createInitialGameState(samplePack, 1200, 820, 'straight');
		state.battlefieldDrops = [
			{
				id: 'drop-expire',
				kind: 'xp',
				x: state.player.x + 400,
				y: state.player.y,
				radius: 20,
				ttlMs: 50
			}
		];

		updateBattlefieldDrops(state, 60, 1000);

		expect(state.battlefieldDrops).toEqual([]);
	});

	it('applies pickup effects and HUD feedback when pickup is resolved', () => {
		const state = createInitialGameState(samplePack, 1200, 820, 'straight');
		state.player.hp = 120;
		const healDrop = {
			id: 'drop-heal',
			kind: 'heal' as const,
			x: state.player.x,
			y: state.player.y,
			radius: 20,
			ttlMs: 5000
		};

		applyBattlefieldDropPickup(state, healDrop);

		expect(state.player.hp).toBeGreaterThan(120);
		expect(state.ui.pickupFeedback?.title).toBe(getBattlefieldDropDefinition('heal').title);
		expect(state.ui.pickupFeedback?.detail).toContain('恢复');
	});

	it('picks up overlapping drops during battlefield updates', () => {
		const state = createInitialGameState(samplePack, 1200, 820, 'scatter');
		state.battlefieldDrops = [
			{
				id: 'drop-weapon',
				kind: 'weapon',
				x: state.player.x,
				y: state.player.y,
				radius: 20,
				ttlMs: 5000
			}
		];

		updateBattlefieldDrops(state, 16, 2000);

		expect(state.battlefieldDrops).toHaveLength(0);
		expect(state.buffs.queuedWeaponBuff).toBe('scatter7');
		expect(state.buffs.queuedWeaponBuffUses).toBe(2);
		expect(state.ui.pickupFeedback?.detail).toContain('攻击强化');
	});
});
