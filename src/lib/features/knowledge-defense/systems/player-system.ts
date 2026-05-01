import { BATTLEFIELD_DROP_FEEDBACK_TTL_MS, PLAYER_CONTACT_IFRAME_MS } from '../config/constants';
import { getBattlefieldDropDefinitionById } from '../data/drop-definitions';
import type { GameState, PlayerDamageSource } from '../core/types';
import { clamp } from '../core/utils';
import type { InputState } from '../adapters/input-adapter';
import { markPlayerHit } from './combat-feedback-system';
import { consumeShieldBlock, resolveMoveSpeedMultiplier } from './progression-system';

function consumeShieldAndShowFeedback(state: GameState) {
	if (!consumeShieldBlock(state)) {
		return false;
	}

	const definition = getBattlefieldDropDefinitionById('drop_guard_shield');
	state.player.contactInvulnMs = Math.max(state.player.contactInvulnMs, 260);
	state.ui.pickupFeedback = {
		kind: definition.kind,
		definitionId: definition.id,
		title: '护盾触发',
		detail: '已抵挡这次伤害',
		ttlMs: BATTLEFIELD_DROP_FEEDBACK_TTL_MS
	};
	return true;
}

function applyTaggedPlayerDamage(
	state: GameState,
	damage: number,
	source: PlayerDamageSource,
	contactInvulnMs: number
) {
	const now = Date.now();
	const mitigation = state.buffs.damageMitigation;
	const multiplier = mitigation && mitigation.until > now ? mitigation.multiplier : 1;
	const mitigatedDamage = damage * multiplier;
	const nextHp = Math.max(0, state.player.hp - mitigatedDamage);
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

  if (state.runtime.dashRemainingMs > 0) {
    const dashDtMs = Math.min(dtMs, state.runtime.dashRemainingMs);
    const dashDtSeconds = dashDtMs / 1000;
    player.moving = true;
    player.moveDirX = state.runtime.dashDirectionX;
    player.moveDirY = state.runtime.dashDirectionY;
    player.x = clamp(
      player.x + state.runtime.dashDirectionX * state.runtime.dashSpeed * dashDtSeconds,
      player.radius,
      state.width - player.radius
    );
    player.y = clamp(
      player.y + state.runtime.dashDirectionY * state.runtime.dashSpeed * dashDtSeconds,
      player.radius,
      state.height - player.radius
    );
    state.runtime.dashRemainingMs = Math.max(0, state.runtime.dashRemainingMs - dtMs);

    if (player.contactInvulnMs > 0) {
      player.contactInvulnMs = Math.max(0, player.contactInvulnMs - dtMs);
    }
    player.hurtFlashMs = Math.max(0, player.hurtFlashMs - dtMs);
    return;
  }

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

	const effectiveSpeed = player.speed * resolveMoveSpeedMultiplier(state);
	player.x = clamp(
		player.x + dx * effectiveSpeed * dtSeconds,
		player.radius,
		state.width - player.radius
	);
	player.y = clamp(
		player.y + dy * effectiveSpeed * dtSeconds,
		player.radius,
		state.height - player.radius
	);

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
	if (consumeShieldAndShowFeedback(state)) return;
	applyTaggedPlayerDamage(state, damage, source, PLAYER_CONTACT_IFRAME_MS);
}

export function applyContinuousPlayerDamage(
	state: GameState,
	damagePerSecond: number,
	dtSeconds: number,
	source: PlayerDamageSource = 'melee'
) {
	if (state.player.contactInvulnMs > 0) return;
	if (consumeShieldAndShowFeedback(state)) return;
	const damage = damagePerSecond * dtSeconds;
	applyTaggedPlayerDamage(state, damage, source, 0);
}
