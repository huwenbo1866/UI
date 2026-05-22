import {
	MAX_ALIVE_MONSTERS,
	MONSTER_ATTACK_INTERVAL_MS,
	MONSTER_ATTACK_WINDUP_MS,
	MONSTER_BASE_SPEED,
	MONSTER_DAMAGE,
	MONSTER_DASH_BURST_MS,
	MONSTER_DASH_COOLDOWN_MS,
	MONSTER_DASH_RECOVERY_MS,
	MONSTER_DASH_SPEED,
	MONSTER_DASH_TELEGRAPH_MS,
	MONSTER_DASH_TRIGGER_RANGE,
	MONSTER_HP,
	MONSTER_MIN_GAP,
	MONSTER_PLAYER_STANDOFF,
	MONSTER_RADIUS,
	MONSTER_SEPARATION_FORCE,
	MONSTER_SEPARATION_RADIUS,
	MONSTER_SPAWN_INTERVAL_MS,
	MONSTER_THROW_COOLDOWN_MS,
	MONSTER_THROW_PROJECTILE_COLOR,
	MONSTER_THROW_PROJECTILE_RADIUS,
	MONSTER_THROW_PROJECTILE_SPEED,
	MONSTER_THROW_PROJECTILE_TTL_MS,
	MONSTER_THROW_TELEGRAPH_MS,
	MONSTER_THROW_TRIGGER_RANGE,
	KD_MONSTER_TUNING
} from '../config/constants';
import type {
	Difficulty,
	GameState,
	MonsterSkillKind,
	MonsterSkillRuntimeState,
	MonsterState,
	ProjectileState
} from '../core/types';
import { clamp, distance, uid } from '../core/utils';
import { finalizeMonsterDeath, removeDefeatedMonsters } from './battlefield-drop-system';
import { markMonsterHit } from './combat-feedback-system';
import { applyPlayerContactDamage } from './player-system';
import {
	addVectors,
	buildSeparationVector,
	moveToward,
	normalize,
	resolveMinimumSpacing,
	scaleVector
} from './spatial-utils';

function getMonsterSkillKind(difficulty: Difficulty): MonsterSkillKind {
	if (difficulty === 'medium') return 'dash';
	if (difficulty === 'hard') return 'throw';
	return 'melee';
}

function ensureMonsterSkillRuntime(monster: MonsterState): MonsterSkillRuntimeState {
	const resolvedKind = getMonsterSkillKind(monster.difficulty);

	if (!monster.skill) {
		monster.skill = {
			kind: resolvedKind,
			phaseMs: 0,
			committedDirX: 0,
			committedDirY: 1,
			hasAppliedDamage: false
		};
	}

	monster.skill.kind = resolvedKind;
	return monster.skill;
}

function resetMonsterAttack(monster: MonsterState) {
	monster.attackState = 'idle';
	monster.attackWindupMs = 0;

	const skill = ensureMonsterSkillRuntime(monster);
	skill.phaseMs = 0;
	skill.hasAppliedDamage = false;
}

function resolveCommittedDirection(monster: MonsterState, state: GameState) {
	const toPlayerX = state.player.x - monster.x;
	const toPlayerY = state.player.y - monster.y;
	const directLength = Math.hypot(toPlayerX, toPlayerY);

	if (directLength > 0.001) {
		return normalize(toPlayerX, toPlayerY);
	}

	const fallbackLength = Math.hypot(monster.moveDirX, monster.moveDirY);
	if (fallbackLength > 0.001) {
		return normalize(monster.moveDirX, monster.moveDirY);
	}

	return { x: 1, y: 0 };
}

function startMonsterMeleeTelegraph(monster: MonsterState) {
	monster.attackState = 'telegraph';
	monster.attackWindupMs = MONSTER_ATTACK_WINDUP_MS;
	monster.moving = false;
	ensureMonsterSkillRuntime(monster).kind = 'melee';
}

function startMonsterDashTelegraph(state: GameState, monster: MonsterState) {
	const skill = ensureMonsterSkillRuntime(monster);
	const committedDir = resolveCommittedDirection(monster, state);

	skill.kind = 'dash';
	skill.phaseMs = 0;
	skill.committedDirX = committedDir.x;
	skill.committedDirY = committedDir.y;
	skill.hasAppliedDamage = false;
	monster.attackState = 'telegraph';
	monster.attackWindupMs = MONSTER_DASH_TELEGRAPH_MS;
	monster.moving = false;
	monster.moveDirX = committedDir.x;
	monster.moveDirY = committedDir.y;
}

