import { buildRewardChoicesWithRound } from '../data/reward-questions';
import type { GameState } from '../core/types';
import { TIME_SCALE_NORMAL, TIME_SCALE_REWARD_PANEL } from '../config/constants';

function rememberRewardChoices(state: GameState) {
	const rewardIds = state.ui.rewardChoices.map((choice) => choice.rewardDefinitionId);
	const questionIds = state.ui.rewardChoices.map((choice) => choice.question.id);
	state.ui.recentRewardDefinitionIds = [...state.ui.recentRewardDefinitionIds, ...rewardIds].slice(-6);
	state.ui.recentQuestionIds = [...state.ui.recentQuestionIds, ...questionIds].slice(-6);
}

export function openRewardPanel(state: GameState) {
	if (state.ui.rewardChoices.length === 0) {
		state.ui.rewardChoices = buildRewardChoicesWithRound(state, state.battle.qaRound, state.ui.rewardRerollCount, 3, {
			excludedRewardDefinitionIds: state.ui.recentRewardDefinitionIds,
			excludedQuestionIds: state.ui.recentQuestionIds
		});
		rememberRewardChoices(state);
	}
  state.ui.showRewardPanel = true;
  state.ui.rewardFeedback = null;
  state.ui.rewardFeedbackKind = null;
  state.runtime.timeScale = TIME_SCALE_REWARD_PANEL;
}

export function rerollRewardPanel(state: GameState) {
	if (state.ui.rewardRerollsRemaining <= 0) {
		return;
	}
	state.ui.rewardRerollsRemaining -= 1;
	state.ui.rewardRerollCount += 1;
	state.ui.rewardChoices = buildRewardChoicesWithRound(state, state.battle.qaRound, state.ui.rewardRerollCount, 3, {
		excludedRewardDefinitionIds: state.ui.recentRewardDefinitionIds,
		excludedQuestionIds: state.ui.recentQuestionIds
	});
	rememberRewardChoices(state);
	state.ui.rewardFeedback = null;
	state.ui.rewardFeedbackKind = null;
	state.ui.showRewardPanel = true;
	state.runtime.timeScale = TIME_SCALE_REWARD_PANEL;
}

export function closeRewardPanel(state: GameState) {
  state.ui.showRewardPanel = false;
  state.ui.rewardFeedback = null;
  state.ui.rewardFeedbackKind = null;
  state.runtime.timeScale = TIME_SCALE_NORMAL;
}

export function resetRewardPanelState(state: GameState) {
	closeRewardPanel(state);
	state.ui.rewardChoices = [];
	state.ui.rewardRerollCount = 0;
}

export function clearRewardHistory(state: GameState) {
	state.ui.recentRewardDefinitionIds = [];
	state.ui.recentQuestionIds = [];
}
