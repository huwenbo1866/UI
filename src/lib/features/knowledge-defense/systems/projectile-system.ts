import type { GameState, MonsterState } from '../core/types';
import { clamp, distance } from '../core/utils';
import { gainExpForKill } from './progression-system';
import { audioManager } from './audio-manager';

function handleMonsterKilled(state: GameState, monster: MonsterState) {
  monster.isDead = true;
  state.battle.kills += 1;
  gainExpForKill(state);
}

export function updateProjectiles(state: GameState, dtSeconds: number) {
  const next = [];

  for (const projectile of state.projectiles) {
    projectile.x += projectile.vx * dtSeconds;
    projectile.y += projectile.vy * dtSeconds;

    if (projectile.x < 0 || projectile.x > state.width || projectile.y < 0 || projectile.y > state.height) {
      continue;
    }

    let hit = false;

    for (const monster of state.monsters) {
      if (monster.isDead) continue;

      if (distance(projectile.x, projectile.y, monster.x, monster.y) <= projectile.radius + monster.radius) {
        monster.hp = clamp(monster.hp - projectile.damage, 0, monster.maxHp);
        hit = true;

        // 怪物被击中音效
        audioManager.playHit();

        if (monster.hp <= 0) {
          handleMonsterKilled(state, monster);
          // 怪物死亡音效
          audioManager.playDeath();
        }
        break;
      }
    }

    if (!hit) next.push(projectile);
  }

  state.projectiles = next;
  state.monsters = state.monsters.filter((monster) => !monster.isDead);
}
