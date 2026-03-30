import {
  DRONE_COOLDOWN_MS,
  DRONE_DAMAGE,
  DRONE_ENGAGE_RANGE,
  DRONE_ORBIT_DISTANCE,
  DRONE_PATROL_RADIUS,
  DRONE_SPEED
} from '../config/constants';
import type { DroneState, GameState, MonsterState } from '../core/types';
import { distance, uid } from '../core/utils';
import { audioManager } from './audio-manager';
import { markMonsterHit } from './combat-feedback-system';
import { gainExpForKill } from './progression-system';

// 追击/停火的迟滞区间，避免“卡边界反复追停”
const DRONE_ENGAGE_BUFFER = 24;
// 无人机希望保持的输出距离（进入射程后不过分贴脸）
const DRONE_PREFERRED_RANGE = DRONE_ENGAGE_RANGE * 0.68;
// 过近时后撤阈值
const DRONE_MIN_COMBAT_RANGE = DRONE_ENGAGE_RANGE * 0.42;
// 防止频繁在多个怪之间抖动，当前目标只要还“够近”就继续打
const DRONE_TARGET_STICKINESS_BONUS = 40;

export function addDrone(state: GameState) {
  const index = state.drones.length;
  const angle = (Math.PI * 2 * index) / Math.max(1, index + 1);

  const drone: DroneState = {
    id: uid('drone'),
    x: state.player.x + Math.cos(angle) * DRONE_ORBIT_DISTANCE,
    y: state.player.y + Math.sin(angle) * DRONE_ORBIT_DISTANCE,
    orbitAngle: angle,
    cooldownMs: 0,
    targetMonsterId: null
  };

  state.drones = [...state.drones, drone];
}

function pickStableTarget(state: GameState, drone: DroneState): MonsterState | null {
  const alive = state.monsters.filter((monster) => !monster.isDead);
  if (alive.length === 0) return null;

  let best: MonsterState | null = null;
  let bestScore = Infinity;

  for (const monster of alive) {
    const d = distance(drone.x, drone.y, monster.x, monster.y);
    const stickyBias = monster.id === drone.targetMonsterId ? -DRONE_TARGET_STICKINESS_BONUS : 0;
    const score = d + stickyBias;
    if (score < bestScore) {
      bestScore = score;
      best = monster;
    }
  }

  return best;
}

function moveTowardsPoint(drone: DroneState, targetX: number, targetY: number, dtSeconds: number, speedScale = 1) {
  const dx = targetX - drone.x;
  const dy = targetY - drone.y;
  const len = Math.hypot(dx, dy) || 1;
  drone.x += (dx / len) * DRONE_SPEED * speedScale * dtSeconds;
  drone.y += (dy / len) * DRONE_SPEED * speedScale * dtSeconds;
}

function executeAttack(state: GameState, drone: DroneState, target: MonsterState) {
  target.hp = Math.max(0, target.hp - DRONE_DAMAGE);
  markMonsterHit(state, target, DRONE_DAMAGE);
  audioManager.playHit();

  state.lasers = [
    ...state.lasers,
    {
      id: uid('laser'),
      from: { x: drone.x, y: drone.y },
      to: { x: target.x, y: target.y },
      ttlMs: 140
    }
  ];

  drone.cooldownMs = DRONE_COOLDOWN_MS;

  if (target.hp <= 0) {
    target.isDead = true;
    state.battle.kills += 1;
    gainExpForKill(state);
    drone.targetMonsterId = null;
    audioManager.playDeath();
  }
}

function combatMove(drone: DroneState, target: MonsterState, dtSeconds: number) {
  const dx = target.x - drone.x;
  const dy = target.y - drone.y;
  const dist = Math.hypot(dx, dy) || 1;
  const nx = dx / dist;
  const ny = dy / dist;

  // 太远：冲向目标，但不是贴身，而是冲到“理想输出圈”
  if (dist > DRONE_ENGAGE_RANGE + DRONE_ENGAGE_BUFFER) {
    const desiredX = target.x - nx * DRONE_PREFERRED_RANGE;
    const desiredY = target.y - ny * DRONE_PREFERRED_RANGE;
    moveTowardsPoint(drone, desiredX, desiredY, dtSeconds, 1);
    return;
  }

  // 太近：小步后撤，避免跟怪物同速并线导致抖动
  if (dist < DRONE_MIN_COMBAT_RANGE) {
    moveTowardsPoint(drone, drone.x - nx * 30, drone.y - ny * 30, dtSeconds, 0.6);
    return;
  }

  // 在可打范围内：仅做轻微微调，尽量保持火力覆盖
  const desiredX = target.x - nx * DRONE_PREFERRED_RANGE;
  const desiredY = target.y - ny * DRONE_PREFERRED_RANGE;
  moveTowardsPoint(drone, desiredX, desiredY, dtSeconds, 0.28);
}

function patrolAroundPlayer(state: GameState, drone: DroneState, dtSeconds: number) {
  drone.orbitAngle += dtSeconds * 1.4;
  drone.x = state.player.x + Math.cos(drone.orbitAngle) * DRONE_PATROL_RADIUS;
  drone.y = state.player.y + Math.sin(drone.orbitAngle) * DRONE_PATROL_RADIUS;
}

export function updateDrones(state: GameState, dtSeconds: number, dtMs: number) {
  for (const drone of state.drones) {
    drone.cooldownMs = Math.max(0, drone.cooldownMs - dtMs);

    const target = pickStableTarget(state, drone);
    if (!target) {
      drone.targetMonsterId = null;
      patrolAroundPlayer(state, drone, dtSeconds);
      continue;
    }

    drone.targetMonsterId = target.id;

    const distToTarget = distance(drone.x, drone.y, target.x, target.y);
    const canAttack = distToTarget <= DRONE_ENGAGE_RANGE + DRONE_ENGAGE_BUFFER;

    if (canAttack && drone.cooldownMs <= 0) {
      executeAttack(state, drone, target);
    }

    combatMove(drone, target, dtSeconds);
  }

  for (const laser of state.lasers) {
    laser.ttlMs -= dtMs;
  }

  state.lasers = state.lasers.filter((laser) => laser.ttlMs > 0);
  state.monsters = state.monsters.filter((monster) => !monster.isDead);
}