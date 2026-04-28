import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';

import RunSummaryPanel from './RunSummaryPanel.svelte';

describe('RunSummaryPanel', () => {
	it('renders the defeat reason, key stats, actionable tips, and follow-up actions', () => {
		const { body } = render(RunSummaryPanel, {
			props: {
				summary: {
					primaryDefeatReason: '主要败因：冲刺突进',
					explanation: '最后一击判定为冲刺突进，本局它共命中 2 次，造成 80 点伤害，占承伤 73%。',
					survivalTimeMs: 68000,
					survivalTimeLabel: '1 分 08 秒',
					levelReached: 4,
					kills: 9,
					correct: 3,
					wrong: 4,
					accuracy: 3 / 7,
					accuracyLabel: '43%',
					pendingRewards: 2,
					tips: [
						'中型怪读出“冲刺”后会锁定方向，下局看到提示就立刻横向拉开。',
						'倒下时还有 2 次待领奖励，下局升级后记得及时打开奖励面板补强。',
						'本局答题准确率只有 43%，先去错题集复盘高频错题，再回来冲更深层数。'
					]
				}
			}
		});

		expect(body).toContain('本局复盘');
		expect(body).toContain('主要败因：冲刺突进');
		expect(body).toContain('1 分 08 秒');
		expect(body).toContain('Lv.4');
		expect(body).toContain('43%');
		expect(body).toContain('待领奖励');
		expect(body).toContain('下局建议');
		expect(body).toContain('答题准确率只有 43%');
		expect(body).toContain('重新开始');
		expect(body).toContain('返回启动页');
	});
});
