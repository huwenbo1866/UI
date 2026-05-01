import {
	AUTO_ATTACK_COOLDOWN_MS,
	ABILITY_KARATE_DAMAGE,
	ABILITY_KARATE_FX_MS,
	ABILITY_KARATE_KNOCKBACK,
	ABILITY_KARATE_RANGE,
	BASE_PROJECTILE_RADIUS,
	BASE_SCATTER_PELLET_COUNT,
	BASE_SCATTER_PELLET_DAMAGE,
	BASE_SCATTER_SPREAD_RADIANS,
	BASE_STRAIGHT_DAMAGE,
	LASER_DAMAGE,
	LASER_RANGE,
	LASER_TTL_MS,
	LASER_WIDTH,
	MAX_ACTIVE_LASERS,
	MISSILE_BURST_COUNT,
	MISSILE_BURST_INTERVAL_MS,
	MISSILE_EXPLOSION_RADIUS,
	MISSILE_HOMING_STEER,
	MISSILE_LAUNCH_ANGLE_OFFSET_RADIANS,
	MISSILE_LAUNCH_LATERAL_OFFSET,
	MISSILE_LAUNCH_VERTICAL_OFFSET,
	MISSILE_PROJECTILE_DAMAGE,
	MISSILE_PROJECTILE_RADIUS,
	MISSILE_PROJECTILE_SPEED,
	PROJECTILE_SPEED,
	SCATTER7_PELLET_COUNT,
	SCATTER7_PELLET_DAMAGE,
	SCATTER7_SPREAD_RADIANS,
	STRAIGHT4_DAMAGE,
	STRAIGHT_BURST_INTERVAL_MS,
	STRAIGHT4_SHOT_INTERVAL_MS
} from '../config/constants';
import {
	getAttackPatternForWeaponDefinition,
	getWeaponDefinitionIdForAttackPattern
} from '../data/weapon-definitions';
import type {
	AttackPattern,
	AttackSequenceState,
	GameState,
	LaserEffectState,
	MonsterState,
	ProjectileState,
	WeaponDefinitionId
} from '../core/types';
import { distanceToSegment, uid } from '../core/utils';
import { audioManager } from './audio-manager';
import { finalizeMonsterDeath, removeDefeatedMonsters } from './battlefield-drop-system';
import { markMonsterHit } from './combat-feedback-system';
import { resolveAttackSpeedMultiplier, scalePlayerDamage } from './progression-system';

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

function createAttackSequence(state: GameState, weaponDefinitionId: WeaponDefinitionId): AttackSequenceState {
	const pattern = getAttackPatternForWeaponDefinition(weaponDefinitionId);
	if (pattern === 'single') {
		return {
			id: uid('seq'),
			weaponDefinitionId,
			pattern,
			shotsRemaining: 1 + Math.max(0, state.build.mods.straightBurstExtra),
			shotIntervalMs: state.build.mods.straightBurstExtra > 0 ? STRAIGHT_BURST_INTERVAL_MS : 0,
			timeUntilNextMs: 0
		};
	}
  if (pattern === 'straight4') {
    return {
      id: uid('seq'),
		  weaponDefinitionId,
      pattern,
      shotsRemaining: 4,
      shotIntervalMs: STRAIGHT4_SHOT_INTERVAL_MS,
      timeUntilNextMs: 0
    };
	}

	if (pattern === 'missileBurst') {
		return {
			id: uid('seq'),
			weaponDefinitionId,
			pattern,
			shotsRemaining: MISSILE_BURST_COUNT,
			shotIntervalMs: MISSILE_BURST_INTERVAL_MS,
			timeUntilNextMs: 0
		};
	}

  return {
    id: uid('seq'),
		weaponDefinitionId,
    pattern,
    shotsRemaining: 1,
    shotIntervalMs: 0,
    timeUntilNextMs: 0
  };
}

