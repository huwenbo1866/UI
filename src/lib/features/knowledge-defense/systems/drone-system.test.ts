import { afterEach, describe, expect, it, vi } from 'vitest';

import { samplePack } from '../data/sample-pack';
import { createInitialGameState } from '../state/game-store';
import { addDrone, updateDrones } from './drone-system';

afterEach(() => {
	vi.restoreAllMocks();
});

describe('updateDrones', () => {
	it('adds drones using the older orbiting state shape', () => {
		const state = createInitialGameState(samplePack, 1200, 820, 'straight');

		const added = addDrone(state);

		expect(added).toBe(true);
		expect(state.drones).toHaveLength(1);
		expect(state.drones[0]).toMatchObject({
			targetMonsterId: null,
			cooldownMs: 0,
			moveDirX: 0,
			moveDirY: -1,
			formationSlot: 0
		});
	});

	it('finalizes drone kills through the shared monster death pipeline', () => {
		const state = createInitialGameState(samplePack, 1200, 820, 'straight');
		vi.spyOn(Math, 'random').mockReturnValue(1);

		state.monsters = [
			{
				id: 'drone-target',
				difficulty: 'easy',
				x: 640,
				y: 410,
				radius: 22,
				hp: 40,
				maxHp: 40,
				speed: 45,
				damage: 10,
				isDead: false,
				hurtFlashMs: 0,
				attackCooldownMs: 0,
				attackState: 'idle',
				attackWindupMs: 0,
				moving: false,
				moveDirX: 0,
				moveDirY: 1
			}
		];
		state.drones = [
			{
				id: 'drone-1',
				x: 620,
				y: 410,
				orbitAngle: 0,
				cooldownMs: 0,
				targetMonsterId: 'drone-target',
				moveDirX: 0,
				moveDirY: -1,
				formationSlot: 0
			}
		];

		updateDrones(state, 0.016, 16);

		expect(state.battle.kills).toBe(1);
		expect(state.monsters).toHaveLength(0);
		expect(state.drones[0].targetMonsterId).toBeNull();
	});

	it('creates a drone laser effect when attacking in range', () => {
		const state = createInitialGameState(samplePack, 1200, 820, 'straight');
		state.monsters = [
			{
				id: 'laser-target',
				difficulty: 'easy',
				x: 650,
				y: 410,
				radius: 22,
				hp: 100,
				maxHp: 100,
				speed: 45,
				damage: 10,
				isDead: false,
				hurtFlashMs: 0,
				attackCooldownMs: 0,
				attackState: 'idle',
				attackWindupMs: 0,
				moving: false,
				moveDirX: 0,
				moveDirY: 1
			}
		];
		state.drones = [
			{
				id: 'drone-1',
				x: 620,
				y: 410,
				orbitAngle: 0,
				cooldownMs: 0,
				targetMonsterId: 'laser-target',
				moveDirX: 0,
				moveDirY: -1,
				formationSlot: 0
			}
		];

		updateDrones(state, 0.016, 16);

		expect(state.lasers.length).toBeGreaterThan(0);
		expect(state.lasers[0].from).toEqual({ x: 620, y: 410 });
		expect(state.lasers[0].to).toEqual({ x: 650, y: 410 });
	});

	it('does not age shared lasers inside updateDrones because the main loop already uses tickLasers', () => {
		const state = createInitialGameState(samplePack, 1200, 820, 'straight');
		state.lasers = [
			{
				id: 'existing-laser',
				from: { x: 600, y: 410 },
				to: { x: 700, y: 410 },
				ttlMs: 140
			}
		];

		updateDrones(state, 0.016, 16);

		expect(state.lasers[0].ttlMs).toBe(140);
	});
});
