import type { DeployableState, GameState } from '../core/types';
import { distance, uid } from '../core/utils';
import { finalizeMonsterDeath, removeDefeatedMonsters } from './battlefield-drop-system';
import { markMonsterHit } from './combat-feedback-system';

export function spawnBurnZone(
	state: GameState,
	x: number,
	y: number,
	radius: number,
	ttlMs: number,
	damagePerSecond: number
) {
	state.deployables.push({
		id: uid('deployable'),
		kind: 'burn_zone',
		owner: 'player',
		x,
		y,
		radius,
		ttlMs,
		damagePerSecond
	});
}

export function updateDeployables(state: GameState, dtSeconds: number, dtMs: number) {
	const remainingDeployables: DeployableState[] = [];
	let defeatedMonster = false;

	for (const deployable of state.deployables) {
		deployable.ttlMs = Math.max(0, deployable.ttlMs - dtMs);
		if (deployable.kind === 'burn_zone' && (deployable.damagePerSecond ?? 0) > 0) {
			for (const monster of state.monsters) {
				if (monster.isDead) continue;
				if (distance(deployable.x, deployable.y, monster.x, monster.y) > deployable.radius + monster.radius) {
					continue;
				}

				const damage = (deployable.damagePerSecond ?? 0) * dtSeconds;
				monster.hp = Math.max(0, monster.hp - damage);
				markMonsterHit(state, monster, damage);
				if (monster.hp <= 0) {
					finalizeMonsterDeath(state, monster);
					defeatedMonster = true;
				}
			}
		}

		if (deployable.ttlMs > 0) {
			remainingDeployables.push(deployable);
		}
	}

	state.deployables = remainingDeployables;
	if (defeatedMonster) {
		removeDefeatedMonsters(state);
	}
}
