import { describe, expect, it } from 'vitest';

import { samplePack } from '../data/sample-pack';
import { createInitialGameState } from '../state/game-store';
import { applyRewardByDefinitionId } from './progression-system';

describe('applyRewardByDefinitionId', () => {
	it('routes generic weapon upgrade by the currently equipped main weapon', () => {
		const straightState = createInitialGameState(samplePack, 1200, 820, 'straight');
		applyRewardByDefinitionId(straightState, 'reward_weapon_upgrade');
		expect(straightState.buffs.queuedWeaponBuffWeaponId).toBe('weapon_buff_straight4');

		const scatterState = createInitialGameState(samplePack, 1200, 820, 'scatter');
		applyRewardByDefinitionId(scatterState, 'reward_weapon_upgrade');
		expect(scatterState.buffs.queuedWeaponBuffWeaponId).toBe('weapon_buff_scatter7');
	});

	it('applies laser and karate weapon upgrades as permanent 50 percent growth', () => {
		const laserState = createInitialGameState(samplePack, 1200, 820, 'straight');
		laserState.loadout.mainWeaponId = 'weapon_main_laser';
		applyRewardByDefinitionId(laserState, 'reward_weapon_upgrade');
		expect(laserState.build.mods.laserRangeMultiplier).toBe(1.5);
		expect(laserState.build.mods.laserWidthMultiplier).toBe(1.5);

		const karateState = createInitialGameState(samplePack, 1200, 820, 'straight');
		karateState.loadout.mainWeaponId = 'weapon_main_karate';
		applyRewardByDefinitionId(karateState, 'reward_weapon_upgrade');
		expect(karateState.build.mods.karateRangeMultiplier).toBe(1.5);
	});

	it('fires a rapid ten-missile volley for missile weapon upgrades', () => {
		const missileState = createInitialGameState(samplePack, 1200, 820, 'straight');
		missileState.loadout.mainWeaponId = 'weapon_main_missile';

		applyRewardByDefinitionId(missileState, 'reward_weapon_upgrade');

		expect(missileState.attackSequences).toHaveLength(1);
		expect(missileState.attackSequences[0]).toMatchObject({
			weaponDefinitionId: 'weapon_main_missile',
			pattern: 'missileBurst',
			shotsRemaining: 10
		});
	});
});
