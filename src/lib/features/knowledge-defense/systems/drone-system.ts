import type { GameState, DroneState, MonsterState } from '../core/types';
import { DRONE_SPEED, DRONE_COOLDOWN_MS, DRONE_DAMAGE, DRONE_ENGAGE_RANGE, DRONE_ORBIT_DISTANCE, DRONE_FORMATION_ARC, DRONE_FORMATION_JITTER, DRONE_ARRIVE_SLOW_RADIUS, DRONE_MIN_GAP, DRONE_SEPARATION_RADIUS, DRONE_SEPARATION_FORCE, DRONE_MAX_ACTIVE } from '../config/constants';
import { distance, uid } from '../core/utils';
import { finalizeMonsterDeath, removeDefeatedMonsters } from './battlefield-drop-system';
import { markMonsterHit } from './combat-feedback-system';
import { audioManager } from './audio-manager';

export function updateDrones(state: GameState, dtSeconds: number) {
	const dtMs = dtSeconds * 1000;
	let needsSeparation = false;

	for (const drone of state.drones) {
		drone.attackCooldownMs -= dtMs;
		if (drone.attackCooldownMs < 0) drone.attackCooldownMs = 0;

	let target: MonsterState | null = null;
		if (drone.targetMonsterId) {
			target = state.monsters.find(m => m.id === drone.targetMonsterId && !m.isDead) ?? null;
		}
		if (!target) {
			target = findNearestMonster(state, drone);
			drone.targetMonsterId = target?.id ?? null;
		}

	const baseAngle = drone.angle;
		const targetX = state.player.x + Math.cos(baseAngle) * drone.orbitingDistance;
		const targetY = state.player.y + Math.sin(baseAngle) * drone.orbitingDistance;

			if (target && distance(drone.x, drone.y, target.x, target.y) <= DRONE_ENGAGE_RANGE) {
			const angleToTarget = Math.atan2(target.y - drone.y, target.x - drone.x);
			const desiredX = target.x - Math.cos(angleToTarget) * 40;
			const desiredY = target.y - Math.sin(angleToTarget) * 40;
			drone.x += (desiredX - drone.x) * 0.08;
			drone.y += (desiredY - drone.y) * 0.08;

			if (drone.attackCooldownMs <= 0 && !target.isDead) {
				attackWithDrone(state, drone, target);
			}
		} else {
			const arriveSlow = distance(drone.x, drone.y, targetX, targetY) < DRONE_ARRIVE_SLOW_RADIUS;
			const speed = arriveSlow ? DRONE_SPEED * 0.4 : DRONE_SPEED;
			const dx = targetX - drone.x;
			const dy = targetY - drone.y;
			const len = Math.hypot(dx, dy) || 1;
			drone.x += (dx / len) * speed * dtSeconds;
			drone.y += (dy / len) * speed * dtSeconds;
		}

			const speedMult = drone.level >= 3 ? 1.4 : drone.level >= 2 ? 1.25 : drone.level >= 1 ? 1.12 : 1;
		drone.angle += (0.6 * speedMult) * dtSeconds;
		drone.angle %= Math.PI * 2;

		for (const other of state.drones) {
			if (other.id === drone.id) continue;
			const d = distance(drone.x, drone.y, other.x, other.y);
			if (d < DRONE_SEPARATION_RADIUS) {
				needsSeparation = true;
				const force = DRONE_SEPARATION_FORCE * (1 - d / DRONE_SEPARATION_RADIUS);
				const dx = drone.x - other.x;
				const dy = drone.y - other.y;
				const len = Math.hypot(dx, dy) || 1;
				drone.x += (dx / len) * force;
				drone.y += (dy / len) * force;
			}
		}
	}

	if (state.drones.length > DRONE_MAX_ACTIVE) {
		state.drones = state.drones.slice(0, DRONE_MAX_ACTIVE);
	}
}

function findNearestMonster(state: GameState, drone: DroneState): MonsterState | null {
	let best: MonsterState | null = null;
	let bestDist = Infinity;
	for (const m of state.monsters) {
		if (m.isDead) continue;
		const d = distance(drone.x, drone.y, m.x, m.y);
		if (d < bestDist) {
			bestDist = d;
			best = m;
		}
	}
	return best;
}

function attackWithDrone(state: GameState, drone: DroneState, target: MonsterState) {
	const baseDamage = DRONE_DAMAGE;
	const levelMult = drone.level >= 3 ? 2.2 : drone.level >= 2 ? 1.6 : drone.level >= 1 ? 1.25 : 1;
	const damage = Math.round(baseDamage * levelMult);

	target.hp = Math.max(0, target.hp - damage);
	markMonsterHit(state, target, damage);
	audioManager.playHit();
	if (target.hp <= 0) {
		drone.targetMonsterId = null;
		finalizeMonsterDeath(state, target);
		removeDefeatedMonsters(state);
		audioManager.playDeath();
	}

	drone.attackCooldownMs = DRONE_COOLDOWN_MS / (drone.level >= 2 ? 1.3 : 1);
}

export function removeDeadMonsterDrones(state: GameState, monsterId: string) {
	for (const drone of state.drones) {
		if (drone.targetMonsterId === monsterId) {
			drone.targetMonsterId = null;
		}
	}
}
