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
import { gainExpForKill } from './progression-system';
import { audioManager } from './audio-manager';

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

// 随机选择怪物（无规律）
function getRandomTargetMonster(state: GameState): MonsterState | null {
  const living = state.monsters.filter((monster) => !monster.isDead);
  if (living.length === 0) return null;

  const randomIndex = Math.floor(Math.random() * living.length);
  return living[randomIndex];
}

export function updateDrones(state: GameState, dtSeconds: number, dtMs: number) {
  for (const drone of state.drones) {
    drone.cooldownMs = Math.max(0, drone.cooldownMs - dtMs);

    // ==================== 有怪物时 ====================
    if (state.monsters.some(m => !m.isDead)) {
      let target: MonsterState | null = state.monsters.find(
        (m) => m.id === drone.targetMonsterId && !m.isDead
      );

      if (!target) {
        target = getRandomTargetMonster(state);
        drone.targetMonsterId = target ? target.id : null;   // 明确处理 null
      }

      if (target) {
        const distToTarget = distance(drone.x, drone.y, target.x, target.y);

        if (distToTarget <= DRONE_ENGAGE_RANGE && drone.cooldownMs <= 0) {
          // 距离合适 → 停下攻击
          target.hp = Math.max(0, target.hp - DRONE_DAMAGE);
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
        else if (distToTarget > DRONE_ENGAGE_RANGE + 25) {
          // 距离太远才追击
          const dx = target.x - drone.x;
          const dy = target.y - drone.y;
          const len = Math.hypot(dx, dy) || 1;
          drone.x += (dx / len) * DRONE_SPEED * dtSeconds * 0.9;
          drone.y += (dy / len) * DRONE_SPEED * dtSeconds * 0.9;
        }
        continue;
      }
    }

    // ==================== 没有怪物时 → 在玩家周围巡逻 ====================
    drone.orbitAngle += dtSeconds * 1.4;
    drone.x = state.player.x + Math.cos(drone.orbitAngle) * DRONE_PATROL_RADIUS;
    drone.y = state.player.y + Math.sin(drone.orbitAngle) * DRONE_PATROL_RADIUS;
  }

  // 清理激光
  for (const laser of state.lasers) {
    laser.ttlMs -= dtMs;
  }
  state.lasers = state.lasers.filter((laser) => laser.ttlMs > 0);
  state.monsters = state.monsters.filter((monster) => !monster.isDead);
}