import {
  AUTO_ATTACK_COOLDOWN_MS,
  BASE_PROJECTILE_RADIUS,
  BASE_SCATTER_PELLET_COUNT,
  BASE_SCATTER_PELLET_DAMAGE,
  BASE_SCATTER_SPREAD_RADIANS,
  BASE_STRAIGHT_DAMAGE,
  PROJECTILE_SPEED,
  SCATTER7_PELLET_COUNT,
  SCATTER7_PELLET_DAMAGE,
  SCATTER7_SPREAD_RADIANS,
  STRAIGHT4_DAMAGE,
  STRAIGHT4_SHOT_INTERVAL_MS
} from '../config/constants';
import type { AttackPattern, AttackSequenceState, GameState, MonsterState, ProjectileState } from '../core/types';
import { uid } from '../core/utils';

export function getNearestMonster(state: GameState): MonsterState | null {
  let target: MonsterState | null = null;
  let best = Infinity;
  for (const monster of state.monsters) {
    if (monster.isDead) continue;
    const d = Math.hypot(state.player.x - monster.x, state.player.y - monster.y);
    if (d < best) {
      best = d;
      target = monster;
    }
  }
  return target;
}

function createAttackSequence(pattern: AttackPattern): AttackSequenceState {
  if (pattern === 'straight4') {
    return {
      id: uid('seq'),
      pattern,
      shotsRemaining: 4,
      shotIntervalMs: STRAIGHT4_SHOT_INTERVAL_MS,
      timeUntilNextMs: 0
    };
  }

  return {
    id: uid('seq'),
    pattern,
    shotsRemaining: 1,
    shotIntervalMs: 0,
    timeUntilNextMs: 0
  };
}

function spawnStraightProjectile(state: GameState, target: MonsterState, damage: number) {
  const dx = target.x - state.player.x;
  const dy = target.y - state.player.y;
  const len = Math.hypot(dx, dy) || 1;
  const projectile: ProjectileState = {
    id: uid('proj'),
    x: state.player.x,
    y: state.player.y,
    vx: (dx / len) * PROJECTILE_SPEED,
    vy: (dy / len) * PROJECTILE_SPEED,
    radius: BASE_PROJECTILE_RADIUS,
    damage,
    color: '#f59e0b'
  };
  state.projectiles = [...state.projectiles, projectile];
}

function spawnScatterProjectiles(
  state: GameState,
  target: MonsterState,
  pelletCount: number,
  spreadRadians: number,
  damage: number,
  color = '#60a5fa'
) {
  const baseAngle = Math.atan2(target.y - state.player.y, target.x - state.player.x);
  const projectiles: ProjectileState[] = [];
  const step = spreadRadians / Math.max(1, pelletCount - 1);
  const start = baseAngle - spreadRadians / 2;

  for (let index = 0; index < pelletCount; index += 1) {
    const angle = start + step * index;
    projectiles.push({
      id: uid('proj'),
      x: state.player.x,
      y: state.player.y,
      vx: Math.cos(angle) * PROJECTILE_SPEED,
      vy: Math.sin(angle) * PROJECTILE_SPEED,
      radius: BASE_PROJECTILE_RADIUS,
      damage,
      color
    });
  }

  state.projectiles = [...state.projectiles, ...projectiles];
}

function resolvePatternForNextCycle(state: GameState): AttackPattern {
  if (state.buffs.queuedWeaponBuff && state.buffs.queuedWeaponBuffUses > 0) {
    const pattern = state.buffs.queuedWeaponBuff;
    state.buffs.queuedWeaponBuffUses -= 1;
    if (state.buffs.queuedWeaponBuffUses <= 0) {
      state.buffs.queuedWeaponBuff = null;
      state.buffs.queuedWeaponBuffUses = 0;
    }
    return pattern;
  }

  return state.settings.attackPreference === 'straight' ? 'single' : 'scatter';
}

export function tickAutoAttack(state: GameState, dtMs: number) {
  state.runtime.attackCooldownMs -= dtMs;
  if (state.runtime.attackCooldownMs > 0) return;

  state.runtime.attackCooldownMs += AUTO_ATTACK_COOLDOWN_MS;
  if (!getNearestMonster(state)) return;

  const sequence = createAttackSequence(resolvePatternForNextCycle(state));
  state.attackSequences = [...state.attackSequences, sequence];
}

export function tickAttackSequences(state: GameState, dtMs: number) {
  const remaining: AttackSequenceState[] = [];

  for (const sequence of state.attackSequences) {
    sequence.timeUntilNextMs -= dtMs;
    if (sequence.timeUntilNextMs > 0) {
      remaining.push(sequence);
      continue;
    }

    const target = getNearestMonster(state);
    if (!target) {
      sequence.shotsRemaining = 0;
    } else if (sequence.pattern === 'single') {
      spawnStraightProjectile(state, target, BASE_STRAIGHT_DAMAGE);
      sequence.shotsRemaining -= 1;
    } else if (sequence.pattern === 'scatter') {
      spawnScatterProjectiles(state, target, BASE_SCATTER_PELLET_COUNT, BASE_SCATTER_SPREAD_RADIANS, BASE_SCATTER_PELLET_DAMAGE, '#38bdf8');
      sequence.shotsRemaining -= 1;
    } else if (sequence.pattern === 'straight4') {
      const shotIndex = Math.max(0, 4 - sequence.shotsRemaining);
      spawnStraightProjectile(
        state,
        target,
        STRAIGHT4_DAMAGE[shotIndex] ?? STRAIGHT4_DAMAGE.at(-1) ?? BASE_STRAIGHT_DAMAGE
      );
      sequence.shotsRemaining -= 1;
      if (sequence.shotsRemaining > 0) {
        sequence.timeUntilNextMs = sequence.shotIntervalMs;
      }
    } else if (sequence.pattern === 'scatter7') {
      spawnScatterProjectiles(state, target, SCATTER7_PELLET_COUNT, SCATTER7_SPREAD_RADIANS, SCATTER7_PELLET_DAMAGE, '#3b82f6');
      sequence.shotsRemaining -= 1;
    }

    if (sequence.shotsRemaining > 0) {
      remaining.push(sequence);
    }
  }

  state.attackSequences = remaining;
}
