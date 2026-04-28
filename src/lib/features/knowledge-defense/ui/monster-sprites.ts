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

export const MONSTER_SPRITE_SEQUENCES = {
	easy: {
		idle: {
			frames: [
				'/knowledge-defense/monsters/easy/idle-1.svg',
				'/knowledge-defense/monsters/easy/idle-2.svg'
			],
			frameDurationMs: 420
		},
		move: {
			frames: [
				'/knowledge-defense/monsters/easy/move-1.svg',
				'/knowledge-defense/monsters/easy/move-2.svg'
			],
			frameDurationMs: 150
		},
		telegraph: {
			frames: [
				'/knowledge-defense/monsters/easy/telegraph-1.svg',
				'/knowledge-defense/monsters/easy/telegraph-2.svg'
			],
			frameDurationMs: 120
		},
		hurt: {
			frames: ['/knowledge-defense/monsters/easy/hurt-1.svg'],
			frameDurationMs: 160
		}
	},
	medium: {
		idle: {
			frames: [
				'/knowledge-defense/monsters/medium/idle-1.svg',
				'/knowledge-defense/monsters/medium/idle-2.svg'
			],
			frameDurationMs: 400
		},
		move: {
			frames: [
				'/knowledge-defense/monsters/medium/move-1.svg',
				'/knowledge-defense/monsters/medium/move-2.svg'
			],
			frameDurationMs: 140
		},
		telegraph: {
			frames: [
				'/knowledge-defense/monsters/medium/telegraph-1.svg',
				'/knowledge-defense/monsters/medium/telegraph-2.svg'
			],
			frameDurationMs: 110
		},
		hurt: {
			frames: ['/knowledge-defense/monsters/medium/hurt-1.svg'],
			frameDurationMs: 160
		}
	},
	hard: {
		idle: {
			frames: [
				'/knowledge-defense/monsters/hard/idle-1.svg',
				'/knowledge-defense/monsters/hard/idle-2.svg'
			],
			frameDurationMs: 380
		},
		move: {
			frames: [
				'/knowledge-defense/monsters/hard/move-1.svg',
				'/knowledge-defense/monsters/hard/move-2.svg'
			],
			frameDurationMs: 130
		},
		telegraph: {
			frames: [
				'/knowledge-defense/monsters/hard/telegraph-1.svg',
				'/knowledge-defense/monsters/hard/telegraph-2.svg'
			],
			frameDurationMs: 100
		},
		hurt: {
			frames: ['/knowledge-defense/monsters/hard/hurt-1.svg'],
			frameDurationMs: 160
		}
	}
} as const satisfies Record<Difficulty, Record<MonsterVisualState, MonsterSpriteSequence>>;

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
