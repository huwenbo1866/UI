import { describe, expect, it } from 'vitest';

import { buildRewardChoicesWithRound } from './reward-questions';
import { samplePack } from './sample-pack';
import { createInitialGameState } from '../state/game-store';

describe('reward questions compatibility registry', () => {
	it('builds three distinct reward offers with registry-backed ids', () => {
		const state = createInitialGameState(samplePack, 1200, 820, 'straight');
		const choices = buildRewardChoicesWithRound(state, 0);
		const validRewardIds = new Set([
			'reward_buff_attack_speed',
			'reward_buff_damage',
			'reward_buff_move_speed',
			'reward_buff_shield',
			'reward_skill_dash',
			'reward_skill_karate',
			'reward_skill_pulse',
			'reward_weapon_upgrade',
			'reward_upgrade_straight_burst',
			'reward_upgrade_straight_trajectory',
			'reward_upgrade_straight_freeze',
			'reward_upgrade_straight_pierce',
			'reward_xp_boost'
		]);

		expect(choices).toHaveLength(3);
		expect(new Set(choices.map((choice) => choice.rewardDefinitionId)).size).toBe(3);
		for (const choice of choices) {
			expect(validRewardIds.has(choice.rewardDefinitionId)).toBe(true);
		}
	});

	it('avoids immediately excluded reward and question ids when enough alternatives exist', () => {
		const state = createInitialGameState(samplePack, 1200, 820, 'straight');
		const firstChoices = buildRewardChoicesWithRound(state, 0);
		const secondChoices = buildRewardChoicesWithRound(state, 0, 1, 3, {
			excludedRewardDefinitionIds: firstChoices.map((choice) => choice.rewardDefinitionId),
			excludedQuestionIds: firstChoices.map((choice) => choice.question.id)
		});

		expect(secondChoices).toHaveLength(3);
		expect(
			secondChoices.some((choice) =>
				firstChoices.some((previous) => previous.rewardDefinitionId === choice.rewardDefinitionId)
			)
		).toBe(false);
		expect(
			secondChoices.some((choice) =>
				firstChoices.some((previous) => previous.question.id === choice.question.id)
			)
		).toBe(false);
	});

	it('does not offer missile or laser acquisition rewards mid-run', () => {
		const straightState = createInitialGameState(samplePack, 1200, 820, 'straight');
		const straightChoices = buildRewardChoicesWithRound(straightState, 0);

		expect(
			straightChoices.some((choice) => choice.rewardDefinitionId === 'reward_weapon_missile')
		).toBe(false);
		expect(
			straightChoices.some((choice) => choice.rewardDefinitionId === 'reward_weapon_laser')
		).toBe(false);

		const scatterState = createInitialGameState(samplePack, 1200, 820, 'scatter');
		const scatterChoices = buildRewardChoicesWithRound(scatterState, 0);

		expect(
			scatterChoices.some((choice) => choice.rewardDefinitionId === 'reward_weapon_missile')
		).toBe(false);
		expect(
			scatterChoices.some((choice) => choice.rewardDefinitionId === 'reward_weapon_laser')
		).toBe(false);
	});
});
