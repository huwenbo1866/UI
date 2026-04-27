import { describe, expect, it } from 'vitest';

import { samplePack } from '../data/sample-pack';
import { createInitialGameState } from '../state/game-store';
import { addDrone, updateDrones } from './drone-system';

describe('updateDrones', () => {
	it('distributes drones across similar nearby targets', () => {
		const state = createInitialGameState(samplePack, 1200, 820, 'straight');
		addDrone(state);
		addDrone(state);
		state.monsters = [
			{ id: 'm1', difficulty: 'easy', x: state.player.x + 120, y: state.player.y - 20, radius: 22, hp: 100, maxHp: 100, speed: 45, damage: 10, isDead: false, hurtFlashMs: 0, attackCooldownMs: 280, attackWindupMs: 0, moveDirX: 0, moveDirY: 1 },
			{ id: 'm2', difficulty: 'easy', x: state.player.x + 118, y: state.player.y + 24, radius: 22, hp: 100, maxHp: 100, speed: 45, damage: 10, isDead: false, hurtFlashMs: 0, attackCooldownMs: 280, attackWindupMs: 0, moveDirX: 0, moveDirY: 1 }
		];

		updateDrones(state, 0.1, 100);

		const targetIds = new Set(state.drones.map((drone) => drone.targetMonsterId));
		expect(targetIds.size).toBeGreaterThan(1);
	});

	it('keeps multiple drones in distinct combat positions on one target', () => {
		const state = createInitialGameState(samplePack, 1200, 820, 'straight');
		addDrone(state);
		addDrone(state);
		state.monsters = [
			{ id: 'm1', difficulty: 'easy', x: state.player.x + 140, y: state.player.y, radius: 22, hp: 500, maxHp: 500, speed: 45, damage: 10, isDead: false, hurtFlashMs: 0, attackCooldownMs: 280, attackWindupMs: 0, moveDirX: 0, moveDirY: 1 }
		];

		for (let i = 0; i < 12; i += 1) updateDrones(state, 0.1, 100);

		const [a, b] = state.drones;
		expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(20);
	});
});