function startMonsterThrowTelegraph(state: GameState, monster: MonsterState) {
	const skill = ensureMonsterSkillRuntime(monster);
	const committedDir = resolveCommittedDirection(monster, state);

	skill.kind = 'throw';
	skill.phaseMs = 0;
	skill.committedDirX = committedDir.x;
	skill.committedDirY = committedDir.y;
	skill.hasAppliedDamage = false;
	monster.attackState = 'telegraph';
	monster.attackWindupMs = MONSTER_THROW_TELEGRAPH_MS;
	monster.moving = false;
	monster.moveDirX = committedDir.x;
	monster.moveDirY = committedDir.y;
}

function tickMonsterMeleeTelegraph(
	state: GameState,
	monster: MonsterState,
	dtMs: number,
	inMeleeRange: boolean
) {
	monster.moving = false;

	if (!inMeleeRange) {
		resetMonsterAttack(monster);
		return;
	}

	monster.attackWindupMs = Math.max(
		0,
		Math.min(MONSTER_ATTACK_WINDUP_MS, monster.attackWindupMs - dtMs)
	);
	if (monster.attackWindupMs > 0) {
		return;
	}

	applyPlayerContactDamage(state, monster.damage, 'melee');
	resetMonsterAttack(monster);
	monster.attackCooldownMs = MONSTER_ATTACK_INTERVAL_MS;
}

function tickMonsterDashTelegraph(state: GameState, monster: MonsterState, dtMs: number) {
	const skill = ensureMonsterSkillRuntime(monster);
	monster.moving = false;
	monster.moveDirX = skill.committedDirX;
	monster.moveDirY = skill.committedDirY;
	monster.attackWindupMs = Math.max(
		0,
		Math.min(MONSTER_DASH_TELEGRAPH_MS, monster.attackWindupMs - dtMs)
	);

	if (monster.attackWindupMs > 0) {
		return;
	}

	monster.attackState = 'active';
	skill.phaseMs = MONSTER_DASH_BURST_MS;
	skill.hasAppliedDamage = false;
}

function tickMonsterDashBurst(
	state: GameState,
	monster: MonsterState,
	skill: MonsterSkillRuntimeState,
	dtSeconds: number,
	dtMs: number
) {
	const nextX = clamp(
		monster.x + skill.committedDirX * MONSTER_DASH_SPEED * dtSeconds,
		monster.radius,
		state.width - monster.radius
	);
	const nextY = clamp(
		monster.y + skill.committedDirY * MONSTER_DASH_SPEED * dtSeconds,
		monster.radius,
		state.height - monster.radius
	);

	monster.moving = Math.hypot(nextX - monster.x, nextY - monster.y) > 0.05;
	monster.x = nextX;
	monster.y = nextY;
	monster.moveDirX = skill.committedDirX;
	monster.moveDirY = skill.committedDirY;

	if (
		!skill.hasAppliedDamage &&
		distance(monster.x, monster.y, state.player.x, state.player.y) <=
			monster.radius + state.player.radius + 6
	) {
		applyPlayerContactDamage(state, monster.damage, 'dash');
		skill.hasAppliedDamage = true;
	}

	skill.phaseMs = Math.max(0, skill.phaseMs - dtMs);
	if (skill.phaseMs > 0) {
		return;
	}

	monster.attackState = 'recovery';
	monster.attackCooldownMs = Math.max(monster.attackCooldownMs, MONSTER_DASH_COOLDOWN_MS);
	monster.moving = false;
	skill.phaseMs = MONSTER_DASH_RECOVERY_MS;
}

function tickMonsterDashRecovery(monster: MonsterState, skill: MonsterSkillRuntimeState, dtMs: number) {
	monster.moving = false;
	skill.phaseMs = Math.max(0, skill.phaseMs - dtMs);

	if (skill.phaseMs > 0) {
		return;
	}

	resetMonsterAttack(monster);
}

