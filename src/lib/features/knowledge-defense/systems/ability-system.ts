import {
	ABILITY_COOLDOWN_MS,
	ABILITY_PULSE_DAMAGE,
	ABILITY_PULSE_HEAL_ON_HIT,
	ABILITY_PULSE_IFRAME_MS,
	ABILITY_PULSE_KNOCKBACK,
	ABILITY_PULSE_MAX_HEAL,
	ABILITY_PULSE_OVERCHARGE_DAMAGE_BONUS,
	ABILITY_PULSE_OVERCHARGE_HEAL_ON_HIT_BONUS,
	ABILITY_PULSE_OVERCHARGE_IFRAME_BONUS_MS,
	ABILITY_PULSE_OVERCHARGE_MAX_HEAL_BONUS,
	ABILITY_PULSE_OVERCHARGE_MAX_STACKS,
	ABILITY_PULSE_OVERCHARGE_RADIUS_BONUS,
	ABILITY_PULSE_RADIUS
} from '../config/constants';
import type { GameState } from '../core/types';
import { distance } from '../core/utils';
import { finalizeMonsterDeath, removeDefeatedMonsters } from './battlefield-drop-system';
import { markMonsterHit } from './combat-feedback-system';
import { audioManager } from './audio-manager';

export function tickAbilityCooldown(state: GameState, dtMs: number) {
	state.runtime.abilityCooldownMs = Math.max(0, state.runtime.abilityCooldownMs - dtMs);
}

export function refreshPulseAbility(state: GameState) {
	state.runtime.abilityCooldownMs = 0;
}

export function grantPulseOvercharge(state: GameState, stacks = 1) {
	state.buffs.pulseOverchargeStacks = Math.min(
		ABILITY_PULSE_OVERCHARGE_MAX_STACKS,
		state.buffs.pulseOverchargeStacks + stacks
	);
}

export function castPulseAbility(state: GameState): boolean {
	if (state.runtime.abilityCooldownMs > 0 || state.player.hp <= 0) return false;

	const overcharged = state.buffs.pulseOverchargeStacks > 0;
	const pulseRadius = ABILITY_PULSE_RADIUS + (overcharged ? ABILITY_PULSE_OVERCHARGE_RADIUS_BONUS : 0);
	const pulseDamage = ABILITY_PULSE_DAMAGE + (overcharged ? ABILITY_PULSE_OVERCHARGE_DAMAGE_BONUS : 0);
	const healPerHit =
		ABILITY_PULSE_HEAL_ON_HIT + (overcharged ? ABILITY_PULSE_OVERCHARGE_HEAL_ON_HIT_BONUS : 0);
	const maxHeal =
		ABILITY_PULSE_MAX_HEAL + (overcharged ? ABILITY_PULSE_OVERCHARGE_MAX_HEAL_BONUS : 0);
	const iframeMs =
		ABILITY_PULSE_IFRAME_MS + (overcharged ? ABILITY_PULSE_OVERCHARGE_IFRAME_BONUS_MS : 0);

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
			audioManager.playDeath();
		}
	}

	if (hitCount > 0) {
		const heal = Math.min(maxHeal, hitCount * healPerHit);
		state.player.hp = Math.min(state.player.maxHp, state.player.hp + heal);
		audioManager.playHit();
	}

	state.runtime.abilityCooldownMs = ABILITY_COOLDOWN_MS;
	state.runtime.abilityPulseFxMs = 320;
	state.player.contactInvulnMs = Math.max(state.player.contactInvulnMs, iframeMs);
	if (overcharged) {
		state.buffs.pulseOverchargeStacks = Math.max(0, state.buffs.pulseOverchargeStacks - 1);
	}
	removeDefeatedMonsters(state);
	return true;
}
