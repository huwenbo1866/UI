import {
	DRONE_COOLDOWN_MS,
	DRONE_DAMAGE,
	DRONE_ENGAGE_RANGE,
	DRONE_ARRIVE_SLOW_RADIUS,
	DRONE_FORMATION_ARC,
	DRONE_FORMATION_JITTER,
	DRONE_MAX_ACTIVE,
	DRONE_MIN_GAP,
	DRONE_ORBIT_DISTANCE,
	DRONE_PATROL_RADIUS,
	MAX_ACTIVE_LASERS,
	DRONE_SEPARATION_FORCE,
	DRONE_SEPARATION_RADIUS,
	DRONE_SPEED,
	DRONE_TARGET_LOAD_PENALTY
} from '../config/constants';
import type { DroneState, GameState, MonsterState } from '../core/types';
import { distance, uid } from '../core/utils';
import { audioManager } from './audio-manager';
import { finalizeMonsterDeath, removeDefeatedMonsters } from './battlefield-drop-system';
import { markMonsterHit } from './combat-feedback-system';
import {
	addVectors,
	moveToward,
	normalize,
	resolveMinimumSpacing,
	scaleVector
} from './spatial-utils';

// 追击/停火的迟滞区间，避免“卡边界反复追停”
const DRONE_ENGAGE_BUFFER = 24;
// 无人机希望保持的输出距离（进入射程后不过分贴脸）
const DRONE_PREFERRED_RANGE = DRONE_ENGAGE_RANGE * 0.68;
// 过近时后撤阈值
const DRONE_MIN_COMBAT_RANGE = DRONE_ENGAGE_RANGE * 0.42;
// 防止频繁在多个怪之间抖动，当前目标只要还“够近”就继续打
const DRONE_TARGET_STICKINESS_BONUS = 40;

export function addDrone(state: GameState) {
	if (state.drones.length >= DRONE_MAX_ACTIVE) {
		return false;
	}

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

	state.drones.push(drone);
	return true;
}