function spawnThrownProjectile(state: GameState, monster: MonsterState, skill: MonsterSkillRuntimeState) {
	const projectile: ProjectileState = {
		id: uid('proj'),
		x: monster.x + skill.committedDirX * (monster.radius + MONSTER_THROW_PROJECTILE_RADIUS + 6),
		y: monster.y + skill.committedDirY * (monster.radius + MONSTER_THROW_PROJECTILE_RADIUS + 6),
		vx: skill.committedDirX * MONSTER_THROW_PROJECTILE_SPEED,
		vy: skill.committedDirY * MONSTER_THROW_PROJECTILE_SPEED,
		radius: MONSTER_THROW_PROJECTILE_RADIUS,
		damage: monster.damage,
		color: MONSTER_THROW_PROJECTILE_COLOR,
		owner: 'monster',
		ttlMs: MONSTER_THROW_PROJECTILE_TTL_MS
	};

	state.projectiles.push(projectile);
}

function buildMonsterSeparation(
	monster: MonsterState,
	alive: MonsterState[],
	selfIndex: number
) {
	let offsetX = 0;
	let offsetY = 0;

	for (let index = 0; index < alive.length; index += 1) {
		if (index === selfIndex) continue;

		const other = alive[index];
		const dx = monster.x - other.x;
		const dy = monster.y - other.y;
		const dist = Math.hypot(dx, dy);

		if (dist <= 0.001 || dist >= MONSTER_SEPARATION_RADIUS) continue;

		const scale = (MONSTER_SEPARATION_RADIUS - dist) / MONSTER_SEPARATION_RADIUS;
		offsetX += (dx / dist) * scale;
		offsetY += (dy / dist) * scale;
	}

	return { x: offsetX, y: offsetY };
}

function tickMonsterThrowTelegraph(state: GameState, monster: MonsterState, dtMs: number) {
	const skill = ensureMonsterSkillRuntime(monster);
	monster.moving = false;
	monster.moveDirX = skill.committedDirX;
	monster.moveDirY = skill.committedDirY;
	monster.attackWindupMs = Math.max(
		0,
		Math.min(MONSTER_THROW_TELEGRAPH_MS, monster.attackWindupMs - dtMs)
	);

	if (monster.attackWindupMs > 0) {
		return;
	}

	spawnThrownProjectile(state, monster, skill);
	resetMonsterAttack(monster);
	monster.attackCooldownMs = Math.max(monster.attackCooldownMs, MONSTER_THROW_COOLDOWN_MS);
}

function pickDifficulty(level: number): Difficulty {
	if (
		level >= KD_MONSTER_TUNING.spawnDifficulty.hardMinimumLevel &&
		Math.random() > KD_MONSTER_TUNING.spawnDifficulty.hardRollThreshold
	)
		return 'hard';
	if (
		level >= KD_MONSTER_TUNING.spawnDifficulty.mediumMinimumLevel &&
		Math.random() > KD_MONSTER_TUNING.spawnDifficulty.mediumRollThreshold
	)
		return 'medium';
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
		speed:
			MONSTER_BASE_SPEED[difficulty] +
			state.progress.level * KD_MONSTER_TUNING.spawnDifficulty.levelSpeedStep,
		damage: MONSTER_DAMAGE[difficulty],
		isDead: false,
		hurtFlashMs: 0,
		attackCooldownMs: KD_MONSTER_TUNING.spawnDifficulty.initialAttackCooldownMs,
		attackState: 'idle',
		attackWindupMs: 0,
		moving: false,
		moveDirX: 0,
		moveDirY: 1,
		skill: {
			kind: getMonsterSkillKind(difficulty),
			phaseMs: 0,
			committedDirX: 0,
			committedDirY: 1,
			hasAppliedDamage: false
		}
	};

	state.monsters.push(monster);
}

