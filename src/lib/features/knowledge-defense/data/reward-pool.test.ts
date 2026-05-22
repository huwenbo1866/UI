import { describe, expect, it } from 'vitest';

import { samplePack } from './sample-pack';
import { buildRewardOffers } from './reward-pool';
import { createInitialGameState } from '../state/game-store';

describe('buildRewardOffers', () => {
	it('uses upgrade-only pulse text and unlock-then-upgrade dash text', () => {
		const state = createInitialGameState(samplePack, 1200, 820, 'straight');
		const offers = buildRewardOffers(state, () => 0, 20);

		const pulseOffer = offers.find((offer) => offer.rewardDefinitionId === 'reward_skill_pulse');
		const dashOffer = offers.find((offer) => offer.rewardDefinitionId === 'reward_skill_dash');

		expect(pulseOffer?.tag).toBe('升级 · 技能');
		expect(pulseOffer?.description).toBe('脉冲当前冷却时间减少 20%。');
		expect(dashOffer?.tag).toBe('获取 · 技能');
		expect(dashOffer?.description).toBe('获取技能冲刺，向前冲刺一段距离并对沿路怪物造成伤害。');
	});

	it('updates dash and pulse upgrade descriptions after the skill is already owned', () => {
		const state = createInitialGameState(samplePack, 1200, 820, 'straight');
		state.build.skillLevels.skill_pulse = 2;
		state.build.skillLevels.skill_dash = 1;
		state.loadout.actionSlots.J = 'skill_dash';
		const offers = buildRewardOffers(state, () => 0, 20);

		const pulseOffer = offers.find((offer) => offer.rewardDefinitionId === 'reward_skill_pulse');
		const dashOffer = offers.find((offer) => offer.rewardDefinitionId === 'reward_skill_dash');

		expect(pulseOffer?.description).toBe('脉冲范围扩大为当前的 150%。');
		expect(dashOffer?.description).toBe('当前冲刺技能冷却时间减少 20%。');
	});
});
