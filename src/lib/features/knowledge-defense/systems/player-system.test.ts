import { describe, expect, it } from 'vitest';

import { samplePack } from '../data/sample-pack';
import { createInputState } from '../adapters/input-adapter';
import { createInitialGameState } from '../state/game-store';
import { updatePlayer } from './player-system';

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
});
