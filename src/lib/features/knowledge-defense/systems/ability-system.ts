import {
	ABILITY_PULSE_OVERCHARGE_DAMAGE_BONUS,
	ABILITY_PULSE_OVERCHARGE_HEAL_ON_HIT_BONUS,
	ABILITY_PULSE_OVERCHARGE_IFRAME_BONUS_MS,
	ABILITY_PULSE_OVERCHARGE_MAX_HEAL_BONUS,
	ABILITY_PULSE_OVERCHARGE_MAX_STACKS,
	ABILITY_PULSE_OVERCHARGE_RADIUS_BONUS,
	ABILITY_DASH_DAMAGE,
	ABILITY_DASH_DISTANCE,
	ABILITY_DASH_DURATION_MS,
	ABILITY_DASH_FX_MS,
	ABILITY_DASH_IFRAME_MS,
	ABILITY_DASH_KNOCKBACK,
	ABILITY_DASH_STRIKE_RADIUS,
	ABILITY_KARATE_DAMAGE,
	ABILITY_KARATE_FX_MS,
	ABILITY_KARATE_KNOCKBACK,
	ABILITY_KARATE_MAX_TARGETS,
	ABILITY_KARATE_RANGE,
	ABILITY_PULSE_DAMAGE,
	ABILITY_PULSE_HEAL_ON_HIT,
	ABILITY_PULSE_IFRAME_MS,
	ABILITY_PULSE_KNOCKBACK,
	ABILITY_PULSE_MAX_HEAL,
	ABILITY_PULSE_RADIUS
} from '../config/constants';
import type { ActionSlotKey, GameState, MonsterState, ProjectileState, SkillDefinitionId } from '../core/types';
import { clamp, distance, distanceToSegment, normalizeVector, uid } from '../core/utils';
import { finalizeMonsterDeath, removeDefeatedMonsters } from './battlefield-drop-system';
import { markMonsterHit } from './combat-feedback-system';
import { scalePlayerDamage } from './progression-system';

function listActionSlotKeys(): ActionSlotKey[] {
	return ['H', 'J', 'K', 'L'];
}

function resolveSkillLevel(state: GameState, skillId: SkillDefinitionId) {
	return Math.max(0, state.build.skillLevels[skillId] ?? 0);
}

export function tickActionCooldowns(state: GameState, dtMs: number) {
	for (const key of listActionSlotKeys()) {
		state.runtime.actionCooldownMs[key] = Math.max(0, state.runtime.actionCooldownMs[key] - dtMs);
	}
}

export function refreshActionSlot(state: GameState, key: ActionSlotKey) {
	state.runtime.actionCooldownMs[key] = 0;
}

export function grantPulseOvercharge(state: GameState, stacks = 1) {
	state.buffs.pulseOverchargeStacks = Math.min(
		ABILITY_PULSE_OVERCHARGE_MAX_STACKS,
		state.buffs.pulseOverchargeStacks + Math.max(0, stacks)
	);
}

function resolveAbilityDirection(state: GameState) {
	const movingDirection = normalizeVector(state.player.moveDirX, state.player.moveDirY);
	if (movingDirection.x !== 0 || movingDirection.y !== 0) {
		return movingDirection;
	}
	return normalizeVector(0, 1);
}

function applyAbilityHit(state: GameState, monster: MonsterState, damage: number) {
	monster.hp = Math.max(0, monster.hp - damage);
	markMonsterHit(state, monster, damage);
	if (monster.hp <= 0) {
		finalizeMonsterDeath(state, monster);
		return true;
	}
	return false;
}

