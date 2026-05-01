import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';

import SettingsPanel from './SettingsPanel.svelte';

describe('SettingsPanel', () => {
	it('keeps only source selection and no main-weapon controls', () => {
		const { body } = render(SettingsPanel, {
			props: {
				visible: true,
				loadingKnowledgeBases: false,
				loadingKnowledgeFiles: false,
				loadingChapterHomeworks: false,
				knowledgeBases: [{ id: 'kb-1', name: '知识库 A' }],
				knowledgeFiles: [{ id: 'file-1', name: '文件 A' }],
				chapterHomeworks: [{ id: 'hw-1', chapter_title: '第一章', question_count: 12 }],
				selectedKnowledgeId: '',
				selectedFileId: '',
				selectedHomeworkId: '',
				usingSampleFallback: true,
				sourceLabel: '备用样例题源（Fallback）',
				sourceDetail: '当前还没选择知识库章节。'
			}
		});

		expect(body).toContain('Knowledge Defense / 知识防御 · 设置');
		expect(body).toContain('题目来源（知识库章节作业）');
		expect(body).toContain('知识库');
		expect(body).toContain('文件');
		expect(body).toContain('章节作业');
		expect(body).not.toContain('攻击模式');
		expect(body).not.toContain('直线发射');
		expect(body).not.toContain('散射');
	});
});
