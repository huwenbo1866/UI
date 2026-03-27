import {
  MAX_ALIVE_MONSTERS,
  MONSTER_BASE_SPEED,
  MONSTER_DAMAGE,
  MONSTER_HP,
  MONSTER_RADIUS,
  MONSTER_SPAWN_INTERVAL_MS,
  MONSTER_CONTACT_DAMAGE_PER_SECOND   // ← 新增导入
} from '../config/constants';

import type { Difficulty, GameState, MonsterState } from '../core/types';
import { distance, uid } from '../core/utils';
import { applyPlayerContactDamage, applyContinuousPlayerDamage } from './player-system';  // ← 新增导入

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
    isDead: false
  };

  state.monsters = [...state.monsters, monster];
}

export function updateMonsters(state: GameState, dtSeconds: number) {
  const { player } = state;

  for (const monster of state.monsters) {
    if (monster.isDead) continue;

    const dx = player.x - monster.x;
    const dy = player.y - monster.y;
    const len = Math.hypot(dx, dy) || 1;

    monster.x += (dx / len) * monster.speed * dtSeconds;
    monster.y += (dy / len) * monster.speed * dtSeconds;

    const hitDistance = distance(monster.x, monster.y, player.x, player.y);

    // ==================== 新逻辑：怪物贴身连续扣血 ====================
    if (hitDistance <= monster.radius + player.radius + 12) {   // “较近贴在一起”时触发
      applyContinuousPlayerDamage(state, MONSTER_CONTACT_DAMAGE_PER_SECOND, dtSeconds);
    } 
    // 原有单次接触伤害仍保留（防止瞬间远离后不扣血）
    else if (hitDistance <= monster.radius + player.radius) {
      applyPlayerContactDamage(state, monster.damage);
    }
  }

  state.monsters = state.monsters.filter((monster) => !monster.isDead);
}
