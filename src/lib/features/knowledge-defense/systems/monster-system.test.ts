import { describe, expect, it } from 'vitest';

import { samplePack } from '../data/sample-pack';
import { createInitialGameState } from '../state/game-store';
import { updateMonsters } from './monster-system';

describe('updateMonsters', () => {
	it('spreads monsters that approach from the same lane', () => {
		const state = createInitialGameState(samplePack, 1200, 820, 'straight');
		state.player.x = 600;
		state.player.y = 410;
		state.monsters = [
			{ id: 'm1', difficulty: 'easy', x: 520, y: 380, radius: 22, hp: 100, maxHp: 100, speed: 45, damage: 10, isDead: false, hurtFlashMs: 0, attackCooldownMs: 280, attackWindupMs: 0, moveDirX: 0, moveDirY: 1 },
			{ id: 'm2', difficulty: 'easy', x: 522, y: 382, radius: 22, hp: 100, maxHp: 100, speed: 45, damage: 10, isDead: false, hurtFlashMs: 0, attackCooldownMs: 280, attackWindupMs: 0, moveDirX: 0, moveDirY: 1 }
		];

		for (let i = 0; i < 12; i += 1) updateMonsters(state, 0.1, 100);

		expect(Math.hypot(state.monsters[0].x - state.monsters[1].x, state.monsters[0].y - state.monsters[1].y)).toBeGreaterThan(44);
	});
});
