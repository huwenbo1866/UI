import { describe, expect, it } from 'vitest';

import { samplePack } from '../data/sample-pack';
import { createInitialGameState } from '../state/game-store';
import { buildRewardChoicesWithRound } from '../data/reward-questions';
import { applyRewardByDefinitionId } from './progression-system';
import { resetRewardPanelState } from './reward-system';

describe('reward panel anti-repeat history', () => {
	it('persists recent reward/question history after a reward is applied', () => {
		const state = createInitialGameState(samplePack, 1200, 820, 'straight');
		state.ui.rewardChoices = buildRewardChoicesWithRound(state, 0);
		state.ui.recentRewardDefinitionIds = state.ui.rewardChoices.map((choice) => choice.rewardDefinitionId);
		state.ui.recentQuestionIds = state.ui.rewardChoices.map((choice) => choice.question.id);

		applyRewardByDefinitionId(state, state.ui.rewardChoices[0].rewardDefinitionId);

		expect(state.ui.rewardChoices).toEqual([]);
		expect(state.ui.recentRewardDefinitionIds.length).toBeGreaterThan(0);
		expect(state.ui.recentQuestionIds.length).toBeGreaterThan(0);
	});

	it('keeps anti-repeat history when panel state resets mid-run', () => {
		const state = createInitialGameState(samplePack, 1200, 820, 'straight');
		state.ui.rewardChoices = buildRewardChoicesWithRound(state, 0);
		state.ui.recentRewardDefinitionIds = ['reward_weapon_upgrade'];
		state.ui.recentQuestionIds = ['question-1'];

		resetRewardPanelState(state);

		expect(state.ui.rewardChoices).toEqual([]);
		expect(state.ui.recentRewardDefinitionIds).toEqual(['reward_weapon_upgrade']);
		expect(state.ui.recentQuestionIds).toEqual(['question-1']);
	});
});