function spawnStraightProjectile(
	state: GameState,
	target: MonsterState,
	damage: number,
	options: {
		speed?: number;
		radius?: number;
		color?: string;
		ttlMs?: number;
		angleOffsetRadians?: number;
		originX?: number;
		originY?: number;
	} = {}
) {
	const baseAngle = Math.atan2(target.y - state.player.y, target.x - state.player.x);
	const angle = baseAngle + (options.angleOffsetRadians ?? 0);
	const nx = Math.cos(angle);
	const ny = Math.sin(angle);
	const projectile: ProjectileState = {
		id: uid('proj'),
		x: options.originX ?? state.player.x,
		y: options.originY ?? state.player.y,
		vx: nx * (options.speed ?? PROJECTILE_SPEED),
		vy: ny * (options.speed ?? PROJECTILE_SPEED),
		radius: options.radius ?? BASE_PROJECTILE_RADIUS,
		damage: scalePlayerDamage(state, damage),
		color: options.color ?? '#f59e0b',
		owner: 'player',
		ttlMs: options.ttlMs,
		kind: 'bullet'
	};
	state.projectiles.push(projectile);
	return projectile;
}

function applyStraightProjectileMods(state: GameState, projectile: ProjectileState) {
	const mods = state.build.mods;
	if (mods.straightFreezeChance > 0) {
		projectile.applySlowChance = mods.straightFreezeChance;
		projectile.applySlowMultiplier = mods.straightFreezeSlowMultiplier;
		projectile.applySlowMs = mods.straightFreezeMs;
	}
	if (mods.straightPierce > 0) {
		projectile.pierceRemaining = mods.straightPierce;
		projectile.pierceDamageFalloffMultiplier = 0.6;
		projectile.hitMonsterIds = [];
	}
}

function getBurstTrajectoryOffsets(trajectories: number) {
	const spread = trajectories <= 1 ? 0 : (Math.PI / 180) * 6;
	const start = -spread / 2;
	const step = trajectories <= 1 ? 0 : spread / (trajectories - 1);
	return Array.from({ length: trajectories }, (_, index) => start + step * index);
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
			damage: scalePlayerDamage(state, damage),
			color,
			owner: 'player',
			kind: 'bullet'
		});
	}

	state.projectiles.push(...projectiles);
}

function fireLaserLine(state: GameState, target: MonsterState) {
	const dx = target.x - state.player.x;
	const dy = target.y - state.player.y;
	const len = Math.hypot(dx, dy) || 1;
	const laserRange = LASER_RANGE * (state.build.mods.laserRangeMultiplier || 1);
	const endX = state.player.x + (dx / len) * laserRange;
	const endY = state.player.y + (dy / len) * laserRange;
	let defeatedMonster = false;
	let hitCount = 0;

	state.lasers.push({
		id: uid('laser'),
		from: { x: state.player.x, y: state.player.y },
		to: { x: endX, y: endY },
		ttlMs: LASER_TTL_MS,
		targetMonsterId: target.id,
		widthMultiplier: state.build.mods.laserWidthMultiplier || 1
	});
	if (state.lasers.length > MAX_ACTIVE_LASERS) {
		state.lasers.splice(0, state.lasers.length - MAX_ACTIVE_LASERS);
	}

	for (const monster of state.monsters) {
		if (monster.isDead) continue;
		const lineDistance = distanceToSegment(
			monster.x,
			monster.y,
			state.player.x,
			state.player.y,
			endX,
			endY
		);
		const width = LASER_WIDTH * (state.build.mods.laserWidthMultiplier || 1);
		if (lineDistance > width + monster.radius) continue;

		hitCount += 1;
		const laserDamage = scalePlayerDamage(state, LASER_DAMAGE);
		monster.hp = Math.max(0, monster.hp - laserDamage);
		markMonsterHit(state, monster, laserDamage);
		if (monster.hp <= 0) {
			finalizeMonsterDeath(state, monster);
			defeatedMonster = true;
			audioManager.playDeath();
		}
	}

	if (hitCount > 0) {
		audioManager.playHit();
	}
	if (defeatedMonster) {
		removeDefeatedMonsters(state);
	}
}

