import { getFileChapterHomeworks } from '$lib/apis/files';

export const loadFileChapterHomeworks = async (token: string, fileId: string) => {
	try {
		const items = await getFileChapterHomeworks(token, fileId);
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
