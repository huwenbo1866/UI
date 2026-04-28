import { describe, expect, it } from 'vitest';

import {
	MONSTER_SPRITE_SEQUENCES,
	getMonsterAnimationOffset,
	getMonsterVisualState,
	resolveMonsterSpriteFrame
} from './monster-sprites';

describe('monster sprite resolver', () => {
	it('maps runtime flags to visual states with hurt taking priority', () => {
		expect(getMonsterVisualState({ attackState: 'idle', hurtFlashMs: 0, moving: false })).toBe(
			'idle'
		);
		expect(getMonsterVisualState({ attackState: 'idle', hurtFlashMs: 0, moving: true })).toBe(
			'move'
		);
		expect(getMonsterVisualState({ attackState: 'telegraph', hurtFlashMs: 0, moving: true })).toBe(
			'telegraph'
		);
		expect(getMonsterVisualState({ attackState: 'telegraph', hurtFlashMs: 80, moving: true })).toBe(
			'hurt'
		);
	});

	it('cycles through distinct frame sequences for idle, move, and telegraph across every difficulty', () => {
		const difficulties = ['easy', 'medium', 'hard'] as const;
		const animatedStates = ['idle', 'move', 'telegraph'] as const;

		for (const difficulty of difficulties) {
			for (const visualState of animatedStates) {
				const sequence = MONSTER_SPRITE_SEQUENCES[difficulty][visualState];

				expect(sequence.frames.length).toBeGreaterThan(1);
				expect(new Set(sequence.frames).size).toBe(sequence.frames.length);
				expect(
					sequence.frames.every((frame) =>
						frame.startsWith(`/knowledge-defense/monsters/${difficulty}/`)
					)
				).toBe(true);

				const firstFrame = resolveMonsterSpriteFrame({
					difficulty,
					visualState,
					elapsedMs: 0
				});
				const secondFrame = resolveMonsterSpriteFrame({
					difficulty,
					visualState,
					elapsedMs: sequence.frameDurationMs
				});

				expect(secondFrame).not.toBe(firstFrame);
			}
		}
	});

	it('uses deterministic per-monster animation offsets', () => {
		expect(getMonsterAnimationOffset('monster-a')).toBe(getMonsterAnimationOffset('monster-a'));
		expect(getMonsterAnimationOffset('monster-a')).not.toBe(getMonsterAnimationOffset('monster-b'));
	});
});
