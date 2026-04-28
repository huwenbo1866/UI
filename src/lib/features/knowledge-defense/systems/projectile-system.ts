import type { GameState } from '../core/types';
import { clamp, distance } from '../core/utils';
import { audioManager } from './audio-manager';
import { finalizeMonsterDeath, removeDefeatedMonsters } from './battlefield-drop-system';
import { markMonsterHit } from './combat-feedback-system';
import { applyPlayerContactDamage } from './player-system';

export function updateProjectiles(state: GameState, dtSeconds: number) {
	const next = [];
	const dtMs = dtSeconds * 1000;
	let defeatedMonster = false;

	for (const projectile of state.projectiles) {
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

				if (
					distance(projectile.x, projectile.y, monster.x, monster.y) <=
					projectile.radius + monster.radius
				) {
					monster.hp = clamp(monster.hp - projectile.damage, 0, monster.maxHp);
					markMonsterHit(state, monster, projectile.damage);
					hit = true;

					// 怪物被击中音效
					audioManager.playHit();

					if (monster.hp <= 0) {
						finalizeMonsterDeath(state, monster);
						defeatedMonster = true;
						// 怪物死亡音效
						audioManager.playDeath();
					}
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
