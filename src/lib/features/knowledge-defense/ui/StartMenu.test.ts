import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';

import StartMenu from './StartMenu.svelte';

describe('StartMenu', () => {
	it('keeps the action buttons while showing the new homepage hero title without restoring bulky briefing content', () => {
		const { body } = render(StartMenu, {
			props: {
				modeName: 'Knowledge Defense / 知识防御',
				attackModeLabel: '直线发射',
				wrongCount: 6,
				sourceLabel: '备用样例题源（Fallback）',
				sourceDetail: '当前还没选择知识库章节，系统先用备用样例题源帮助你熟悉玩法与操作。',
				sourceIsFallback: true,
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
					attackPreference: '直线发射',
					attackPreferenceDetail: '单线输出更稳，方便边走位边确认怪物前摇。',
					contentSource: '备用样例题源（Fallback）',
					contentSourceDetail:
						'当前还没选择知识库章节，系统先用备用样例题源帮助你熟悉玩法与操作。'
				}
			}
		});

		expect(body).toContain('Knowledge Defence');
		expect(body).toContain('知识闯关');
		expect(body).not.toContain('模式循环');
		expect(body).not.toContain('主控操作');
		expect(body).not.toContain('奖励时机');
		expect(body).not.toContain('错题 / 复盘价值');
		expect(body).toContain('帮助 / 图例');
		expect(body).toContain('开始闯关');
		expect(body).toContain('设置');
		expect(body).toContain('错题集');
	});
});
