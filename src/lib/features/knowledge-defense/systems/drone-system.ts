import {
	DRONE_COOLDOWN_MS,
	DRONE_DAMAGE,
	DRONE_ENGAGE_RANGE,
	DRONE_ARRIVE_SLOW_RADIUS,
	DRONE_FORMATION_ARC,
	DRONE_FORMATION_JITTER,
	DRONE_MIN_GAP,
	DRONE_ORBIT_DISTANCE,
	DRONE_PATROL_RADIUS,
	DRONE_SEPARATION_FORCE,
	DRONE_SEPARATION_RADIUS,
	DRONE_SPEED
	,
	DRONE_TARGET_LOAD_PENALTY
} from '../config/constants';
import type { DroneState, GameState, MonsterState } from '../core/types';
import { distance, uid } from '../core/utils';
import { audioManager } from './audio-manager';
import { markMonsterHit } from './combat-feedback-system';
import { gainExpForKill } from './progression-system';
import { addVectors, buildSeparationVector, moveToward, normalize, resolveMinimumSpacing, scaleVector } from './spatial-utils';

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
		targetMonsterId: null,
		moveDirX: 0,
		moveDirY: -1,
		formationSlot: index
	};

  state.drones = [...state.drones, drone];
}

function pickStableTarget(
	state: GameState,
	drone: DroneState,
	targetLoadMap: Map<string, number>
): MonsterState | null {
	const alive = state.monsters.filter((monster) => !monster.isDead);
	if (alive.length === 0) return null;

  let best: MonsterState | null = null;
  let bestScore = Infinity;

	for (const monster of alive) {
		const d = distance(drone.x, drone.y, monster.x, monster.y);
		const stickyBias = monster.id === drone.targetMonsterId ? -DRONE_TARGET_STICKINESS_BONUS : 0;
		const crowdPenalty = (targetLoadMap.get(monster.id) ?? 0) * DRONE_TARGET_LOAD_PENALTY;
		const score = d + stickyBias + crowdPenalty;
		if (score < bestScore) {
			bestScore = score;
			best = monster;
    }
  }

  return best;
}

