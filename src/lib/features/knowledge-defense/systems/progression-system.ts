import {
  EXP_BOOST_DURATION_MS,
  EXP_BOOST_MULTIPLIER,
  EXP_PER_KILL,
  WEAPON_REWARD_USES,
  getTotalExpRequiredForLevel
} from '../config/constants';
import type { GameState, RewardKind } from '../core/types';
import { closeRewardPanel } from './reward-system';

export function gainExpForKill(state: GameState) {
  const now = Date.now();
  const multiplier = now < state.buffs.expBoostUntil ? EXP_BOOST_MULTIPLIER : 1;
  state.progress.exp += Math.round(EXP_PER_KILL * multiplier);
  checkLevelUps(state);
}

export function checkLevelUps(state: GameState) {
  while (state.progress.exp >= state.progress.nextLevelTotalExp) {
    state.progress.level += 1;
    state.progress.pendingLevelUps += 1;
    state.progress.nextLevelTotalExp = getTotalExpRequiredForLevel(state.progress.level + 1);
  }
}

export function applyRewardByKind(state: GameState, rewardKind: RewardKind) {
  if (rewardKind === 'weapon') {
    state.buffs.queuedWeaponBuff = state.settings.attackPreference === 'straight' ? 'straight4' : 'scatter7';
    state.buffs.queuedWeaponBuffUses = WEAPON_REWARD_USES;
    closeRewardPanel(state);
    return;
  }

  if (rewardKind === 'xp') {
    state.buffs.expBoostUntil = Date.now() + EXP_BOOST_DURATION_MS;
    closeRewardPanel(state);
    return;
  }

  if (rewardKind === 'drone') {
    // 具体添加无人机由外层系统执行，避免循环依赖
    closeRewardPanel(state);
  }
}
