import { describe, expect, it } from 'vitest';

import { samplePack } from '../data/sample-pack';
import { createInputState } from '../adapters/input-adapter';
import { createInitialGameState } from '../state/game-store';
import { applyPlayerContactDamage, updatePlayer } from './player-system';

describe('updatePlayer', () => {
	it('updates movement flags and facing direction from keyboard input', () => {
		const state = createInitialGameState(samplePack, 1200, 820, 'straight');
		const input = createInputState();
		input.right = true;

		updatePlayer(state, input, 0.1, 100);

		expect(state.player.moving).toBe(true);
		expect(state.player.moveDirX).toBeGreaterThan(0);
		expect(state.player.moveDirY).toBe(0);
	});

	it('tracks melee damage telemetry and captures the defeat source', () => {
		const state = createInitialGameState(samplePack, 1200, 820, 'straight');
		state.player.hp = 24;

		applyPlayerContactDamage(state, 12, 'melee');

		expect(state.player.hp).toBe(12);
		expect(state.runTelemetry.totalDamageTaken).toBe(12);
		expect(state.runTelemetry.lastDamageSource).toBe('melee');
		expect(state.runTelemetry.defeatSource).toBeNull();
		expect(state.runTelemetry.damageBySource.melee.hits).toBe(1);
		expect(state.runTelemetry.damageBySource.melee.damage).toBe(12);

		state.player.contactInvulnMs = 0;
		applyPlayerContactDamage(state, 20, 'melee');

		expect(state.player.hp).toBe(0);
		expect(state.runTelemetry.totalDamageTaken).toBe(24);
		expect(state.runTelemetry.defeatSource).toBe('melee');
		expect(state.runTelemetry.damageBySource.melee.hits).toBe(2);
		expect(state.runTelemetry.damageBySource.melee.damage).toBe(24);
	});
});
