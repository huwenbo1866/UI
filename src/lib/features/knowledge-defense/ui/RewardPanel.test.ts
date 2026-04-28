import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';

import RewardPanel from './RewardPanel.svelte';

describe('RewardPanel', () => {
	it('renders the reward-answer explanation that correct answers refresh pulse', () => {
		const { body } = render(RewardPanel, {
			props: {
				choices: [],
				feedback: null,
				feedbackKind: null
			}
		});

		expect(body).toContain('战术抉择 · 奖励答题');
		expect(body).toContain('答对可领取完整奖励、立刻回脉冲并存 1 层超载');
	});
});
