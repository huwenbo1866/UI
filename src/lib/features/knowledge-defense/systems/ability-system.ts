import {
	ABILITY_COOLDOWN_MS,
	ABILITY_PULSE_DAMAGE,
	ABILITY_PULSE_HEAL_ON_HIT,
	ABILITY_PULSE_IFRAME_MS,
	ABILITY_PULSE_KNOCKBACK,
	ABILITY_PULSE_MAX_HEAL,
	ABILITY_PULSE_RADIUS
} from '../config/constants';
import type { GameState } from '../core/types';
import { distance } from '../core/utils';
import { markMonsterHit } from './combat-feedback-system';
import { gainExpForKill } from './progression-system';
import { audioManager } from './audio-manager';

export function tickAbilityCooldown(state: GameState, dtMs: number) {
	state.runtime.abilityCooldownMs = Math.max(0, state.runtime.abilityCooldownMs - dtMs);
}

export function castPulseAbility(state: GameState): boolean {
	if (state.runtime.abilityCooldownMs > 0 || state.player.hp <= 0) return false;

	let hitCount = 0;
	for (const monster of state.monsters) {
		if (monster.isDead) continue;
		const d = distance(state.player.x, state.player.y, monster.x, monster.y);
		if (d > ABILITY_PULSE_RADIUS + monster.radius) continue;

		hitCount += 1;
		monster.hp = Math.max(0, monster.hp - ABILITY_PULSE_DAMAGE);
		markMonsterHit(state, monster, ABILITY_PULSE_DAMAGE);

		const nx = (monster.x - state.player.x) / (d || 1);
		const ny = (monster.y - state.player.y) / (d || 1);
		monster.x += nx * ABILITY_PULSE_KNOCKBACK;
		monster.y += ny * ABILITY_PULSE_KNOCKBACK;

		if (monster.hp <= 0) {
			monster.isDead = true;
			state.battle.kills += 1;
			gainExpForKill(state);
			audioManager.playDeath();
		}
	}

	if (hitCount > 0) {
		const heal = Math.min(ABILITY_PULSE_MAX_HEAL, hitCount * ABILITY_PULSE_HEAL_ON_HIT);
		state.player.hp = Math.min(state.player.maxHp, state.player.hp + heal);
		audioManager.playHit();
	}

	state.runtime.abilityCooldownMs = ABILITY_COOLDOWN_MS;
	state.runtime.abilityPulseFxMs = 320;
	state.player.contactInvulnMs = Math.max(state.player.contactInvulnMs, ABILITY_PULSE_IFRAME_MS);
	state.monsters = state.monsters.filter((monster) => !monster.isDead);
	return true;
}
