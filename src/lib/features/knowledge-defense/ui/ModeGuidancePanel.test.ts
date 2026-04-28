import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';

import ModeGuidancePanel from './ModeGuidancePanel.svelte';

describe('ModeGuidancePanel', () => {
	it('renders onboarding actions, legend entries, and live guidance copy', () => {
		const { body } = render(ModeGuidancePanel, {
			props: {
				visible: true,
				title: '首次上手引导',
				description: '第一次进入时先看清什么时候答题、什么时候领奖，以及 fallback 样例题源代表什么。',
				onboarding: true,
				briefing: {
					modeLoop: '走位清怪 → 累积经验升级 → 在安全时机打开奖励答题 → 领取增益后继续推进。',
					controls: [
						'W / A / S / D 移动；触屏可朝按下方向拖动。',
						'空格或点击角色：有待领奖励时打开奖励答题。',
						'E 释放脉冲；Esc 关闭面板或退出当前局。'
					],
					rewardTiming:
						'升级后奖励不会自动弹出，而是先挂在 HUD 的“奖励待领”里，等你觉得安全再答题领取。',
					reviewValue:
						'答错会进入错题集；先复盘再开局，能更快抓住薄弱点，也不会改变现有错题与章节持久化流程。',
					attackPreference: '散射',
					attackPreferenceDetail: '扇面覆盖更宽，近身清怪更快，但更依赖走位贴脸。',
					contentSource: '备用样例题源（Fallback）',
					contentSourceDetail:
						'当前还没选择知识库章节，系统先用备用样例题源帮助你熟悉玩法与操作。'
				},
				currentGuidance: [
					{
						id: 'sample-fallback',
						title: '当前是 fallback 样例题源',
						detail: '这一局使用的是备用样例题源；熟悉玩法没问题，但它不是你选中的知识库章节内容。',
						tone: 'info'
					}
				]
			}
		});

		expect(body).toContain('首次上手');
		expect(body).toContain('知道了，不再自动显示');
		expect(body).toContain('当前是 fallback 样例题源');
		expect(body).toContain('掉落图例');
		expect(body).toContain('武备补给');
		expect(body).toContain('经验结晶');
		expect(body).toContain('急救包');
		expect(body).toContain('怪物前摇图例');
		expect(body).toContain('扑击');
		expect(body).toContain('冲刺');
		expect(body).toContain('投掷');
	});
});