function pickStableTarget(
	aliveMonsters: MonsterState[],
	drone: DroneState,
	targetLoadMap: Map<string, number>
): MonsterState | null {
	if (aliveMonsters.length === 0) return null;

	let best: MonsterState | null = null;
	let bestScore = Infinity;

	for (const monster of aliveMonsters) {
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

function buildDroneSeparation(drone: DroneState, drones: DroneState[], selfIndex: number) {
	let offsetX = 0;
	let offsetY = 0;

	for (let index = 0; index < drones.length; index += 1) {
		if (index === selfIndex) continue;

		const other = drones[index];
		const dx = drone.x - other.x;
		const dy = drone.y - other.y;
		const dist = Math.hypot(dx, dy);

		if (dist <= 0.001 || dist >= DRONE_SEPARATION_RADIUS) continue;

		const scale = (DRONE_SEPARATION_RADIUS - dist) / DRONE_SEPARATION_RADIUS;
		offsetX += (dx / dist) * scale;
		offsetY += (dy / dist) * scale;
	}

	return { x: offsetX, y: offsetY };
}

function moveTowardsPoint(
	drone: DroneState,
	targetX: number,
	targetY: number,
	dtSeconds: number,
	speedScale = 1,
	slowRadius = 0
) {
	const next = moveToward(
		drone.x,
		drone.y,
		targetX,
		targetY,
		DRONE_SPEED * speedScale,
		dtSeconds,
		slowRadius
	);
	drone.x = next.x;
	drone.y = next.y;
	drone.moveDirX = next.moveDir.x;
	drone.moveDirY = next.moveDir.y;
}

function executeAttack(state: GameState, drone: DroneState, target: MonsterState) {
	target.hp = Math.max(0, target.hp - DRONE_DAMAGE);
	markMonsterHit(state, target, DRONE_DAMAGE);
	audioManager.playHit();

	state.lasers.push({
		id: uid('laser'),
		from: { x: drone.x, y: drone.y },
		to: { x: target.x, y: target.y },
		ttlMs: 140
	});
	if (state.lasers.length > MAX_ACTIVE_LASERS) {
		state.lasers.splice(0, state.lasers.length - MAX_ACTIVE_LASERS);
	}

	drone.cooldownMs = DRONE_COOLDOWN_MS;

	if (target.hp <= 0) {
		finalizeMonsterDeath(state, target);
		drone.targetMonsterId = null;
		audioManager.playDeath();
		return true;
	}

	return false;
}

function getFormationPoint(
	state: GameState,
	target: MonsterState,
	slotIndex: number,
	totalSlots: number
) {
	const baseAngle = Math.atan2(state.player.y - target.y, state.player.x - target.x);
	const spread = Math.min(DRONE_FORMATION_ARC, Math.max(0, (totalSlots - 1) * 0.38));
	const step = totalSlots > 1 ? spread / (totalSlots - 1) : 0;
	const slotAngle = baseAngle - spread / 2 + step * slotIndex;
	const radiusOffset = (slotIndex % 2 === 0 ? 1 : -1) * DRONE_FORMATION_JITTER;
	const formationRadius = DRONE_PREFERRED_RANGE + radiusOffset;
	return {
		x: target.x + Math.cos(slotAngle) * formationRadius,
		y: target.y + Math.sin(slotAngle) * formationRadius
	};
}

function combatMove(
	drone: DroneState,
	droneIndex: number,
	drones: DroneState[],
	state: GameState,
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
		buildDroneSeparation(drone, drones, droneIndex),
		DRONE_SEPARATION_FORCE
	);

	// 太远：冲向目标，但不是贴身，而是冲到“理想输出圈”
	if (dist > DRONE_ENGAGE_RANGE + DRONE_ENGAGE_BUFFER) {
		const desired = addVectors(
			{ x: formationPoint.x - drone.x, y: formationPoint.y - drone.y },
			separation
		);
		moveTowardsPoint(
			drone,
			drone.x + desired.x,
			drone.y + desired.y,
			dtSeconds,
			1,
			DRONE_ARRIVE_SLOW_RADIUS
		);
		return;
	}

	// 太近：小步后撤，避免跟怪物同速并线导致抖动
	if (dist < DRONE_MIN_COMBAT_RANGE) {
		const desired = addVectors({ x: -nx * 30, y: -ny * 30 }, separation);
		moveTowardsPoint(
			drone,
			drone.x + desired.x,
			drone.y + desired.y,
			dtSeconds,
			0.6,
			DRONE_ARRIVE_SLOW_RADIUS
		);
		return;
	}

	// 在可打范围内：仅做轻微微调，尽量保持火力覆盖
	const desired = addVectors(
		{ x: formationPoint.x - drone.x, y: formationPoint.y - drone.y },
		separation,
		scaleVector(normalize(-nx, -ny), 0.08)
	);
	moveTowardsPoint(
		drone,
		drone.x + desired.x,
		drone.y + desired.y,
		dtSeconds,
		0.4,
		DRONE_ARRIVE_SLOW_RADIUS
	);
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
	const aliveMonsters = state.monsters.filter((monster) => !monster.isDead);
	const aliveMonsterById = new Map(aliveMonsters.map((monster) => [monster.id, monster]));
	const targetLoadMap = new Map<string, number>();
	const groupedAssignments = new Map<string, number>();
	const droneSlotById = new Map<string, number>();
	let defeatedMonster = false;

	for (const drone of state.drones) {
		const target = pickStableTarget(aliveMonsters, drone, targetLoadMap);
		if (!target) {
			drone.targetMonsterId = null;
			continue;
		}

		drone.targetMonsterId = target.id;
		targetLoadMap.set(target.id, (targetLoadMap.get(target.id) ?? 0) + 1);
		const slotIndex = groupedAssignments.get(target.id) ?? 0;
		droneSlotById.set(drone.id, slotIndex);
		groupedAssignments.set(target.id, slotIndex + 1);
	}

	for (let droneIndex = 0; droneIndex < state.drones.length; droneIndex += 1) {
		const drone = state.drones[droneIndex];
		drone.cooldownMs = Math.max(0, drone.cooldownMs - dtMs);

		const target = (drone.targetMonsterId && aliveMonsterById.get(drone.targetMonsterId)) ?? null;
		if (!target || target.isDead) {
			drone.targetMonsterId = null;
			patrolAroundPlayer(state, drone, dtSeconds);
			continue;
		}
		const slotIndex = droneSlotById.get(drone.id) ?? 0;
		const totalSlots = groupedAssignments.get(target.id) ?? 1;

		const distToTarget = distance(drone.x, drone.y, target.x, target.y);
		const canAttack = distToTarget <= DRONE_ENGAGE_RANGE + DRONE_ENGAGE_BUFFER;

		if (canAttack && drone.cooldownMs <= 0) {
			defeatedMonster = executeAttack(state, drone, target) || defeatedMonster;
		}

		combatMove(drone, droneIndex, state.drones, state, target, dtSeconds, slotIndex, totalSlots);
	}

	resolveMinimumSpacing(state.drones, DRONE_MIN_GAP, 2);

	const activeLasers = [];
	for (const laser of state.lasers) {
		laser.ttlMs -= dtMs;
		if (laser.ttlMs > 0) {
			activeLasers.push(laser);
		}
	}

	state.lasers = activeLasers;
	if (defeatedMonster) {
		removeDefeatedMonsters(state);
	}
}
