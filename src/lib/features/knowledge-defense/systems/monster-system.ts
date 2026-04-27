import {
	MAX_ALIVE_MONSTERS,
	MONSTER_ATTACK_INTERVAL_MS,
	MONSTER_ATTACK_WINDUP_MS,
	MONSTER_BASE_SPEED,
	MONSTER_DAMAGE,
	MONSTER_HP,
	MONSTER_RADIUS,
	MONSTER_SEPARATION_FORCE,
	MONSTER_SEPARATION_RADIUS,
	MONSTER_SPAWN_INTERVAL_MS
	,
	MONSTER_MIN_GAP,
	MONSTER_PLAYER_STANDOFF
} from '../config/constants';
import type { Difficulty, GameState, MonsterState } from '../core/types';
import { distance, uid } from '../core/utils';
import { applyPlayerContactDamage } from './player-system';
import { addVectors, buildSeparationVector, moveToward, normalize, resolveMinimumSpacing, scaleVector } from './spatial-utils';

function pickDifficulty(level: number): Difficulty {
  if (level >= 6 && Math.random() > 0.55) return 'hard';
  if (level >= 3 && Math.random() > 0.45) return 'medium';
  return 'easy';
}

export function maybeSpawnMonster(state: GameState, dtMs: number) {
  state.runtime.spawnCooldownMs -= dtMs;
  if (state.runtime.spawnCooldownMs > 0) return;

  state.runtime.spawnCooldownMs = MONSTER_SPAWN_INTERVAL_MS;
  if (state.monsters.length >= MAX_ALIVE_MONSTERS) return;

  const difficulty = pickDifficulty(state.progress.level);
  const edge = Math.floor(Math.random() * 4);
  let x = 0;
  let y = 0;

  if (edge === 0) {
    x = Math.random() * state.width;
    y = -20;
  } else if (edge === 1) {
    x = state.width + 20;
    y = Math.random() * state.height;
  } else if (edge === 2) {
    x = Math.random() * state.width;
    y = state.height + 20;
  } else {
    x = -20;
    y = Math.random() * state.height;
  }

  const monster: MonsterState = {
    id: uid('monster'),
    difficulty,
    x,
    y,
    hp: MONSTER_HP[difficulty],
    maxHp: MONSTER_HP[difficulty],
    radius: MONSTER_RADIUS[difficulty],
    speed: MONSTER_BASE_SPEED[difficulty] + state.progress.level * 1.5,
    damage: MONSTER_DAMAGE[difficulty],
		isDead: false,
		hurtFlashMs: 0,
		attackCooldownMs: 280,
		attackWindupMs: 0,
		moveDirX: 0,
		moveDirY: 1
	};

  state.monsters = [...state.monsters, monster];
}

export function updateMonsters(state: GameState, dtSeconds: number, dtMs: number) {
	const { player } = state;
	const alive = state.monsters.filter((monster) => !monster.isDead);

	for (const monster of alive) {
		if (monster.isDead) continue;

    monster.hurtFlashMs = Math.max(0, monster.hurtFlashMs - dtMs);
    monster.attackCooldownMs = Math.max(0, monster.attackCooldownMs - dtMs);

		const seek = normalize(player.x - monster.x, player.y - monster.y);
		const separation = scaleVector(
			buildSeparationVector(
				monster.x,
				monster.y,
				alive.filter((other) => other.id !== monster.id),
				MONSTER_SEPARATION_RADIUS
			),
			MONSTER_SEPARATION_FORCE
		);

		const standOffDistance = player.radius + monster.radius + MONSTER_PLAYER_STANDOFF;
		const distToPlayer = distance(monster.x, monster.y, player.x, player.y);
		const standOffPush =
			distToPlayer < standOffDistance
				? scaleVector(normalize(monster.x - player.x, monster.y - player.y), (standOffDistance - distToPlayer) / standOffDistance)
				: { x: 0, y: 0 };

		const desired = addVectors(seek, separation, standOffPush);
		const desiredDir = normalize(desired.x, desired.y);
		const next = moveToward(
			monster.x,
			monster.y,
			monster.x + desiredDir.x * 60,
			monster.y + desiredDir.y * 60,
			monster.speed,
			dtSeconds
		);

		monster.x = next.x;
		monster.y = next.y;
		monster.moveDirX = next.moveDir.x;
		monster.moveDirY = next.moveDir.y;

    const hitDistance = distance(monster.x, monster.y, player.x, player.y);
    const inMeleeRange = hitDistance <= monster.radius + player.radius + 6;

    if (!inMeleeRange) {
      monster.attackWindupMs = 0;
      continue;
    }

    if (monster.attackCooldownMs > 0) {
      continue;
    }

    if (monster.attackWindupMs <= 0) {
      monster.attackWindupMs = MONSTER_ATTACK_WINDUP_MS;
      continue;
    }

    monster.attackWindupMs = Math.max(0, monster.attackWindupMs - dtMs);
    if (monster.attackWindupMs <= 0) {
      applyPlayerContactDamage(state, monster.damage);
      monster.attackCooldownMs = MONSTER_ATTACK_INTERVAL_MS;
    }
	}

	resolveMinimumSpacing(alive, MONSTER_MIN_GAP, 2);

  state.monsters = state.monsters.filter((monster) => !monster.isDead);
}
