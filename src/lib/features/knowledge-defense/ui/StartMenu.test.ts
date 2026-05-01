import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';

import StartMenu from './StartMenu.svelte';

describe('StartMenu', () => {
	it('renders the redesigned start layout with five selectable weapon rows', () => {
		const { body } = render(StartMenu, {
			props: {
				selectedWeaponId: 'karate',
				wrongCount: 6,
				sourceLabel: '备用样例题源（Fallback）',
				sourceDetail: '当前还没选择知识库章节，系统先用备用样例题源帮助你熟悉玩法与操作。',
				sourceIsFallback: true
			}
		});

		expect(body).toContain('Knowledge Defense');
		expect(body).toContain('知识闯关');
		expect(body).toContain('设置');
		expect(body).toContain('错题集');
		expect(body).toContain('帮助 / 图例');
		expect(body).toContain('选择主武器');
		expect(body).toContain('直线主武器');
		expect(body).toContain('散射主武器');
		expect(body).toContain('激光教鞭');
		expect(body).toContain('导弹发射器');
		expect(body).toContain('空手道');
		expect(body.match(/data-weapon-row=/g)?.length).toBe(5);
		expect(body).toContain('data-selected-weapon="karate"');
		expect(body).toContain('data-start-cta="true"');
		expect(body).not.toContain('攻击模式');
	});

	it('marks the currently selected supported weapon in the detail panel', () => {
		const { body } = render(StartMenu, {
			props: {
				selectedWeaponId: 'missile',
				wrongCount: 0,
				sourceLabel: '章节作业',
				sourceDetail: '已连接章节作业。',
				sourceIsFallback: false
			}
		});

		expect(body).toContain('data-selected-weapon="missile"');
		expect(body).toContain('导弹发射器');
		expect(body).toContain('已选');
	});
});
