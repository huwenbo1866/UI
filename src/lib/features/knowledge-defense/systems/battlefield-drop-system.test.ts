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
		const validKinds = new Set(['weapon', 'xp', 'heal', 'speed', 'attackSpeed', 'damage', 'shield', 'reroll']);
		const validDefinitionIds = new Set([
			'drop_weapon_supply',
			'drop_xp_crystal',
			'drop_heal_pack',
			'drop_speed_tonic',
			'drop_attack_manual',
			'drop_damage_core',
			'drop_guard_shield',
			'drop_reroll_coupon'
		]);

		expect(monster.isDead).toBe(true);
		expect(state.battle.kills).toBe(1);
		expect(state.progress.exp).toBeGreaterThan(0);
		expect(validKinds.has(drop?.kind ?? '')).toBe(true);
		expect(validDefinitionIds.has(drop?.definitionId ?? '')).toBe(true);
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
			definitionId: 'drop_heal_pack' as const,
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

	it('grants shield and reroll coupon through additive pickup handlers', () => {
		const state = createInitialGameState(samplePack, 1200, 820, 'straight');

		applyBattlefieldDropPickup(state, {
			id: 'drop-shield',
			definitionId: 'drop_guard_shield',
			kind: 'shield',
			x: state.player.x,
			y: state.player.y,
			radius: 20,
			ttlMs: 5000
		});
		const beforeRerolls = state.ui.rewardRerollsRemaining;
		applyBattlefieldDropPickup(state, {
			id: 'drop-reroll',
			definitionId: 'drop_reroll_coupon',
			kind: 'reroll',
			x: state.player.x,
			y: state.player.y,
			radius: 20,
			ttlMs: 5000
		});

		expect(state.buffs.shieldBlockCharges).toBe(1);
		expect(state.ui.rewardRerollsRemaining).toBe(beforeRerolls + 1);
		expect(state.ui.pickupFeedback?.detail).toContain('重随机会');
	});

	it('picks up overlapping drops during battlefield updates', () => {
		const state = createInitialGameState(samplePack, 1200, 820, 'scatter');
		state.battlefieldDrops = [
			{
				id: 'drop-weapon',
				definitionId: 'drop_weapon_supply',
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