function moveTowardsPoint(drone: DroneState, targetX: number, targetY: number, dtSeconds: number, speedScale = 1, slowRadius = 0) {
	const next = moveToward(drone.x, drone.y, targetX, targetY, DRONE_SPEED * speedScale, dtSeconds, slowRadius);
	drone.x = next.x;
	drone.y = next.y;
	drone.moveDirX = next.moveDir.x;
	drone.moveDirY = next.moveDir.y;
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

function getFormationPoint(state: GameState, target: MonsterState, slotIndex: number, totalSlots: number) {
	const baseAngle = Math.atan2(state.player.y - target.y, state.player.x - target.x);
	const spread = Math.min(DRONE_FORMATION_ARC, Math.max(0, (totalSlots - 1) * 0.38));
	const step = totalSlots > 1 ? spread / (totalSlots - 1) : 0;
	const slotAngle = baseAngle - spread / 2 + step * slotIndex;
	const radiusOffset = ((slotIndex % 2 === 0 ? 1 : -1) * DRONE_FORMATION_JITTER);
	const formationRadius = DRONE_PREFERRED_RANGE + radiusOffset;
	return {
		x: target.x + Math.cos(slotAngle) * formationRadius,
		y: target.y + Math.sin(slotAngle) * formationRadius
	};
}

function combatMove(
	state: GameState,
	drone: DroneState,
	target: MonsterState,
	dtSeconds: number,
	slotIndex: number,
	totalSlots: number
) {
	const dx = target.x - drone.x;
	const dy = target.y - drone.y;
	const dist = Math.hypot(dx, dy) || 1;
	const nx = dx / dist;
	const ny = dy / dist;
	const formationPoint = getFormationPoint(state, target, slotIndex, totalSlots);
	const separation = scaleVector(
		buildSeparationVector(
			drone.x,
			drone.y,
			state.drones.filter((other) => other.id !== drone.id),
			DRONE_SEPARATION_RADIUS
		),
		DRONE_SEPARATION_FORCE
	);

	// 太远：冲向目标，但不是贴身，而是冲到“理想输出圈”
	if (dist > DRONE_ENGAGE_RANGE + DRONE_ENGAGE_BUFFER) {
		const desired = addVectors(
			{ x: formationPoint.x - drone.x, y: formationPoint.y - drone.y },
			separation
		);
		moveTowardsPoint(drone, drone.x + desired.x, drone.y + desired.y, dtSeconds, 1, DRONE_ARRIVE_SLOW_RADIUS);
		return;
	}

  // 太近：小步后撤，避免跟怪物同速并线导致抖动
	if (dist < DRONE_MIN_COMBAT_RANGE) {
		const desired = addVectors({ x: -nx * 30, y: -ny * 30 }, separation);
		moveTowardsPoint(drone, drone.x + desired.x, drone.y + desired.y, dtSeconds, 0.6, DRONE_ARRIVE_SLOW_RADIUS);
		return;
	}

	// 在可打范围内：仅做轻微微调，尽量保持火力覆盖
	const desired = addVectors(
		{ x: formationPoint.x - drone.x, y: formationPoint.y - drone.y },
		separation,
		scaleVector(normalize(-nx, -ny), 0.08)
	);
	moveTowardsPoint(drone, drone.x + desired.x, drone.y + desired.y, dtSeconds, 0.4, DRONE_ARRIVE_SLOW_RADIUS);
}

function patrolAroundPlayer(state: GameState, drone: DroneState, dtSeconds: number) {
	drone.orbitAngle += dtSeconds * 1.4;
	const slotAngle = drone.orbitAngle + drone.formationSlot * 0.78;
	const radius = DRONE_PATROL_RADIUS + (drone.formationSlot % 2 === 0 ? 10 : -10);
	moveTowardsPoint(
		drone,
		state.player.x + Math.cos(slotAngle) * radius,
		state.player.y + Math.sin(slotAngle) * radius,
		dtSeconds,
		0.8,
		DRONE_ARRIVE_SLOW_RADIUS
	);
}

export function updateDrones(state: GameState, dtSeconds: number, dtMs: number) {
	const targetLoadMap = new Map<string, number>();
	const groupedAssignments = new Map<string, DroneState[]>();

	for (const drone of state.drones) {
		const target = pickStableTarget(state, drone, targetLoadMap);
		if (!target) {
			drone.targetMonsterId = null;
			continue;
		}

		drone.targetMonsterId = target.id;
		targetLoadMap.set(target.id, (targetLoadMap.get(target.id) ?? 0) + 1);
		const list = groupedAssignments.get(target.id) ?? [];
		list.push(drone);
		groupedAssignments.set(target.id, list);
	}

	for (const drone of state.drones) {
		drone.cooldownMs = Math.max(0, drone.cooldownMs - dtMs);

		const target = state.monsters.find((monster) => monster.id === drone.targetMonsterId && !monster.isDead) ?? null;
		if (!target) {
			drone.targetMonsterId = null;
			patrolAroundPlayer(state, drone, dtSeconds);
			continue;
		}
		const group = groupedAssignments.get(target.id) ?? [drone];
		const slotIndex = [...group].sort((a, b) => a.formationSlot - b.formationSlot).findIndex((item) => item.id === drone.id);

		const distToTarget = distance(drone.x, drone.y, target.x, target.y);
		const canAttack = distToTarget <= DRONE_ENGAGE_RANGE + DRONE_ENGAGE_BUFFER;

		if (canAttack && drone.cooldownMs <= 0) {
			executeAttack(state, drone, target);
		}

		combatMove(state, drone, target, dtSeconds, Math.max(0, slotIndex), group.length);
	}

	resolveMinimumSpacing(state.drones, DRONE_MIN_GAP, 2);

  for (const laser of state.lasers) {
    laser.ttlMs -= dtMs;
  }

  state.lasers = state.lasers.filter((laser) => laser.ttlMs > 0);
  state.monsters = state.monsters.filter((monster) => !monster.isDead);
}
