import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';

import HudOverlay from './HudOverlay.svelte';

describe('HudOverlay', () => {
	it('keeps only the requested top HUD cards and the pulse card on the right', () => {
		const { body } = render(HudOverlay, {
			props: {
				hp: 58,
				maxHp: 200,
				level: 2,
				kills: 3,
				correct: 1,
				wrong: 1,
				pendingRewards: 1,
				modeName: 'Knowledge Defense / 知识防御',
				attackModeLabel: '散射',
				sourceLabel: '备用样例题源（Fallback）',
				sourceDetail: '当前还没选择知识库章节，系统先用备用样例题源帮助你熟悉玩法与操作。',
				sourceIsFallback: true,
				abilityCooldownMs: 0,
				pulseOverchargeStacks: 1,
				guidanceMessages: [
					{
						id: 'pending-reward',
						title: '有奖励待领',
						detail: '奖励不会自动弹出；看准空档后按空格或点击角色，答题后再继续推进。',
						tone: 'accent'
					}
				],
				activePickupBuffs: [],
				pickupFeedbackTitle: null,
				pickupFeedbackDetail: null,
				pickupFeedbackKind: null
			}
		});

		expect(body).toContain('HP');
		expect(body).toContain('战绩');
		expect(body).toContain('答题');
		expect(body).toContain('脉冲 · 超载×1');
		expect(body).toContain('可释放');
		expect(body).not.toContain('Knowledge Defense / 知识防御');
		expect(body).not.toContain('攻击偏好');
		expect(body).not.toContain('备用样例题源（Fallback）');
		expect(body).not.toContain('帮助 / 图例');
		expect(body).not.toContain('有奖励待领');
		expect(body).not.toContain('奖励待领 · 答对回脉冲');
	});
});
