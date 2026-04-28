import { PLAYER_CONTACT_IFRAME_MS } from '../config/constants';
import type { GameState, PlayerDamageSource } from '../core/types';
import { clamp } from '../core/utils';
import type { InputState } from '../adapters/input-adapter';
import { markPlayerHit } from './combat-feedback-system';

function applyTaggedPlayerDamage(
	state: GameState,
	damage: number,
	source: PlayerDamageSource,
	contactInvulnMs: number
) {
	const nextHp = Math.max(0, state.player.hp - damage);
	const actualDamage = state.player.hp - nextHp;

	if (actualDamage <= 0) {
		return;
	}

	state.player.hp = nextHp;
	if (contactInvulnMs > 0) {
		state.player.contactInvulnMs = contactInvulnMs;
	}

	state.runTelemetry.totalDamageTaken += actualDamage;
	state.runTelemetry.damageBySource[source].damage += actualDamage;
	state.runTelemetry.damageBySource[source].hits += 1;
	state.runTelemetry.lastDamageSource = source;

	if (state.player.hp <= 0 && state.runTelemetry.defeatSource === null) {
		state.runTelemetry.defeatSource = source;
	}

	markPlayerHit(state, actualDamage);
}

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

  player.moving = Math.hypot(dx, dy) > 0.01;
  if (player.moving) {
    player.moveDirX = dx;
    player.moveDirY = dy;
  }

  player.x = clamp(player.x + dx * player.speed * dtSeconds, player.radius, state.width - player.radius);
  player.y = clamp(player.y + dy * player.speed * dtSeconds, player.radius, state.height - player.radius);

  if (player.contactInvulnMs > 0) {
    player.contactInvulnMs = Math.max(0, player.contactInvulnMs - dtMs);
  }
  player.hurtFlashMs = Math.max(0, player.hurtFlashMs - dtMs);
}

export function applyPlayerContactDamage(
	state: GameState,
	damage: number,
	source: PlayerDamageSource = 'melee'
) {
	if (state.player.contactInvulnMs > 0) return;
	applyTaggedPlayerDamage(state, damage, source, PLAYER_CONTACT_IFRAME_MS);
}

export function applyContinuousPlayerDamage(
	state: GameState,
	damagePerSecond: number,
	dtSeconds: number,
	source: PlayerDamageSource = 'melee'
) {
	if (state.player.contactInvulnMs > 0) return;
	const damage = damagePerSecond * dtSeconds;
	applyTaggedPlayerDamage(state, damage, source, 0);
}
