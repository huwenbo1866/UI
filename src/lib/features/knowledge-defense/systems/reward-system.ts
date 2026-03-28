import { buildRewardChoicesWithRound } from '../data/reward-questions';
import type { GameState } from '../core/types';
import { TIME_SCALE_NORMAL, TIME_SCALE_REWARD_PANEL } from '../config/constants';

export function openRewardPanel(state: GameState) {
  state.ui.rewardChoices = buildRewardChoicesWithRound(
    state.pack,
    state.settings.attackPreference,
    state.battle.qaRound
  );
  state.ui.showRewardPanel = true;
  state.ui.rewardFeedback = null;
  state.ui.rewardFeedbackKind = null;
  state.runtime.timeScale = TIME_SCALE_REWARD_PANEL;
}

export function closeRewardPanel(state: GameState) {
  state.ui.showRewardPanel = false;
  state.ui.rewardChoices = [];
  state.ui.rewardFeedback = null;
  state.ui.rewardFeedbackKind = null;
  state.runtime.timeScale = TIME_SCALE_NORMAL;
}
