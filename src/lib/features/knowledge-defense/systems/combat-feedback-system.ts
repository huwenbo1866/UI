import { MAX_ACTIVE_DAMAGE_TEXTS } from '../config/constants';
import type { DamageTextState, GameState, MonsterState } from '../core/types';
import { uid } from '../core/utils';

const DAMAGE_TEXT_TTL_MS = 520;
const HURT_FLASH_MS = 160;

export function pushDamageText(
  state: GameState,
  x: number,
  y: number,
  amount: number,
  color = '#ff4d4f'
) {
  const value = Math.max(1, Math.round(amount));
	const item: DamageTextState = {
    id: uid('dmg'),
    x,
    y,
    value,
    color,
		ttlMs: DAMAGE_TEXT_TTL_MS,
		driftSpeed: 42 + Math.random() * 18
	};
	state.damageTexts.push(item);
	if (state.damageTexts.length > MAX_ACTIVE_DAMAGE_TEXTS) {
		state.damageTexts.splice(0, state.damageTexts.length - MAX_ACTIVE_DAMAGE_TEXTS);
	}
}

export function tickDamageTexts(state: GameState, dtSeconds: number, dtMs: number) {
	const nextDamageTexts: DamageTextState[] = [];
	for (const item of state.damageTexts) {
		item.ttlMs -= dtMs;
		item.y -= item.driftSpeed * dtSeconds;
		if (item.ttlMs > 0) {
			nextDamageTexts.push(item);
		}
	}
	state.damageTexts = nextDamageTexts;
}

export function markPlayerHit(state: GameState, amount: number) {
  state.player.hurtFlashMs = HURT_FLASH_MS;
  pushDamageText(state, state.player.x, state.player.y - state.player.radius - 10, amount);
}

export function markMonsterHit(state: GameState, monster: MonsterState, amount: number) {
  monster.hurtFlashMs = HURT_FLASH_MS;
  pushDamageText(state, monster.x, monster.y - monster.radius - 8, amount);
}
