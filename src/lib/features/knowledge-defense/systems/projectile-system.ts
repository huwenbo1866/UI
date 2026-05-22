import type { GameState } from '../core/types';
import { MISSILE_PROJECTILE_SPEED } from '../config/constants';
import { clamp, distance } from '../core/utils';
import { audioManager } from './audio-manager';
import { finalizeMonsterDeath, removeDefeatedMonsters } from './battlefield-drop-system';
import { markMonsterHit } from './combat-feedback-system';
import { spawnBurnZone } from './deployable-system';
import { applyPlayerContactDamage } from './player-system';

export function updateProjectiles(state: GameState, dtSeconds: number) {
	const next = [];
	const dtMs = dtSeconds * 1000;
	let defeatedMonster = false;
	const now = Date.now();

	for (const projectile of state.projectiles) {
		// homing adjustments (missiles)
		if (projectile.kind === 'missile') {
			const target = resolveMissileTarget(state, projectile);
			if (target) {
				projectile.targetMonsterId = target.id;
				const dx = target.x - projectile.x;
				const dy = target.y - projectile.y;
				const len = Math.hypot(dx, dy) || 1;
				const speed = Math.hypot(projectile.vx, projectile.vy) || MISSILE_PROJECTILE_SPEED;
				const desiredVx = (dx / len) * speed;
				const desiredVy = (dy / len) * speed;
				const steer = Math.max(0, Math.min(1, projectile.homingStrength ?? 0));
				const blendedVx = projectile.vx * (1 - steer) + desiredVx * steer;
				const blendedVy = projectile.vy * (1 - steer) + desiredVy * steer;
				const blendedLength = Math.hypot(blendedVx, blendedVy) || 1;
				projectile.vx = (blendedVx / blendedLength) * speed;
				projectile.vy = (blendedVy / blendedLength) * speed;
			} else {
				// 没有可用目标时朝当前方向继续飞行，避免卡死
				projectile.targetMonsterId = null;
			}
		}

		if (projectile.ttlMs !== undefined) {
			projectile.ttlMs = Math.max(0, projectile.ttlMs - dtMs);
			if (projectile.ttlMs <= 0) {
				continue;
			}
		}

		projectile.x += projectile.vx * dtSeconds;
		projectile.y += projectile.vy * dtSeconds;

		if (
			projectile.x < 0 ||
			projectile.x > state.width ||
			projectile.y < 0 ||
			projectile.y > state.height
		) {
			continue;
		}

		let hit = false;
		const owner = projectile.owner ?? 'player';

		if (owner === 'monster') {
			if (
				distance(projectile.x, projectile.y, state.player.x, state.player.y) <=
				projectile.radius + state.player.radius
			) {
				applyPlayerContactDamage(state, projectile.damage, 'projectile');
				hit = true;
			}
		} else {
			for (const monster of state.monsters) {
				if (monster.isDead) continue;
				if ((projectile.hitMonsterIds ?? []).includes(monster.id)) continue;

				if (
					distance(projectile.x, projectile.y, monster.x, monster.y) <=
					projectile.radius + monster.radius
				) {
					// missiles explode and optionally apply burning
					if (projectile.kind === 'missile') {
						const explosionRadius = Math.max(0, projectile.explosionRadius ?? 0);
						const damage = projectile.damage;
						let killed = false;
						for (const aoeTarget of state.monsters) {
							if (aoeTarget.isDead) continue;
							if (distance(projectile.x, projectile.y, aoeTarget.x, aoeTarget.y) > explosionRadius + aoeTarget.radius) {
								continue;
							}
							aoeTarget.hp = clamp(aoeTarget.hp - damage, 0, aoeTarget.maxHp);
							markMonsterHit(state, aoeTarget, damage);
							if (aoeTarget.hp <= 0) {
								finalizeMonsterDeath(state, aoeTarget);
								killed = true;
								audioManager.playDeath();
							}
						}
						if ((projectile.leaveBurningMs ?? 0) > 0 && (projectile.leaveBurningDps ?? 0) > 0) {
							spawnBurnZone(
								state,
								projectile.x,
								projectile.y,
								projectile.explosionRadius ?? 0,
								projectile.leaveBurningMs ?? 0,
								projectile.leaveBurningDps ?? 0
							);
						}
						if (killed) {
							defeatedMonster = true;
							removeDefeatedMonsters(state);
						}
						audioManager.playHit();
						hit = true;
						break;
					}

					monster.hp = clamp(monster.hp - projectile.damage, 0, monster.maxHp);
					markMonsterHit(state, monster, projectile.damage);
					audioManager.playHit();

					// on-hit debuffs (data-driven)
					if ((projectile.applySlowChance ?? 0) > 0 && Math.random() < (projectile.applySlowChance ?? 0)) {
						const slowMs = Math.max(0, projectile.applySlowMs ?? 0);
						if (slowMs > 0) {
							monster.slowUntil = Math.max(monster.slowUntil ?? 0, now) + slowMs;
							monster.slowMultiplier = Math.max(0.2, Math.min(1, projectile.applySlowMultiplier ?? 1));
						}
					}
					if (
						(projectile.applyBleedDamagePerTick ?? 0) > 0 &&
						(projectile.applyBleedTickIntervalMs ?? 0) > 0 &&
						(projectile.applyBleedMaxTicks ?? 0) > 0
					) {
						applyOrRefreshMonsterBleed(monster, {
							damagePerTick: projectile.applyBleedDamagePerTick ?? 0,
							tickIntervalMs: projectile.applyBleedTickIntervalMs ?? 0,
							maxTicks: projectile.applyBleedMaxTicks ?? 0,
							now
						});
					}
					if ((projectile.applyKnockback ?? 0) > 0 && (projectile.applyKnockbackChance ?? 0) > 0) {
						const range = projectile.applyKnockbackRange ?? Infinity;
						if (
							distance(projectile.x, projectile.y, monster.x, monster.y) <= range + monster.radius &&
							Math.random() < (projectile.applyKnockbackChance ?? 0)
						) {
							const len = Math.hypot(projectile.vx, projectile.vy) || 1;
							monster.x += (projectile.vx / len) * (projectile.applyKnockback ?? 0);
							monster.y += (projectile.vy / len) * (projectile.applyKnockback ?? 0);
						}
					}

					if (monster.hp <= 0) {
						finalizeMonsterDeath(state, monster);
						defeatedMonster = true;
						audioManager.playDeath();
					}

					// piercing projectiles keep flying after hits
					if ((projectile.pierceRemaining ?? 0) > 0) {
						projectile.hitMonsterIds = [...(projectile.hitMonsterIds ?? []), monster.id];
						projectile.pierceRemaining = Math.max(0, (projectile.pierceRemaining ?? 0) - 1);
						const falloff = projectile.pierceDamageFalloffMultiplier ?? 0.6;
						projectile.damage = Math.max(1, Math.round(projectile.damage * falloff));
						hit = false;
						break;
					}

					hit = true;
					break;
				}
			}
		}

		if (!hit) next.push(projectile);
	}

	state.projectiles = next;
	if (defeatedMonster) {
		removeDefeatedMonsters(state);
	}
}