function fireKarateStrike(state: GameState, target: MonsterState) {
	const dx = target.x - state.player.x;
	const dy = target.y - state.player.y;
	const distanceToTarget = Math.hypot(dx, dy);
	const karateRange = ABILITY_KARATE_RANGE * (state.build.mods.karateRangeMultiplier || 1);
	if (distanceToTarget > karateRange + target.radius) {
		return;
	}

	const strikeDamage = scalePlayerDamage(state, ABILITY_KARATE_DAMAGE);
	target.hp = Math.max(0, target.hp - strikeDamage);
	markMonsterHit(state, target, strikeDamage);

	const len = distanceToTarget || 1;
	target.x += (dx / len) * ABILITY_KARATE_KNOCKBACK;
	target.y += (dy / len) * ABILITY_KARATE_KNOCKBACK;
	state.runtime.abilityKarateFxMs = ABILITY_KARATE_FX_MS;
	state.runtime.karateDirectionX = dx / len;
	state.runtime.karateDirectionY = dy / len;

	if (target.hp <= 0) {
		finalizeMonsterDeath(state, target);
		audioManager.playDeath();
		removeDefeatedMonsters(state);
	}

	audioManager.playHit();
}

function resolveWeaponDefinitionIdForNextCycle(state: GameState): WeaponDefinitionId {
	const queuedWeaponBuffWeaponId =
		state.buffs.queuedWeaponBuffWeaponId ??
		(state.buffs.queuedWeaponBuff
			? getWeaponDefinitionIdForAttackPattern(
					state.buffs.queuedWeaponBuff,
					state.settings.attackPreference
				)
			: null);

	if (queuedWeaponBuffWeaponId && state.buffs.queuedWeaponBuffUses > 0) {
		const weaponDefinitionId = queuedWeaponBuffWeaponId;
		state.buffs.queuedWeaponBuffUses -= 1;
		if (state.buffs.queuedWeaponBuffUses <= 0) {
			state.buffs.queuedWeaponBuff = null;
			state.buffs.queuedWeaponBuffWeaponId = null;
			state.buffs.queuedWeaponBuffUses = 0;
		}
		return weaponDefinitionId;
  }

	return state.loadout.mainWeaponId;
}