function castPulse(state: GameState, level: number) {
	// upgrades: Lv2 radius +30%, Lv3 cooldown -40% (handled by caller)
	const overcharged = state.buffs.pulseOverchargeStacks > 0;
	const radiusMultiplier = level >= 2 ? 1.3 : 1;
	const pulseRadius =
		ABILITY_PULSE_RADIUS * radiusMultiplier + (overcharged ? ABILITY_PULSE_OVERCHARGE_RADIUS_BONUS : 0);
	const pulseDamage = scalePlayerDamage(
		state,
		ABILITY_PULSE_DAMAGE + (overcharged ? ABILITY_PULSE_OVERCHARGE_DAMAGE_BONUS : 0)
	);
	const healPerHit =
		ABILITY_PULSE_HEAL_ON_HIT + (overcharged ? ABILITY_PULSE_OVERCHARGE_HEAL_ON_HIT_BONUS : 0);
	const maxHeal =
		ABILITY_PULSE_MAX_HEAL + (overcharged ? ABILITY_PULSE_OVERCHARGE_MAX_HEAL_BONUS : 0);

	let hitCount = 0;
	for (const monster of state.monsters) {
		if (monster.isDead) continue;
		const d = distance(state.player.x, state.player.y, monster.x, monster.y);
		if (d > pulseRadius + monster.radius) continue;

		hitCount += 1;
		monster.hp = Math.max(0, monster.hp - pulseDamage);
		markMonsterHit(state, monster, pulseDamage);

		const nx = (monster.x - state.player.x) / (d || 1);
		const ny = (monster.y - state.player.y) / (d || 1);
		monster.x += nx * ABILITY_PULSE_KNOCKBACK;
		monster.y += ny * ABILITY_PULSE_KNOCKBACK;

		if (monster.hp <= 0) {
			finalizeMonsterDeath(state, monster);
		}
	}

	if (hitCount > 0) {
		const heal = Math.min(maxHeal, hitCount * healPerHit);
		state.player.hp = Math.min(state.player.maxHp, state.player.hp + heal);
	}

	state.runtime.abilityPulseFxMs = 320;
	state.player.contactInvulnMs = Math.max(
		state.player.contactInvulnMs,
		ABILITY_PULSE_IFRAME_MS + (overcharged ? ABILITY_PULSE_OVERCHARGE_IFRAME_BONUS_MS : 0)
	);
	if (overcharged) {
		state.buffs.pulseOverchargeStacks = Math.max(0, state.buffs.pulseOverchargeStacks - 1);
	}
	removeDefeatedMonsters(state);
	return true;
}

function castDash(state: GameState, level: number) {
	const direction = resolveAbilityDirection(state);
	const distanceMultiplier = level >= 2 ? 1.1 : 1;
	const dashDistance = ABILITY_DASH_DISTANCE * distanceMultiplier;
	const startX = state.player.x;
	const startY = state.player.y;
	const endX = clamp(startX + direction.x * dashDistance, state.player.radius, state.width - state.player.radius);
	const endY = clamp(startY + direction.y * dashDistance, state.player.radius, state.height - state.player.radius);
	let defeatedMonster = false;
	let hitCount = 0;

	for (const monster of state.monsters) {
		if (monster.isDead) continue;
		const pathDistance = distanceToSegment(monster.x, monster.y, startX, startY, endX, endY);
		if (pathDistance > ABILITY_DASH_STRIKE_RADIUS + monster.radius) continue;

		hitCount += 1;
		defeatedMonster =
			applyAbilityHit(state, monster, scalePlayerDamage(state, ABILITY_DASH_DAMAGE)) || defeatedMonster;
		const knockbackDirection = normalizeVector(monster.x - startX, monster.y - startY);
		monster.x += knockbackDirection.x * ABILITY_DASH_KNOCKBACK;
		monster.y += knockbackDirection.y * ABILITY_DASH_KNOCKBACK;
	}

	state.player.moveDirX = direction.x;
	state.player.moveDirY = direction.y;
	state.player.contactInvulnMs = Math.max(state.player.contactInvulnMs, ABILITY_DASH_IFRAME_MS);
	state.runtime.dashRemainingMs = ABILITY_DASH_DURATION_MS;
	state.runtime.dashDirectionX = direction.x;
	state.runtime.dashDirectionY = direction.y;
	state.runtime.dashSpeed = Math.hypot(endX - startX, endY - startY) / (ABILITY_DASH_DURATION_MS / 1000);
	state.runtime.abilityDashFxMs = ABILITY_DASH_FX_MS;

	// upgrades: Lv3 grants a short damage reduction window (not invincible)
	if (level >= 3) {
		state.buffs.damageMitigation = { until: Date.now() + 900, multiplier: 0.8 };
	}

	if (hitCount > 0 && defeatedMonster) {
		removeDefeatedMonsters(state);
	}
	return true;
}