function applyOrRefreshMonsterBleed(
	monster: GameState['monsters'][number],
	options: {
		damagePerTick: number;
		tickIntervalMs: number;
		maxTicks: number;
		now: number;
	}
) {
	const statusEffects = monster.statusEffects ?? [];
	const existingBleed = statusEffects.find(
		(statusEffect) => statusEffect.kind === 'bleed' && statusEffect.source === 'scatter'
	);
	if (existingBleed) {
		existingBleed.damagePerTick = options.damagePerTick;
		existingBleed.tickIntervalMs = options.tickIntervalMs;
		existingBleed.remainingTicks = options.maxTicks;
		monster.statusEffects = [...statusEffects];
		return;
	}

	monster.statusEffects = [
		...statusEffects,
		{
			id: `bleed_${monster.id}`,
			kind: 'bleed',
			source: 'scatter',
			damagePerTick: options.damagePerTick,
			tickIntervalMs: options.tickIntervalMs,
			nextTickAt: options.now + options.tickIntervalMs,
			remainingTicks: options.maxTicks
		}
	];
}

function resolveMissileTarget(state: GameState, projectile: GameState['projectiles'][number]) {
	if (projectile.targetMonsterId) {
		const lockedTarget = state.monsters.find(
			(monster) => monster.id === projectile.targetMonsterId && !monster.isDead
		);
		if (lockedTarget) {
			return lockedTarget;
		}
	}

	let nearest = null;
	let bestDistance = Infinity;
	for (const monster of state.monsters) {
		if (monster.isDead) continue;
		const nextDistance = distance(projectile.x, projectile.y, monster.x, monster.y);
		if (nextDistance < bestDistance) {
			nearest = monster;
			bestDistance = nextDistance;
		}
	}
	return nearest;
}
