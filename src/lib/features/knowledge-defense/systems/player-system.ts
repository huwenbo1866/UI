import { PLAYER_CONTACT_IFRAME_MS } from '../config/constants';
import type { GameState } from '../core/types';
import { clamp } from '../core/utils';
import type { InputState } from '../adapters/input-adapter';

export function updatePlayer(state: GameState, input: InputState, dtSeconds: number, dtMs: number) {
  const player = state.player;

  let dx = 0;
  let dy = 0;

  if (input.touchActive) {
    dx = input.touchDir.x;
    dy = input.touchDir.y;
  } else {
    dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    const len = Math.hypot(dx, dy);
    if (len > 0) {
      dx /= len;
      dy /= len;
    }
  }

  player.x = clamp(player.x + dx * player.speed * dtSeconds, player.radius, state.width - player.radius);
  player.y = clamp(player.y + dy * player.speed * dtSeconds, player.radius, state.height - player.radius);

  if (player.contactInvulnMs > 0) {
    player.contactInvulnMs = Math.max(0, player.contactInvulnMs - dtMs);
  }
}

// 原有接触扣血（保留不动）
export function applyPlayerContactDamage(state: GameState, damage: number) {
  if (state.player.contactInvulnMs > 0) return;
  state.player.hp = Math.max(0, state.player.hp - damage);
  state.player.contactInvulnMs = PLAYER_CONTACT_IFRAME_MS;
}

// 新增：怪物贴身时的**连续扣血**（每秒30滴血）
export function applyContinuousPlayerDamage(state: GameState, damagePerSecond: number, dtSeconds: number) {
  if (state.player.contactInvulnMs > 0) return;   // 仍保留短暂无敌帧
  const damage = damagePerSecond * dtSeconds;
  state.player.hp = Math.max(0, state.player.hp - damage);
}