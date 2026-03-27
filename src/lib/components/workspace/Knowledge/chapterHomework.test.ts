import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/apis/files', () => ({
	getFileChapterHomeworks: vi.fn()
}));

import { getFileChapterHomeworks } from '$lib/apis/files';
import { loadFileChapterHomeworks } from './chapterHomework';

describe('loadFileChapterHomeworks', () => {
	it('returns visible=true when API succeeds', async () => {
		vi.mocked(getFileChapterHomeworks).mockResolvedValueOnce([
			{ id: 'h1', chapter_title: '第一章' }
		] as any);

		const result = await loadFileChapterHomeworks('token', 'file-1');
		expect(result.visible).toBe(true);
		expect(result.items).toHaveLength(1);
	});

	it('returns visible=false when API fails (e.g. env=false backend 404)', async () => {
		vi.mocked(getFileChapterHomeworks).mockRejectedValueOnce(new Error('404'));

		const result = await loadFileChapterHomeworks('token', 'file-1');
		expect(result.visible).toBe(false);
		expect(result.items).toEqual([]);
	});
});