function castKarate(state: GameState, level: number) {
	// basic: near-range strike + knockback + projectile reflection
	const karateRange = ABILITY_KARATE_RANGE * (state.build.mods.karateRangeMultiplier || 1);
	const targets = state.monsters
		.filter((monster) => !monster.isDead)
		.map((monster) => ({
			monster,
			distance: distance(state.player.x, state.player.y, monster.x, monster.y)
		}))
		.filter(({ monster, distance: monsterDistance }) => monsterDistance <= karateRange + monster.radius)
		.sort((left, right) => left.distance - right.distance)
		.slice(0, ABILITY_KARATE_MAX_TARGETS);

	let defeatedMonster = false;
	const strikeDirection = targets[0]
		? normalizeVector(targets[0].monster.x - state.player.x, targets[0].monster.y - state.player.y)
		: resolveAbilityDirection(state);
	state.runtime.abilityKarateFxMs = ABILITY_KARATE_FX_MS;
	state.runtime.karateDirectionX = strikeDirection.x;
	state.runtime.karateDirectionY = strikeDirection.y;
	for (const { monster } of targets) {
		defeatedMonster =
			applyAbilityHit(state, monster, scalePlayerDamage(state, ABILITY_KARATE_DAMAGE)) || defeatedMonster;
		const knockbackDirection = normalizeVector(monster.x - state.player.x, monster.y - state.player.y);
		monster.x += knockbackDirection.x * ABILITY_KARATE_KNOCKBACK;
		monster.y += knockbackDirection.y * ABILITY_KARATE_KNOCKBACK;
	}

	// reflect hostile projectiles
	const reflected: ProjectileState[] = [];
	const remainingHostiles: ProjectileState[] = [];
	for (const projectile of state.projectiles) {
		const owner = projectile.owner ?? 'player';
		if (owner !== 'monster') {
			remainingHostiles.push(projectile);
			continue;
		}

		const d = distance(state.player.x, state.player.y, projectile.x, projectile.y);
		if (d > karateRange + 12) {
			remainingHostiles.push(projectile);
			continue;
		}

		// 100% destroy projectile; 60% reflect back
		if (Math.random() < 0.6) {
			const target = state.monsters.find((monster) => !monster.isDead);
			if (target) {
				const dx = target.x - state.player.x;
				const dy = target.y - state.player.y;
				const len = Math.hypot(dx, dy) || 1;
				reflected.push({
					id: uid('proj'),
					x: state.player.x,
					y: state.player.y,
					vx: (dx / len) * 760,
					vy: (dy / len) * 760,
					radius: 8,
					damage: Math.max(1, Math.round(projectile.damage * (level >= 2 ? 1.3 : 1))),
					color: '#22c55e',
					owner: 'player',
					kind: 'reflected',
					ttlMs: 1200
				});
			}
		}
	}
	state.projectiles = [...remainingHostiles, ...reflected];

	if (defeatedMonster) {
		removeDefeatedMonsters(state);
	}
	return true;
}

function resolveCooldownMs(skillId: SkillDefinitionId, level: number) {
	if (skillId === 'skill_pulse') {
		// base 16s; Lv3 cooldown -40%
		return Math.round(16_000 * (level >= 3 ? 0.6 : 1));
	}
	if (skillId === 'skill_dash') {
		return 5000;
	}
	if (skillId === 'skill_karate') {
		return 5200;
	}
	return 8000;
}

export function castActionSlot(state: GameState, key: ActionSlotKey): boolean {
	if (state.player.hp <= 0) return false;
	if (!state.runtime.running) return false;
	if (state.runtime.actionCooldownMs[key] > 0) return false;

	const skillId = state.loadout.actionSlots[key];
	if (!skillId) return false;

	const level = resolveSkillLevel(state, skillId);
	if (level <= 0) return false;

	let casted = false;
	if (skillId === 'skill_pulse') {
		casted = castPulse(state, level);
	} else if (skillId === 'skill_dash') {
		casted = castDash(state, level);
	} else if (skillId === 'skill_karate') {
		casted = castKarate(state, level);
	}

	if (!casted) return false;
	state.runtime.actionCooldownMs[key] = resolveCooldownMs(skillId, level);
	return true;
}