export function tickAutoAttack(state: GameState, dtMs: number) {
  state.runtime.attackCooldownMs -= dtMs;
  if (state.runtime.attackCooldownMs > 0) return;

	state.runtime.attackCooldownMs += Math.max(
		180,
		Math.round(AUTO_ATTACK_COOLDOWN_MS / resolveAttackSpeedMultiplier(state))
	);
  if (!getNearestMonster(state)) return;

	const sequence = createAttackSequence(state, resolveWeaponDefinitionIdForNextCycle(state));
	state.attackSequences.push(sequence);
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
		} else {
			const pattern: AttackPattern = sequence.weaponDefinitionId
				? getAttackPatternForWeaponDefinition(sequence.weaponDefinitionId)
				: sequence.pattern;

			sequence.pattern = pattern;

			if (pattern === 'single') {
				const mods = state.build.mods;
				const trajectories = 1 + Math.max(0, mods.straightTrajectories);
				for (const angleOffsetRadians of getBurstTrajectoryOffsets(trajectories)) {
					const proj = spawnStraightProjectile(state, target, BASE_STRAIGHT_DAMAGE, {
						angleOffsetRadians,
						color: '#f59e0b'
					});
					applyStraightProjectileMods(state, proj);
				}
				sequence.shotsRemaining -= 1;
				if (sequence.shotsRemaining > 0) {
					sequence.timeUntilNextMs = sequence.shotIntervalMs;
				}
			} else if (pattern === 'scatter') {
				const mods = state.build.mods;
				const pelletCount = BASE_SCATTER_PELLET_COUNT + Math.max(0, mods.scatterExtraPellets);
				spawnScatterProjectiles(
					state,
					target,
					pelletCount,
					BASE_SCATTER_SPREAD_RADIANS,
					BASE_SCATTER_PELLET_DAMAGE,
					'#38bdf8'
				);
				// attach debuffs/knockback to last spawned pellets (simple: apply to all just spawned)
				for (let i = state.projectiles.length - pelletCount; i < state.projectiles.length; i += 1) {
					const proj = state.projectiles[i];
					if (!proj) continue;
					if (mods.scatterBleedDps > 0 && mods.scatterBleedMs > 0) {
						proj.applyBleedDps = mods.scatterBleedDps;
						proj.applyBleedMs = mods.scatterBleedMs;
					}
					if (mods.scatterCloseKnockbackChance > 0) {
						proj.applyKnockback = mods.scatterCloseKnockback;
						proj.applyKnockbackChance = mods.scatterCloseKnockbackChance;
						proj.applyKnockbackRange = 90;
					}
				}
		sequence.shotsRemaining -= 1;
			} else if (pattern === 'straight4') {
      const shotIndex = Math.max(0, 4 - sequence.shotsRemaining);
      const proj = spawnStraightProjectile(
        state,
        target,
        STRAIGHT4_DAMAGE[shotIndex] ?? STRAIGHT4_DAMAGE.at(-1) ?? BASE_STRAIGHT_DAMAGE
      );
      applyStraightProjectileMods(state, proj);
      sequence.shotsRemaining -= 1;
      if (sequence.shotsRemaining > 0) {
        sequence.timeUntilNextMs = sequence.shotIntervalMs;
      }
			} else if (pattern === 'scatter7') {
      spawnScatterProjectiles(state, target, SCATTER7_PELLET_COUNT, SCATTER7_SPREAD_RADIANS, SCATTER7_PELLET_DAMAGE, '#3b82f6');
      sequence.shotsRemaining -= 1;
			} else if (pattern === 'missileBurst') {
				const mods = state.build.mods;
				const lateralDirection = sequence.shotsRemaining % 2 === 0 ? -1 : 1;
				const angleOffsetRadians = lateralDirection * MISSILE_LAUNCH_ANGLE_OFFSET_RADIANS;
				const proj = spawnStraightProjectile(state, target, MISSILE_PROJECTILE_DAMAGE, {
					speed: MISSILE_PROJECTILE_SPEED,
					radius: MISSILE_PROJECTILE_RADIUS,
					color: '#fb923c',
					angleOffsetRadians,
					originX: state.player.x + lateralDirection * MISSILE_LAUNCH_LATERAL_OFFSET,
					originY: state.player.y - MISSILE_LAUNCH_VERTICAL_OFFSET
				});
				proj.kind = 'missile';
				proj.targetMonsterId = target.id;
				proj.homingStrength = MISSILE_HOMING_STEER;
				proj.explosionRadius = MISSILE_EXPLOSION_RADIUS + Math.max(0, mods.missileExplosionRadiusBonus);
				if (mods.missileBurningMs > 0) {
					proj.leaveBurningMs = mods.missileBurningMs;
					proj.leaveBurningDps = mods.missileBurningDps;
				}
				sequence.shotsRemaining -= 1;
				if (sequence.shotsRemaining > 0) {
					sequence.timeUntilNextMs = sequence.shotIntervalMs;
				}
			} else if (pattern === 'laserLine') {
				fireLaserLine(state, target);
				sequence.shotsRemaining -= 1;
			} else if (pattern === 'karateStrike') {
				fireKarateStrike(state, target);
				sequence.shotsRemaining -= 1;
			}
    }

    if (sequence.shotsRemaining > 0) {
      remaining.push(sequence);
    }
  }

	state.attackSequences = remaining;
}

export function tickLasers(state: GameState, dtMs: number) {
	const remaining: LaserEffectState[] = [];
	for (const laser of state.lasers) {
		laser.ttlMs -= dtMs;
		if (laser.ttlMs > 0) {
			remaining.push(laser);
		}
	}
	state.lasers = remaining;
}