export function updateMonsters(state: GameState, dtSeconds: number, dtMs: number) {
	const now = Date.now();
	const { player } = state;
	const alive = state.monsters.filter((monster) => !monster.isDead);
	const spacingCandidates: MonsterState[] = [];

	for (let monsterIndex = 0; monsterIndex < alive.length; monsterIndex += 1) {
		const monster = alive[monsterIndex];
		if (monster.isDead) continue;

		// debuffs
		const remainingStatusEffects = [];
		for (const statusEffect of monster.statusEffects ?? []) {
			if (statusEffect.kind === 'bleed') {
				if (now >= statusEffect.nextTickAt) {
					monster.hp = Math.max(0, monster.hp - statusEffect.damagePerTick);
					markMonsterHit(state, monster, statusEffect.damagePerTick);
					statusEffect.remainingTicks -= 1;
					statusEffect.nextTickAt = now + statusEffect.tickIntervalMs;
				}

				if (monster.hp <= 0) {
					finalizeMonsterDeath(state, monster);
					continue;
				}

				if (statusEffect.remainingTicks > 0) {
					remainingStatusEffects.push(statusEffect);
				}
				continue;
			}

			remainingStatusEffects.push(statusEffect);
		}
		monster.statusEffects = remainingStatusEffects;
		if (monster.isDead) {
			continue;
		}
		if ((monster.slowUntil ?? 0) <= now) {
			monster.slowUntil = undefined;
			monster.slowMultiplier = undefined;
		}

		const skill = ensureMonsterSkillRuntime(monster);
		monster.hurtFlashMs = Math.max(0, monster.hurtFlashMs - dtMs);
		monster.attackCooldownMs = Math.max(0, monster.attackCooldownMs - dtMs);

		const meleeDistance = distance(monster.x, monster.y, player.x, player.y);
		const inMeleeRange = meleeDistance <= monster.radius + player.radius + 6;

		if (monster.attackState === 'telegraph') {
			if (skill.kind === 'melee') {
				tickMonsterMeleeTelegraph(state, monster, dtMs, inMeleeRange);
			} else if (skill.kind === 'dash') {
				tickMonsterDashTelegraph(state, monster, dtMs);
			} else {
				tickMonsterThrowTelegraph(state, monster, dtMs);
			}
			continue;
		}

		if (monster.attackState === 'active' && skill.kind === 'dash') {
			tickMonsterDashBurst(state, monster, skill, dtSeconds, dtMs);
			continue;
		}

		if (monster.attackState === 'recovery' && skill.kind === 'dash') {
			tickMonsterDashRecovery(monster, skill, dtMs);
			continue;
		}

		const seek = normalize(player.x - monster.x, player.y - monster.y);
		const separation = scaleVector(
			buildMonsterSeparation(monster, alive, monsterIndex),
			MONSTER_SEPARATION_FORCE
		);

		const standOffDistance = player.radius + monster.radius + MONSTER_PLAYER_STANDOFF;
		const distToPlayer = distance(monster.x, monster.y, player.x, player.y);
		const standOffPush =
			distToPlayer < standOffDistance
				? scaleVector(
						normalize(monster.x - player.x, monster.y - player.y),
						(standOffDistance - distToPlayer) / standOffDistance
					)
				: { x: 0, y: 0 };

		const desired = addVectors(seek, separation, standOffPush);
		const desiredDir = normalize(desired.x, desired.y);
		const speedMultiplier = (monster.slowUntil ?? 0) > now ? monster.slowMultiplier ?? 1 : 1;
		const next = moveToward(
			monster.x,
			monster.y,
			monster.x + desiredDir.x * 60,
			monster.y + desiredDir.y * 60,
			monster.speed * speedMultiplier,
			dtSeconds
		);
		const movedDistance = distance(monster.x, monster.y, next.x, next.y);

		monster.x = next.x;
		monster.y = next.y;
		monster.moving = movedDistance > 0.05;
		monster.moveDirX = next.moveDir.x;
		monster.moveDirY = next.moveDir.y;

		const hitDistance = distance(monster.x, monster.y, player.x, player.y);
		const inUpdatedMeleeRange = hitDistance <= monster.radius + player.radius + 6;

		if (skill.kind === 'melee') {
			if (!inUpdatedMeleeRange) {
				resetMonsterAttack(monster);
				spacingCandidates.push(monster);
				continue;
			}

			monster.attackWindupMs = 0;

			if (monster.attackCooldownMs > 0) {
				monster.moving = false;
				spacingCandidates.push(monster);
				continue;
			}

			startMonsterMeleeTelegraph(monster);
			continue;
		}

		if (skill.kind === 'dash') {
			monster.attackWindupMs = 0;
			spacingCandidates.push(monster);
			if (monster.attackCooldownMs <= 0 && hitDistance <= MONSTER_DASH_TRIGGER_RANGE) {
				startMonsterDashTelegraph(state, monster);
			}
			continue;
		}

		monster.attackWindupMs = 0;
		spacingCandidates.push(monster);
		if (monster.attackCooldownMs <= 0 && hitDistance <= MONSTER_THROW_TRIGGER_RANGE) {
			startMonsterThrowTelegraph(state, monster);
		}
	}

	resolveMinimumSpacing(spacingCandidates.filter((monster) => monster.attackState !== 'active'), MONSTER_MIN_GAP, 2);

	state.monsters = alive;
	removeDefeatedMonsters(state);
}
