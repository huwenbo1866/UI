import { describe, expect, it } from 'vitest';

import { samplePack } from '../data/sample-pack';
import { createInitialGameState } from './game-store';

describe('createInitialGameState', () => {
	it('starts with pulse ability ready and movement metadata initialized', () => {
		const state = createInitialGameState(samplePack, 1200, 820, 'scatter');

		expect(state.runtime.actionCooldownMs.H).toBe(0);
		expect(state.runtime.actionCooldownMs.J).toBe(0);
		expect(state.runtime.actionCooldownMs.K).toBe(0);
		expect(state.runtime.actionCooldownMs.L).toBe(0);
		expect(state.runtime.abilityPulseFxMs).toBe(0);
		expect(state.runtime.abilityDashFxMs).toBe(0);
		expect(state.runtime.abilityKarateFxMs).toBe(0);
		expect(state.runtime.dashRemainingMs).toBe(0);
		expect(state.player.moving).toBe(false);
		expect(state.player.moveDirX).toBe(0);
		expect(state.player.moveDirY).toBe(1);
		expect(state.settings.attackPreference).toBe('scatter');
		expect(state.loadout.mainWeaponId).toBe('weapon_main_scatter');
		expect(state.battlefieldDrops).toEqual([]);
		expect(state.ui.pickupFeedback).toBeNull();
		expect(state.runTelemetry.elapsedMs).toBe(0);
		expect(state.runTelemetry.totalDamageTaken).toBe(0);
		expect(state.runTelemetry.lastDamageSource).toBeNull();
		expect(state.runTelemetry.defeatSource).toBeNull();
		expect(state.runTelemetry.damageBySource.melee.damage).toBe(0);
		expect(state.runTelemetry.damageBySource.dash.damage).toBe(0);
		expect(state.runTelemetry.damageBySource.projectile.damage).toBe(0);
		expect(state.buffs.moveSpeedBoostUntil).toBe(0);
		expect(state.buffs.attackSpeedBoostUntil).toBe(0);
		expect(state.buffs.damageBoostUntil).toBe(0);
		expect(state.buffs.permanentMoveSpeedMultiplier).toBe(1);
		expect(state.buffs.permanentAttackSpeedMultiplier).toBe(1);
		expect(state.buffs.permanentDamageMultiplier).toBe(1);
		expect(state.buffs.shieldBlockCharges).toBe(0);
		expect(state.build.weaponLevels.weapon_main_karate).toBe(0);
		expect(state.build.mods.scatterBleedDamagePerTick).toBe(0);
		expect(state.build.mods.scatterBleedTickIntervalMs).toBe(0);
		expect(state.build.mods.scatterBleedMaxTicks).toBe(0);
		expect(state.ui.recentRewardDefinitionIds).toEqual([]);
		expect(state.ui.recentQuestionIds).toEqual([]);
	});
});
