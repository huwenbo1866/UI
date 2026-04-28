import { describe, expect, it, vi } from 'vitest';

import { samplePack } from '../data/sample-pack';
import {
	DRONE_MAX_ACTIVE,
	MAX_ACTIVE_DAMAGE_TEXTS,
	MAX_ACTIVE_LASERS
} from '../config/constants';
import { createInitialGameState } from '../state/game-store';
import { tickAbilityCooldown } from './ability-system';
import { tickAttackSequences, tickAutoAttack } from './auto-attack-system';
import { tickDamageTexts } from './combat-feedback-system';
import { addDrone, updateDrones } from './drone-system';
import { updateMonsters } from './monster-system';
import { updateProjectiles } from './projectile-system';

describe('knowledge-defense performance smoke', () => {
	it('keeps drones and transient effects bounded through a dense combat simulation', () => {
		const state = createInitialGameState(samplePack, 1200, 820, 'scatter');
		vi.spyOn(Math, 'random').mockReturnValue(0.2);

		for (let index = 0; index < DRONE_MAX_ACTIVE + 2; index += 1) {
			addDrone(state);
		}

		state.monsters = Array.from({ length: 8 }, (_, index) => ({
			id: `monster-${index}`,
			difficulty: index % 3 === 0 ? 'hard' : index % 2 === 0 ? 'medium' : 'easy',
			x: 160 + index * 90,
			y: 180 + (index % 4) * 120,
			radius: index % 3 === 0 ? 30 : index % 2 === 0 ? 26 : 22,
			hp: 280,
			maxHp: 280,
			speed: 45,
			damage: 20,
			isDead: false,
			hurtFlashMs: 0,
			attackCooldownMs: 0,
			attackState: 'idle',
			attackWindupMs: 0,
			moving: false,
			moveDirX: 0,
			moveDirY: 1
		}));

		for (let frame = 0; frame < 80; frame += 1) {
			updateMonsters(state, 0.1, 100);
			tickAutoAttack(state, 100);
			tickAttackSequences(state, 100);
			tickAbilityCooldown(state, 100);
			updateProjectiles(state, 0.1);
			for (const drone of state.drones) {
				drone.cooldownMs = 0;
			}
			updateDrones(state, 0.1, 100);
			tickDamageTexts(state, 0.1, 100);
		}

		expect(state.drones).toHaveLength(DRONE_MAX_ACTIVE);
		expect(state.lasers.length).toBeLessThanOrEqual(MAX_ACTIVE_LASERS);
		expect(state.damageTexts.length).toBeLessThanOrEqual(MAX_ACTIVE_DAMAGE_TEXTS);
		expect(state.player.hp).toBeGreaterThanOrEqual(0);
	});
});
