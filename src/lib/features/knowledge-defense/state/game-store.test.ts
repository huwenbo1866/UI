import { describe, expect, it } from 'vitest';

import { samplePack } from '../data/sample-pack';
import { createInitialGameState } from './game-store';

describe('createInitialGameState', () => {
	it('starts with pulse ability ready and movement metadata initialized', () => {
		const state = createInitialGameState(samplePack, 1200, 820, 'scatter');

		expect(state.runtime.abilityCooldownMs).toBe(0);
		expect(state.runtime.abilityPulseFxMs).toBe(0);
		expect(state.player.moving).toBe(false);
		expect(state.player.moveDirX).toBe(0);
		expect(state.player.moveDirY).toBe(1);
		expect(state.settings.attackPreference).toBe('scatter');
		expect(state.battlefieldDrops).toEqual([]);
		expect(state.ui.pickupFeedback).toBeNull();
		expect(state.runTelemetry.elapsedMs).toBe(0);
		expect(state.runTelemetry.totalDamageTaken).toBe(0);
		expect(state.runTelemetry.lastDamageSource).toBeNull();
		expect(state.runTelemetry.defeatSource).toBeNull();
		expect(state.runTelemetry.damageBySource.melee.damage).toBe(0);
		expect(state.runTelemetry.damageBySource.dash.damage).toBe(0);
		expect(state.runTelemetry.damageBySource.projectile.damage).toBe(0);
	});
});
