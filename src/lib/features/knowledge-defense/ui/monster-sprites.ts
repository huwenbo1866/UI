import { KD_MONSTER_SPRITE_SEQUENCES } from '../config/constants';
import type { Difficulty, MonsterState } from '../core/types';

export type MonsterVisualState = 'idle' | 'move' | 'telegraph' | 'hurt';

export interface MonsterSpriteSequence {
	frames: readonly string[];
	frameDurationMs: number;
}

export interface MonsterSpriteResolverInput {
	difficulty: Difficulty;
	visualState: MonsterVisualState;
	elapsedMs: number;
	animationOffsetMs?: number;
}

export const MONSTER_SPRITE_SEQUENCES =
	KD_MONSTER_SPRITE_SEQUENCES as Record<Difficulty, Record<MonsterVisualState, MonsterSpriteSequence>>;

export function getMonsterVisualState(
	monster: Pick<MonsterState, 'attackState' | 'hurtFlashMs' | 'moving'>
): MonsterVisualState {
	if (monster.hurtFlashMs > 0) {
		return 'hurt';
	}

	if (monster.attackState === 'telegraph') {
		return 'telegraph';
	}

	return monster.moving ? 'move' : 'idle';
}

export function getMonsterSpriteSequence(
	difficulty: Difficulty,
	visualState: MonsterVisualState
): MonsterSpriteSequence {
	return MONSTER_SPRITE_SEQUENCES[difficulty][visualState];
}

export function getMonsterAnimationOffset(monsterId: string): number {
	let hash = 0;

	for (const char of monsterId) {
		hash = (hash * 31 + char.charCodeAt(0)) % 2048;
	}

	return hash;
}

export function resolveMonsterSpriteFrame({
	difficulty,
	visualState,
	elapsedMs,
	animationOffsetMs = 0
}: MonsterSpriteResolverInput): string {
	const sequence = getMonsterSpriteSequence(difficulty, visualState);
	if (sequence.frames.length === 1) {
		return sequence.frames[0];
	}

	const normalizedElapsedMs = Math.max(0, elapsedMs + animationOffsetMs);
	const frameIndex =
		Math.floor(normalizedElapsedMs / sequence.frameDurationMs) % sequence.frames.length;

	return sequence.frames[frameIndex];
}
