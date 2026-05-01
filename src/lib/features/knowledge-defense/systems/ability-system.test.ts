import { afterEach, describe, expect, it, vi } from 'vitest';

import { ABILITY_DASH_IFRAME_MS } from '../config/constants';
import { samplePack } from '../data/sample-pack';
import { createInitialGameState } from '../state/game-store';
import { castActionSlot, grantPulseOvercharge, refreshActionSlot } from './ability-system';

afterEach(() => {
	vi.restoreAllMocks();
});

describe('castPulseAbility', () => {
	it('damages nearby monsters, grants cooldown/fx, and heals the player', () => {
		const state = createInitialGameState(samplePack, 1200, 820, 'straight');
		state.runtime.running = true;
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

		const casted = castActionSlot(state, 'H');

		expect(casted).toBe(true);
		expect(state.runtime.actionCooldownMs.H).toBeGreaterThan(0);
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
		state.runtime.running = true;
		state.runtime.actionCooldownMs.H = 3000;

		const casted = castActionSlot(state, 'H');

		expect(casted).toBe(false);
		expect(state.runtime.actionCooldownMs.H).toBe(3000);
	});

	it('refreshes pulse cooldown immediately', () => {
		const state = createInitialGameState(samplePack, 1200, 820, 'straight');
		state.runtime.running = true;
		state.runtime.actionCooldownMs.H = 8000;

		refreshActionSlot(state, 'H');

		expect(state.runtime.actionCooldownMs.H).toBe(0);
	});

	it('spends one stored overcharge to strengthen the next pulse only', () => {
		const state = createInitialGameState(samplePack, 1200, 820, 'straight');
		state.runtime.running = true;
		state.player.hp = 90;
		state.monsters = [
			{
				id: 'overcharge-target',
				difficulty: 'easy',
				x: state.player.x + 140,
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
		const beforeStacks = state.buffs.pulseOverchargeStacks;

		const casted = castActionSlot(state, 'H');

		expect(casted).toBe(true);
		expect(beforeStacks).toBeGreaterThan(0);
		expect(state.buffs.pulseOverchargeStacks).toBe(beforeStacks - 1);
	});

	it('starts a locked-direction dash with iframe and dash fx instead of instant blink', () => {
		const state = createInitialGameState(samplePack, 1200, 820, 'straight');
		state.runtime.running = true;
		state.loadout.actionSlots.J = 'skill_dash';
		state.build.skillLevels.skill_dash = 1;
		state.player.moveDirX = 1;
		state.player.moveDirY = 0;
		const startX = state.player.x;

		const casted = castActionSlot(state, 'J');

		expect(casted).toBe(true);
		expect(state.player.x).toBe(startX);
		expect(state.runtime.dashRemainingMs).toBeGreaterThan(0);
		expect(state.runtime.dashDirectionX).toBe(1);
		expect(state.runtime.abilityDashFxMs).toBeGreaterThan(0);
		expect(state.player.contactInvulnMs).toBe(ABILITY_DASH_IFRAME_MS);
	});

	it('stores karate punch feedback direction when karate is cast', () => {
		const state = createInitialGameState(samplePack, 1200, 820, 'straight');
		state.runtime.running = true;
		state.loadout.actionSlots.J = 'skill_karate';
		state.build.skillLevels.skill_karate = 1;
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

		const casted = castActionSlot(state, 'J');

		expect(casted).toBe(true);
		expect(state.runtime.abilityKarateFxMs).toBeGreaterThan(0);
		expect(state.runtime.karateDirectionX).toBeGreaterThan(0);
	});

	it('extends karate skill reach when the run has a karate range upgrade', () => {
		const state = createInitialGameState(samplePack, 1200, 820, 'straight');
		state.runtime.running = true;
		state.loadout.actionSlots.J = 'skill_karate';
		state.build.skillLevels.skill_karate = 1;
		state.build.mods.karateRangeMultiplier = 1.5;
		state.monsters = [
			{
				id: 'far-karate-target',
				difficulty: 'easy',
				x: state.player.x + 130,
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

		const casted = castActionSlot(state, 'J');

		expect(casted).toBe(true);
		expect(state.monsters[0].hp).toBeLessThan(100);
	});


});
