import { getFileChapterMindmaps } from '$lib/apis/files';

export const loadFileChapterMindmaps = async (token: string, fileId: string) => {
	try {
		const items = await getFileChapterMindmaps(token, fileId);
		return {
			visible: true,
			items
		};
	} catch {
		return {
			visible: false,
			items: []
		};
	}
};
