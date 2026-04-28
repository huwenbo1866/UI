import {
	BATTLEFIELD_DROP_HEAL_AMOUNT,
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

export function grantQueuedWeaponBuff(state: GameState, uses = WEAPON_REWARD_USES) {
	state.buffs.queuedWeaponBuff =
		state.settings.attackPreference === 'straight' ? 'straight4' : 'scatter7';
	state.buffs.queuedWeaponBuffUses = uses;
}

export function grantExpBoost(
	state: GameState,
	durationMs = EXP_BOOST_DURATION_MS,
	now = Date.now()
) {
	state.buffs.expBoostUntil = Math.max(state.buffs.expBoostUntil, now) + durationMs;
}

export function restorePlayerHealth(state: GameState, amount = BATTLEFIELD_DROP_HEAL_AMOUNT) {
	state.player.hp = Math.min(state.player.maxHp, state.player.hp + amount);
}

export function applyRewardByKind(state: GameState, rewardKind: RewardKind) {
	if (rewardKind === 'weapon') {
		grantQueuedWeaponBuff(state);
		closeRewardPanel(state);
		return;
	}

	if (rewardKind === 'xp') {
		grantExpBoost(state);
		closeRewardPanel(state);
		return;
	}

	if (rewardKind === 'drone') {
		// 具体添加无人机由外层系统执行，避免循环依赖
		closeRewardPanel(state);
		return;
	}
}
