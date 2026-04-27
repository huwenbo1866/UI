import { describe, expect, it } from 'vitest';

import { samplePack } from '../data/sample-pack';
import { createInitialGameState } from '../state/game-store';
import { castPulseAbility } from './ability-system';

describe('castPulseAbility', () => {
	it('damages nearby monsters, grants cooldown/fx, and heals the player', () => {
		const state = createInitialGameState(samplePack, 1200, 820, 'straight');
		state.player.hp = 120;
		state.monsters = [
			{
				id: 'near',
				difficulty: 'easy',
				x: state.player.x + 40,
				y: state.player.y,
				radius: 22,
				hp: 60,
				maxHp: 60,
				speed: 45,
				damage: 10,
				isDead: false,
				hurtFlashMs: 0,
				attackCooldownMs: 0,
				attackWindupMs: 0,
				moveDirX: 0,
				moveDirY: 1
			},
			{
				id: 'far',
				difficulty: 'easy',
				x: state.player.x + 500,
				y: state.player.y,
				radius: 22,
				hp: 60,
				maxHp: 60,
				speed: 45,
				damage: 10,
				isDead: false,
				hurtFlashMs: 0,
				attackCooldownMs: 0,
				attackWindupMs: 0,
				moveDirX: 0,
				moveDirY: 1
			}
		];

		const casted = castPulseAbility(state);

		expect(casted).toBe(true);
		expect(state.runtime.abilityCooldownMs).toBeGreaterThan(0);
		expect(state.runtime.abilityPulseFxMs).toBeGreaterThan(0);
		expect(state.player.hp).toBeGreaterThan(120);
		expect(state.battle.kills).toBe(1);
		expect(state.monsters).toHaveLength(1);
		expect(state.monsters[0].id).toBe('far');
	});

	it('does nothing while the ability is on cooldown', () => {
		const state = createInitialGameState(samplePack, 1200, 820, 'straight');
		state.runtime.abilityCooldownMs = 3000;

		const casted = castPulseAbility(state);

		expect(casted).toBe(false);
		expect(state.runtime.abilityCooldownMs).toBe(3000);
	});
});
