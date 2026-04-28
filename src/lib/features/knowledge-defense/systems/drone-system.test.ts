import { afterEach, describe, expect, it, vi } from 'vitest';

import { samplePack } from '../data/sample-pack';
import { DRONE_MAX_ACTIVE, MAX_ACTIVE_LASERS } from '../config/constants';
import { createInitialGameState } from '../state/game-store';
import { addDrone, updateDrones } from './drone-system';

afterEach(() => {
	vi.restoreAllMocks();
});

describe('updateDrones', () => {
	it('distributes drones across similar nearby targets', () => {
		const state = createInitialGameState(samplePack, 1200, 820, 'straight');
		addDrone(state);
		addDrone(state);
		state.monsters = [
			{
				id: 'm1',
				difficulty: 'easy',
				x: state.player.x + 120,
				y: state.player.y - 20,
				radius: 22,
				hp: 100,
				maxHp: 100,
				speed: 45,
				damage: 10,
				isDead: false,
				hurtFlashMs: 0,
				attackCooldownMs: 280,
				attackState: 'idle',
				attackWindupMs: 0,
				moving: false,
				moveDirX: 0,
				moveDirY: 1
			},
			{
				id: 'm2',
				difficulty: 'easy',
				x: state.player.x + 118,
				y: state.player.y + 24,
				radius: 22,
				hp: 100,
				maxHp: 100,
				speed: 45,
				damage: 10,
				isDead: false,
				hurtFlashMs: 0,
				attackCooldownMs: 280,
				attackState: 'idle',
				attackWindupMs: 0,
				moving: false,
				moveDirX: 0,
				moveDirY: 1
			}
		];

		updateDrones(state, 0.1, 100);

		const targetIds = new Set(state.drones.map((drone) => drone.targetMonsterId));
		expect(targetIds.size).toBeGreaterThan(1);
	});

	it('keeps multiple drones in distinct combat positions on one target', () => {
		const state = createInitialGameState(samplePack, 1200, 820, 'straight');
		addDrone(state);
		addDrone(state);
		state.monsters = [
			{
				id: 'm1',
				difficulty: 'easy',
				x: state.player.x + 140,
				y: state.player.y,
				radius: 22,
				hp: 500,
				maxHp: 500,
				speed: 45,
				damage: 10,
				isDead: false,
				hurtFlashMs: 0,
				attackCooldownMs: 280,
				attackState: 'idle',
				attackWindupMs: 0,
				moving: false,
				moveDirX: 0,
				moveDirY: 1
			}
		];

		for (let i = 0; i < 12; i += 1) updateDrones(state, 0.1, 100);

		const [a, b] = state.drones;
		expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(20);
	});

	it('spawns shared battlefield drops when drones secure a kill', () => {
		const state = createInitialGameState(samplePack, 1200, 820, 'straight');
		vi.spyOn(Math, 'random').mockReturnValue(0);
		addDrone(state);
		state.drones[0].cooldownMs = 0;
		state.monsters = [
			{
				id: 'drop-target',
				difficulty: 'easy',
				x: state.player.x + 80,
				y: state.player.y,
				radius: 22,
				hp: 50,
				maxHp: 50,
				speed: 0,
				damage: 10,
				isDead: false,
				hurtFlashMs: 0,
				attackCooldownMs: 280,
				attackState: 'idle',
				attackWindupMs: 0,
				moving: false,
				moveDirX: 0,
				moveDirY: 1
			}
		];

		updateDrones(state, 0.1, 100);

		expect(state.battle.kills).toBe(1);
		expect(state.battlefieldDrops).toHaveLength(1);
		expect(state.battlefieldDrops[0].kind).toBe('weapon');
	});

	it('does not let a second drone fire into a monster already killed earlier in the same tick', () => {
		const state = createInitialGameState(samplePack, 1200, 820, 'straight');
		vi.spyOn(Math, 'random').mockReturnValue(0);
		addDrone(state);
		addDrone(state);
		state.drones[0].cooldownMs = 0;
		state.drones[1].cooldownMs = 0;
		state.monsters = [
			{
				id: 'solo-target',
				difficulty: 'easy',
				x: state.player.x + 80,
				y: state.player.y,
				radius: 22,
				hp: 50,
				maxHp: 50,
				speed: 0,
				damage: 10,
				isDead: false,
				hurtFlashMs: 0,
				attackCooldownMs: 280,
				attackState: 'idle',
				attackWindupMs: 0,
				moving: false,
				moveDirX: 0,
				moveDirY: 1
			}
		];

		updateDrones(state, 0.1, 100);

		expect(state.battle.kills).toBe(1);
		expect(state.lasers).toHaveLength(1);
		expect(state.drones[1].cooldownMs).toBe(0);
	});

	it('caps drone growth and trims old laser effects under heavy reward spam', () => {
		const state = createInitialGameState(samplePack, 1200, 820, 'straight');

		for (let index = 0; index < DRONE_MAX_ACTIVE + 3; index += 1) {
			addDrone(state);
		}

		expect(state.drones).toHaveLength(DRONE_MAX_ACTIVE);

		vi.spyOn(Math, 'random').mockReturnValue(0);
		state.monsters = [
			{
				id: 'laser-target',
				difficulty: 'hard',
				x: state.player.x + 80,
				y: state.player.y,
				radius: 30,
				hp: 9999,
				maxHp: 9999,
				speed: 0,
				damage: 10,
				isDead: false,
				hurtFlashMs: 0,
				attackCooldownMs: 280,
				attackState: 'idle',
				attackWindupMs: 0,
				moving: false,
				moveDirX: 0,
				moveDirY: 1
			}
		];
		for (const drone of state.drones) {
			drone.cooldownMs = 0;
		}

		for (let frame = 0; frame < 20; frame += 1) {
			for (const drone of state.drones) {
				drone.cooldownMs = 0;
			}
			updateDrones(state, 0.1, 100);
		}

		expect(state.lasers.length).toBeLessThanOrEqual(MAX_ACTIVE_LASERS);
	});
});
