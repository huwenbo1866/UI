import { afterEach, describe, expect, it, vi } from 'vitest';

import { samplePack } from '../data/sample-pack';
import { createInitialGameState } from '../state/game-store';
import { updateDrones } from './drone-system';

afterEach(() => {
	vi.restoreAllMocks();
});

describe('updateDrones', () => {
	it('finalizes drone kills through the shared monster death pipeline', () => {
		const state = createInitialGameState(samplePack, 1200, 820, 'straight');
		vi.spyOn(Math, 'random').mockReturnValue(1);

		state.monsters = [
			{
				id: 'drone-target',
				difficulty: 'easy',
				x: 640,
				y: 410,
				radius: 22,
				hp: 40,
				maxHp: 40,
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
		state.drones = [
			{
				id: 'drone-1',
				x: 620,
				y: 410,
				targetMonsterId: 'drone-target',
				attackCooldownMs: 0,
				orbitingDistance: 62,
				angle: 0,
				level: 3
			}
		];

		updateDrones(state, 0.016);

		expect(state.battle.kills).toBe(1);
		expect(state.monsters).toHaveLength(0);
		expect(state.drones[0].targetMonsterId).toBeNull();
	});
});
