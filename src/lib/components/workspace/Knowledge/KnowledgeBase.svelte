<script lang="ts">
	import Fuse from 'fuse.js';
	import { toast } from 'svelte-sonner';
	import { v4 as uuidv4 } from 'uuid';
	import { PaneGroup, Pane, PaneResizer } from 'paneforge';

	import { onMount, getContext, onDestroy, tick } from 'svelte';
	const i18n = getContext('i18n');

	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import {
		mobile,
		showSidebar,
		knowledge as _knowledge,
		config,
		user,
		settings
	} from '$lib/stores';

	import {
		updateFileDataContentById,
		uploadFile,
		deleteFileById,
		getFileById,
		getFileChapters,
		getFileChapterContent,
		getFileSections,
		getFileSectionContent,
		extractFileChapters,
		updateFileChapterHomework
	} from '$lib/apis/files';
	import { listHomeworks, getHomeworkById } from '$lib/apis/homework';
	import {
		addFileToKnowledgeById,
		getKnowledgeById,
		removeFileFromKnowledgeById,
		resetKnowledgeById,
		updateFileFromKnowledgeById,
		updateKnowledgeById,
		searchKnowledgeFilesById
	} from '$lib/apis/knowledge';
	import { processWeb, processYoutubeVideo } from '$lib/apis/retrieval';

	import { blobToFile, isYoutubeUrl } from '$lib/utils';

	import Spinner from '$lib/components/common/Spinner.svelte';
	import Files from './KnowledgeBase/Files.svelte';
	import AddFilesPlaceholder from '$lib/components/AddFilesPlaceholder.svelte';

	import AddContentMenu from './KnowledgeBase/AddContentMenu.svelte';
	import AddTextContentModal from './KnowledgeBase/AddTextContentModal.svelte';

	import SyncConfirmDialog from '../../common/ConfirmDialog.svelte';
	import Drawer from '$lib/components/common/Drawer.svelte';
	import PdfViewer from '$lib/components/common/PdfViewer.svelte';
	import ChapterOutline from './KnowledgeBase/ChapterOutline.svelte';
	import ChevronLeft from '$lib/components/icons/ChevronLeft.svelte';
	import LockClosed from '$lib/components/icons/LockClosed.svelte';
	import AccessControlModal from '../common/AccessControlModal.svelte';
	import Search from '$lib/components/icons/Search.svelte';
	import FilesOverlay from '$lib/components/chat/MessageInput/FilesOverlay.svelte';
	import DropdownOptions from '$lib/components/common/DropdownOptions.svelte';
	import Pagination from '$lib/components/common/Pagination.svelte';
	import AttachWebpageModal from '$lib/components/chat/MessageInput/AttachWebpageModal.svelte';
	import { loadFileChapterHomeworks } from './chapterHomework';
	import { loadFileChapterMindmaps } from './chapterMindmap';
	import MarkmapRenderer from '$lib/components/chat/Messages/MarkmapRenderer.svelte';

	let largeScreen = true;

	let pane;
	let showSidepanel = true;

	let showAddWebpageModal = false;
	let showAddTextContentModal = false;

	let showSyncConfirmModal = false;
	let showAccessControlModal = false;

	let minSize = 0;
	type Knowledge = {
		id: string;
		name: string;
		description: string;
		data: {
			file_ids: string[];
		};
		files: any[];
	};

	let id = null;
	let knowledge: Knowledge | null = null;
	let knowledgeId = null;

	let selectedFileId = null;
	let selectedFile = null;
	let selectedFileContent = '';

	// Chapter/Section state
	let drawerTab: 'preview' | 'content' | 'homework' | 'mindmap' = 'content';
	let fileChapters: any[] = [];
	let fileSections: any[] = [];
	let selectedChapterIndex = -1;
	let selectedSectionIndex = -1;
	let chapterContent = '';
	let chapterContentLoading = false;
	let pdfCurrentPage = 1;
	let fileChapterHomeworks: any[] = [];
	let selectedChapterHomework: any = null;
	let chapterHomeworkVisible = false;
	let chapterHomeworkLoading = false;
	let chapterHomeworkGenerating = false;
	let chapterHomeworkPollCount = 0;
	let chapterHomeworkPollTimer: ReturnType<typeof setTimeout> | null = null;
	let chapterHomeworkSaving = false;
	let fileChapterMindmaps: any[] = [];
	let selectedChapterMindmap: any = null;
	let chapterMindmapVisible = false;
	let answerMarkdownTextarea: HTMLTextAreaElement | null = null;
	let homeworkSidebarMode: 'outline' | 'history' = 'outline';
	let homeworkHistoryLoading = false;
	let homeworkHistoryItems: any[] = [];
	let selectedHistoryHomeworkId: string | null = null;
	let selectedHistoryHomework: any = null;
	let historyHomeworkEditMode = false;
	let historyHomeworkAnswers: Record<string, string> = {};
	let chapterHomeworkEditMode = false;
	let chapterHomeworkAnswers: Record<string, string> = {};

	// Helper: is the selected file a PDF?
	$: isPdf =
		selectedFile?.meta?.content_type === 'application/pdf' ||
		(selectedFile?.meta?.name || selectedFile?.filename || '').toLowerCase().endsWith('.pdf');

	let inputFiles = null;

	let query = '';
	let searchDebounceTimer: ReturnType<typeof setTimeout>;

	let viewOption = null;
	let sortKey = null;
	let direction = null;

	let currentPage = 1;
	let fileItems = null;
	let fileItemsTotal = null;

	const reset = () => {
		currentPage = 1;
	};

	const init = async () => {
		reset();
		await getItemsPage();
	};

	// Debounce only query changes
	$: if (query !== undefined) {
		clearTimeout(searchDebounceTimer);

		searchDebounceTimer = setTimeout(() => {
			getItemsPage();
		}, 300);
	}

	// Immediate response to filter/pagination changes
	$: if (
		knowledgeId !== null &&
		viewOption !== undefined &&
		sortKey !== undefined &&
		direction !== undefined &&
		currentPage !== undefined
	) {
		getItemsPage();
	}

	$: if (
		query !== undefined &&
		viewOption !== undefined &&
		sortKey !== undefined &&
		direction !== undefined
	) {
		reset();
	}

	const getItemsPage = async () => {
		if (knowledgeId === null) return;

		fileItems = null;
		fileItemsTotal = null;

		if (sortKey === null) {
			direction = null;
		}

		const res = await searchKnowledgeFilesById(
			localStorage.token,
			knowledge.id,
			query,
			viewOption,
			sortKey,
			direction,
			currentPage
		).catch(() => {
			return null;
		});

		if (res) {
			fileItems = res.items;
			fileItemsTotal = res.total;
		}
		return res;
	};

	const fileSelectHandler = async (file) => {
		try {
			stopChapterHomeworkPolling();
			selectedFile = file;
			selectedFileContent = selectedFile?.data?.content || '';

			// Reset chapter/section state
			fileChapters = [];
			fileSections = [];
			selectedChapterIndex = -1;
			selectedSectionIndex = -1;
			chapterContent = '';
			fileChapterHomeworks = [];
			selectedChapterHomework = null;
			chapterHomeworkVisible = false;
			fileChapterMindmaps = [];
			selectedChapterMindmap = null;
			chapterMindmapVisible = false;
			homeworkSidebarMode = 'outline';
			homeworkHistoryItems = [];
			selectedHistoryHomeworkId = null;
			selectedHistoryHomework = null;

			const fileName = file?.meta?.name || file?.filename || '';
			const contentType = file?.meta?.content_type || '';
			const fileLower = fileName.toLowerCase();

			if (contentType === 'application/pdf' || fileLower.endsWith('.pdf')) {
				// PDF: load chapters and default to preview tab
				drawerTab = 'preview';
				try {
					fileChapters = await getFileChapters(localStorage.token, file.id);
				} catch (e) {
					fileChapters = [];
				}
				// Auto-extract: if no chapters in DB, run extraction
				if (fileChapters.length === 0) {
					try {
						const res = await extractFileChapters(localStorage.token, file.id);
						if (res?.chapters?.length > 0) {
							fileChapters = res.chapters;
						}
					} catch (e) {
						console.error('Auto chapter extraction failed:', e);
					}
				}

				await refreshChapterHomeworks(file.id, true);
				await loadHomeworkHistory();
				if (chapterHomeworkVisible && fileChapters.length > 0 && fileChapterHomeworks.length === 0) {
					startChapterHomeworkPolling(file.id);
				}

				const chapterMindmapRes = await loadFileChapterMindmaps(localStorage.token, file.id);
				fileChapterMindmaps = chapterMindmapRes.items;
				chapterMindmapVisible = chapterMindmapRes.visible;
			} else {
				// txt/docx: load sections, only content tab
				drawerTab = 'content';
				chapterHomeworkVisible = false;
				try {
					fileSections = await getFileSections(localStorage.token, file.id);
				} catch (e) {
					fileSections = [];
				}
				// Auto-extract: if no sections in DB, run extraction
				if (fileSections.length === 0) {
					try {
						const res = await extractFileChapters(localStorage.token, file.id);
						if (res?.sections?.length > 0) {
							fileSections = res.sections;
						}
					} catch (e) {
						console.error('Auto section extraction failed:', e);
					}
				}
			}
		} catch (e) {
			toast.error($i18n.t('Failed to load file content.'));
		}
	};

	const stopChapterHomeworkPolling = () => {
		if (chapterHomeworkPollTimer) {
			clearTimeout(chapterHomeworkPollTimer);
			chapterHomeworkPollTimer = null;
		}
		chapterHomeworkGenerating = false;
		chapterHomeworkPollCount = 0;
	};

	const refreshChapterHomeworks = async (fileId: string, showLoading = false) => {
		if (!fileId) return;
		if (showLoading) chapterHomeworkLoading = true;
		try {
			const chapterHomeworkRes = await loadFileChapterHomeworks(localStorage.token, fileId);
			fileChapterHomeworks = chapterHomeworkRes.items;
			chapterHomeworkVisible = chapterHomeworkRes.visible;

			if (selectedChapterIndex >= 0 && fileChapters[selectedChapterIndex]) {
				selectedChapterHomework = findChapterHomework(fileChapters[selectedChapterIndex]);
			}
		} finally {
			if (showLoading) chapterHomeworkLoading = false;
		}
	};

	const startChapterHomeworkPolling = (fileId: string) => {
		if (!fileId) return;
		if (chapterHomeworkPollTimer) return;

		chapterHomeworkGenerating = true;
		chapterHomeworkPollCount = 0;

		const poll = async () => {
			if (!selectedFile || selectedFile.id !== fileId) {
				stopChapterHomeworkPolling();
				return;
			}

			chapterHomeworkPollCount += 1;
			await refreshChapterHomeworks(fileId, false);

			if (!chapterHomeworkVisible || fileChapterHomeworks.length > 0 || chapterHomeworkPollCount >= 80) {
				stopChapterHomeworkPolling();
				return;
			}

			chapterHomeworkPollTimer = setTimeout(poll, 3000);
		};

		chapterHomeworkPollTimer = setTimeout(poll, 3000);
	};

	const formatHomeworkTime = (ts: number) => {
		if (!ts) return '-';
		return new Date(ts * 1000).toLocaleString();
	};

	const loadHomeworkHistory = async () => {
		homeworkHistoryLoading = true;
		try {
			const res = await listHomeworks(localStorage.token);
			const selectedFileId = selectedFile?.id || '';
			const selectedFileName = (selectedFile?.meta?.name || selectedFile?.filename || '').trim();
			homeworkHistoryItems = (res?.items ?? []).filter((item) => {
				if (selectedFileId && item?.source_file_id === selectedFileId) {
					return true;
				}
				if (selectedFileName && (item?.source_file || '').trim() === selectedFileName) {
					return true;
				}
				return false;
			});
		} catch (e) {
			homeworkHistoryItems = [];
		} finally {
			homeworkHistoryLoading = false;
		}
	};

	const openHistoryHomework = async (homeworkId: string) => {
		try {
			const res = await getHomeworkById(localStorage.token, homeworkId);
			selectedHistoryHomework = res;
			selectedHistoryHomeworkId = homeworkId;
			historyHomeworkEditMode = false;
			historyHomeworkAnswers = {};
			for (const q of selectedHistoryHomework?.questions ?? []) {
				historyHomeworkAnswers[q.id] = '';
			}
		} catch (e) {
			toast.error($i18n.t('Failed to load homework'));
		}
	};

	const findChapterHomework = (chapter: any) => {
		if (!chapter || !Array.isArray(fileChapterHomeworks)) return null;
		return (
			fileChapterHomeworks.find(
				(item) =>
					item.chapter_start_page === chapter.start_page &&
					item.chapter_end_page === chapter.end_page
			) ?? null
		);
	};

	const findChapterMindmap = (chapter: any) => {
		if (!chapter || !Array.isArray(fileChapterMindmaps)) return null;
		return (
			fileChapterMindmaps.find(
				(item) =>
					item.chapter_start_page === chapter.start_page &&
					item.chapter_end_page === chapter.end_page
			) ?? null
		);
	};

	const loadChapterContent = async (chapter: any) => {
		if (!selectedFile) return;
		chapterContentLoading = true;
		try {
			const res = await getFileChapterContent(
				localStorage.token,
				selectedFile.id,
				chapter.start_page,
				chapter.end_page
			);
			chapterContent = res?.content || '';
		} catch (e) {
			console.error('Failed to load chapter content:', e);
			chapterContent = '';
			toast.error($i18n.t('Failed to load chapter content.'));
		}
		chapterContentLoading = false;
	};

	const loadChapterHomework = async (chapter: any, index: number) => {
		selectedChapterIndex = index;
		selectedChapterHomework = findChapterHomework(chapter);
		chapterHomeworkEditMode = true;
		chapterHomeworkAnswers = {};
		for (let i = 0; i < (selectedChapterHomework?.questions ?? []).length; i += 1) {
			const question = selectedChapterHomework.questions[i];
			const key = getChapterAnswerKey(question, i);
			chapterHomeworkAnswers[key] = '';
		}
		await tick();
		resizeAnswerMarkdownTextarea();
	};

	const loadChapterMindmap = (chapter: any, index: number) => {
		selectedChapterIndex = index;
		selectedChapterMindmap = findChapterMindmap(chapter);
	};

	const openChapterMindmap = (chapter: any, index: number) => {
		drawerTab = 'mindmap';
		loadChapterMindmap(chapter, index);
	};

	const getMindmapNodeCategory = (node: any) => {
		const score = Number(node?.mastery_score ?? 50);
		const wrongCount = Number(node?.wrong_count ?? 0);

		if (score >= 85 && wrongCount <= 1) {
			return 'mastered';
		}

		const risk = Math.max(0, (70 - score) * 0.9 + wrongCount * 12);
		if (risk >= 25) {
			return 'weak';
		}

		return 'unmastered';
	};

	const getMindmapStats = (treeData: any) => {
		const stats = {
			total: 0,
			mastered: 0,
			unmastered: 0,
			weak: 0
		};

		const visit = (node: any) => {
			if (!node) return;

			if (node.id !== 'root') {
				stats.total += 1;
				const category = getMindmapNodeCategory(node);
				if (category === 'mastered') {
					stats.mastered += 1;
				} else if (category === 'weak') {
					stats.weak += 1;
				} else {
					stats.unmastered += 1;
				}
			}

			for (const child of node?.children ?? []) {
				visit(child);
			}
		};

		visit(treeData);
		return stats;
	};

	const resizeAnswerMarkdownTextarea = () => {
		if (!answerMarkdownTextarea) return;
		answerMarkdownTextarea.style.height = 'auto';
		answerMarkdownTextarea.style.height = `${Math.max(answerMarkdownTextarea.scrollHeight, 320)}px`;
	};

	const saveChapterHomeworkHandler = async () => {
		if (!selectedFile || !selectedChapterHomework) return;
		chapterHomeworkSaving = true;
		try {
			const updated = await updateFileChapterHomework(
				localStorage.token,
				selectedFile.id,
				selectedChapterHomework.id,
				{
					questions: selectedChapterHomework.questions,
					answer_markdown: selectedChapterHomework.answer_markdown
				}
			);

			if (updated) {
				selectedChapterHomework = updated;
				fileChapterHomeworks = fileChapterHomeworks.map((item) =>
					item.id === updated.id ? updated : item
				);
			}
			toast.success($i18n.t('Saved'));
		} catch (e) {
			toast.error($i18n.t('Failed to save'));
		}
		chapterHomeworkSaving = false;
	};

	const optionLetters = ['A', 'B', 'C', 'D', 'E', 'F'];
	const formatChoiceOption = (opt: any, index: number) => {
		const letter = optionLetters[index] || String(index + 1);
		const value = String(opt ?? '').trim();
		if (!value) return `${letter}.`;
		const normalized = value.replace(/^([A-F])[\.|、\)|:：]\s*/i, '');
		return `${letter}. ${normalized}`;
	};

	const getChoiceOptions = (question: any) => {
		if (Array.isArray(question?.options) && question.options.length > 0) {
			return question.options;
		}
		return ['A', 'B', 'C', 'D'];
	};

	const getChapterAnswerKey = (question: any, qIndex: number) => {
		return String(question?.id ?? qIndex);
	};

	const setChapterAnswer = (question: any, qIndex: number, value: string) => {
		const key = getChapterAnswerKey(question, qIndex);
		chapterHomeworkAnswers[key] = value;
		chapterHomeworkAnswers = { ...chapterHomeworkAnswers };
	};

	const submitChapterHomework = () => {
		if (!selectedChapterHomework) return;
		const questions = selectedChapterHomework.questions ?? [];
		if (questions.length === 0) {
			toast.error('当前作业没有题目');
			return;
		}

		const unanswered = questions.filter((question: any, qIndex: number) => {
			const key = getChapterAnswerKey(question, qIndex);
			return !String(chapterHomeworkAnswers[key] ?? '').trim();
		}).length;

		if (unanswered > 0) {
			toast.error(`还有 ${unanswered} 题未作答`);
			return;
		}

		chapterHomeworkEditMode = false;
		toast.success('提交成功');
	};

	const loadSectionContent = async (section: any) => {
		if (!selectedFile) return;
		chapterContentLoading = true;
		try {
			const res = await getFileSectionContent(localStorage.token, selectedFile.id, section.id);
			chapterContent = res?.content || '';
		} catch (e) {
			console.error('Failed to load section content:', e);
			chapterContent = '';
		}
		chapterContentLoading = false;
	};

	const createFileFromText = (name, content) => {
		const blob = new Blob([content], { type: 'text/plain' });
		const file = blobToFile(blob, `${name}.txt`);

		console.log(file);
		return file;
	};

	const uploadWeb = async (urls) => {
		if (!Array.isArray(urls)) {
			urls = [urls];
		}

		const newFileItems = urls.map((url) => ({
			type: 'file',
			file: '',
			id: null,
			url: url,
			name: url,
			size: null,
			status: 'uploading',
			error: '',
			itemId: uuidv4()
		}));

		// Display all items at once
		fileItems = [...newFileItems, ...(fileItems ?? [])];

		for (const fileItem of newFileItems) {
			try {
				console.log(fileItem);
				const res = await processWeb(localStorage.token, '', fileItem.url, false).catch((e) => {
					console.error('Error processing web URL:', e);
					return null;
				});

				if (res) {
					console.log(res);
					const file = createFileFromText(
						// Use URL as filename, sanitized
						fileItem.url
							.replace(/[^a-z0-9]/gi, '_')
							.toLowerCase()
							.slice(0, 50),
						res.content
					);

					const uploadedFile = await uploadFile(localStorage.token, file).catch((e) => {
						toast.error(`${e}`);
						return null;
					});

					if (uploadedFile) {
						console.log(uploadedFile);
						fileItems = fileItems.map((item) => {
							if (item.itemId === fileItem.itemId) {
								item.id = uploadedFile.id;
							}
							return item;
						});

						if (uploadedFile.error) {
							console.warn('File upload warning:', uploadedFile.error);
							toast.warning(uploadedFile.error);
							fileItems = fileItems.filter((file) => file.id !== uploadedFile.id);
						} else {
							await addFileHandler(uploadedFile.id);
						}
					} else {
						toast.error($i18n.t('Failed to upload file.'));
					}
				} else {
					// remove the item from fileItems
					fileItems = fileItems.filter((item) => item.itemId !== fileItem.itemId);
					toast.error($i18n.t('Failed to process URL: {{url}}', { url: fileItem.url }));
				}
			} catch (e) {
				// remove the item from fileItems
				fileItems = fileItems.filter((item) => item.itemId !== fileItem.itemId);
				toast.error(`${e}`);
			}
		}
	};

	const uploadFileHandler = async (file) => {
		console.log(file);

		const fileItem = {
			type: 'file',
			file: '',
			id: null,
			url: '',
			name: file.name,
			size: file.size,
			status: 'uploading',
			error: '',
			itemId: uuidv4()
		};

		if (fileItem.size == 0) {
			toast.error($i18n.t('You cannot upload an empty file.'));
			return null;
		}

		if (
			($config?.file?.max_size ?? null) !== null &&
			file.size > ($config?.file?.max_size ?? 0) * 1024 * 1024
		) {
			console.log('File exceeds max size limit:', {
				fileSize: file.size,
				maxSize: ($config?.file?.max_size ?? 0) * 1024 * 1024
			});
			toast.error(
				$i18n.t(`File size should not exceed {{maxSize}} MB.`, {
					maxSize: $config?.file?.max_size
				})
			);
			return;
		}

		fileItems = [fileItem, ...(fileItems ?? [])];
		try {
			let metadata = {
				knowledge_id: knowledge.id,
				// If the file is an audio file, provide the language for STT.
				...((file.type.startsWith('audio/') || file.type.startsWith('video/')) &&
				$settings?.audio?.stt?.language
					? {
							language: $settings?.audio?.stt?.language
						}
					: {})
			};

			const uploadedFile = await uploadFile(localStorage.token, file, metadata).catch((e) => {
				toast.error(`${e}`);
				return null;
			});

			if (uploadedFile) {
				console.log(uploadedFile);
				fileItems = fileItems.map((item) => {
					if (item.itemId === fileItem.itemId) {
						item.id = uploadedFile.id;
					}
					return item;
				});

				if (uploadedFile.error) {
					console.warn('File upload warning:', uploadedFile.error);
					toast.warning(uploadedFile.error);
					fileItems = fileItems.filter((file) => file.id !== uploadedFile.id);
				} else {
					await addFileHandler(uploadedFile.id);
				}
			} else {
				toast.error($i18n.t('Failed to upload file.'));
			}
		} catch (e) {
			toast.error(`${e}`);
		}
	};

	const uploadDirectoryHandler = async () => {
		// Check if File System Access API is supported
		const isFileSystemAccessSupported = 'showDirectoryPicker' in window;

		try {
			if (isFileSystemAccessSupported) {
				// Modern browsers (Chrome, Edge) implementation
				await handleModernBrowserUpload();
			} else {
				// Firefox fallback
				await handleFirefoxUpload();
			}
		} catch (error) {
			handleUploadError(error);
		}
	};

	// Helper function to check if a path contains hidden folders
	const hasHiddenFolder = (path) => {
		return path.split('/').some((part) => part.startsWith('.'));
	};

	// Modern browsers implementation using File System Access API
	const handleModernBrowserUpload = async () => {
		const dirHandle = await window.showDirectoryPicker();
		let totalFiles = 0;
		let uploadedFiles = 0;

		// Function to update the UI with the progress
		const updateProgress = () => {
			const percentage = (uploadedFiles / totalFiles) * 100;
			toast.info(
				$i18n.t('Upload Progress: {{uploadedFiles}}/{{totalFiles}} ({{percentage}}%)', {
					uploadedFiles: uploadedFiles,
					totalFiles: totalFiles,
					percentage: percentage.toFixed(2)
				})
			);
		};

		// Recursive function to count all files excluding hidden ones
		async function countFiles(dirHandle) {
			for await (const entry of dirHandle.values()) {
				// Skip hidden files and directories
				if (entry.name.startsWith('.')) continue;

				if (entry.kind === 'file') {
					totalFiles++;
				} else if (entry.kind === 'directory') {
					// Only process non-hidden directories
					if (!entry.name.startsWith('.')) {
						await countFiles(entry);
					}
				}
			}
		}

		// Recursive function to process directories excluding hidden files and folders
		async function processDirectory(dirHandle, path = '') {
			for await (const entry of dirHandle.values()) {
				// Skip hidden files and directories
				if (entry.name.startsWith('.')) continue;

				const entryPath = path ? `${path}/${entry.name}` : entry.name;

				// Skip if the path contains any hidden folders
				if (hasHiddenFolder(entryPath)) continue;

				if (entry.kind === 'file') {
					const file = await entry.getFile();
					const fileWithPath = new File([file], entryPath, { type: file.type });

					await uploadFileHandler(fileWithPath);
					uploadedFiles++;
					updateProgress();
				} else if (entry.kind === 'directory') {
					// Only process non-hidden directories
					if (!entry.name.startsWith('.')) {
						await processDirectory(entry, entryPath);
					}
				}
			}
		}

		await countFiles(dirHandle);
		updateProgress();

		if (totalFiles > 0) {
			await processDirectory(dirHandle);
		} else {
			console.log('No files to upload.');
		}
	};

	// Firefox fallback implementation using traditional file input
	const handleFirefoxUpload = async () => {
		return new Promise((resolve, reject) => {
			// Create hidden file input
			const input = document.createElement('input');
			input.type = 'file';
			input.webkitdirectory = true;
			input.directory = true;
			input.multiple = true;
			input.style.display = 'none';

			// Add input to DOM temporarily
			document.body.appendChild(input);

			input.onchange = async () => {
				try {
					const files = Array.from(input.files)
						// Filter out files from hidden folders
						.filter((file) => !hasHiddenFolder(file.webkitRelativePath));

					let totalFiles = files.length;
					let uploadedFiles = 0;

					// Function to update the UI with the progress
					const updateProgress = () => {
						const percentage = (uploadedFiles / totalFiles) * 100;
						toast.info(
							$i18n.t('Upload Progress: {{uploadedFiles}}/{{totalFiles}} ({{percentage}}%)', {
								uploadedFiles: uploadedFiles,
								totalFiles: totalFiles,
								percentage: percentage.toFixed(2)
							})
						);
					};

					updateProgress();

					// Process all files
					for (const file of files) {
						// Skip hidden files (additional check)
						if (!file.name.startsWith('.')) {
							const relativePath = file.webkitRelativePath || file.name;
							const fileWithPath = new File([file], relativePath, { type: file.type });

							await uploadFileHandler(fileWithPath);
							uploadedFiles++;
							updateProgress();
						}
					}

					// Clean up
					document.body.removeChild(input);
					resolve();
				} catch (error) {
					reject(error);
				}
			};

			input.onerror = (error) => {
				document.body.removeChild(input);
				reject(error);
			};

			// Trigger file picker
			input.click();
		});
	};

	// Error handler
	const handleUploadError = (error) => {
		if (error.name === 'AbortError') {
			toast.info($i18n.t('Directory selection was cancelled'));
		} else {
			toast.error($i18n.t('Error accessing directory'));
			console.error('Directory access error:', error);
		}
	};

	// Helper function to maintain file paths within zip
	const syncDirectoryHandler = async () => {
		if (fileItems.length > 0) {
			const res = await resetKnowledgeById(localStorage.token, id).catch((e) => {
				toast.error(`${e}`);
			});

			if (res) {
				fileItems = [];
				toast.success($i18n.t('Knowledge reset successfully.'));

				// Upload directory
				uploadDirectoryHandler();
			}
		} else {
			uploadDirectoryHandler();
		}
	};

	const addFileHandler = async (fileId) => {
		const res = await addFileToKnowledgeById(localStorage.token, id, fileId).catch((e) => {
			toast.error(`${e}`);
			return null;
		});

		if (res) {
			toast.success($i18n.t('File added successfully.'));
			init();
		} else {
			toast.error($i18n.t('Failed to add file.'));
			fileItems = fileItems.filter((file) => file.id !== fileId);
		}
	};

	const deleteFileHandler = async (fileId) => {
		try {
			console.log('Starting file deletion process for:', fileId);

			// Remove from knowledge base only
			const res = await removeFileFromKnowledgeById(localStorage.token, id, fileId);
			console.log('Knowledge base updated:', res);

			if (res) {
				toast.success($i18n.t('File removed successfully.'));
				await init();
			}
		} catch (e) {
			console.error('Error in deleteFileHandler:', e);
			toast.error(`${e}`);
		}
	};

	let debounceTimeout = null;
	let mediaQuery;

	let dragged = false;
	let isSaving = false;

	const updateFileContentHandler = async () => {
		if (isSaving) {
			console.log('Save operation already in progress, skipping...');
			return;
		}

		isSaving = true;

		try {
			const res = await updateFileDataContentById(
				localStorage.token,
				selectedFile.id,
				selectedFileContent
			).catch((e) => {
				toast.error(`${e}`);
				return null;
			});

			if (res) {
				toast.success($i18n.t('File content updated successfully.'));

				selectedFileId = null;
				selectedFile = null;
				selectedFileContent = '';

				await init();
			}
		} finally {
			isSaving = false;
		}
	};

	const changeDebounceHandler = () => {
		console.log('debounce');
		if (debounceTimeout) {
			clearTimeout(debounceTimeout);
		}

		debounceTimeout = setTimeout(async () => {
			if (knowledge.name.trim() === '' || knowledge.description.trim() === '') {
				toast.error($i18n.t('Please fill in all fields.'));
				return;
			}

			const res = await updateKnowledgeById(localStorage.token, id, {
				...knowledge,
				name: knowledge.name,
				description: knowledge.description,
				access_control: knowledge.access_control
			}).catch((e) => {
				toast.error(`${e}`);
			});

			if (res) {
				toast.success($i18n.t('Knowledge updated successfully'));
			}
		}, 1000);
	};

	const handleMediaQuery = async (e) => {
		if (e.matches) {
			largeScreen = true;
		} else {
			largeScreen = false;
		}
	};

	const onDragOver = (e) => {
		e.preventDefault();

		// Check if a file is being draggedOver.
		if (e.dataTransfer?.types?.includes('Files')) {
			dragged = true;
		} else {
			dragged = false;
		}
	};

	const onDragLeave = () => {
		dragged = false;
	};

	const onDrop = async (e) => {
		e.preventDefault();
		dragged = false;

		if (!knowledge?.write_access) {
			toast.error($i18n.t('You do not have permission to upload files to this knowledge base.'));
			return;
		}

		const handleUploadingFileFolder = (items) => {
			for (const item of items) {
				if (item.isFile) {
					item.file((file) => {
						uploadFileHandler(file);
					});
					continue;
				}

				// Not sure why you have to call webkitGetAsEntry and isDirectory seperate, but it won't work if you try item.webkitGetAsEntry().isDirectory
				const wkentry = item.webkitGetAsEntry();
				const isDirectory = wkentry.isDirectory;
				if (isDirectory) {
					// Read the directory
					wkentry.createReader().readEntries(
						(entries) => {
							handleUploadingFileFolder(entries);
						},
						(error) => {
							console.error('Error reading directory entries:', error);
						}
					);
				} else {
					toast.info($i18n.t('Uploading file...'));
					uploadFileHandler(item.getAsFile());
					toast.success($i18n.t('File uploaded!'));
				}
			}
		};

		if (e.dataTransfer?.types?.includes('Files')) {
			if (e.dataTransfer?.files) {
				const inputItems = e.dataTransfer?.items;

				if (inputItems && inputItems.length > 0) {
					handleUploadingFileFolder(inputItems);
				} else {
					toast.error($i18n.t(`File not found.`));
				}
			}
		}
	};

	onMount(async () => {
		// listen to resize 1024px
		mediaQuery = window.matchMedia('(min-width: 1024px)');

		mediaQuery.addEventListener('change', handleMediaQuery);
		handleMediaQuery(mediaQuery);

		// Select the container element you want to observe
		const container = document.getElementById('collection-container');

		// initialize the minSize based on the container width
		minSize = !largeScreen ? 100 : Math.floor((300 / container.clientWidth) * 100);

		// Create a new ResizeObserver instance
		const resizeObserver = new ResizeObserver((entries) => {
			for (let entry of entries) {
				const width = entry.contentRect.width;
				// calculate the percentage of 300
				const percentage = (300 / width) * 100;
				// set the minSize to the percentage, must be an integer
				minSize = !largeScreen ? 100 : Math.floor(percentage);

				if (showSidepanel) {
					if (pane && pane.isExpanded() && pane.getSize() < minSize) {
						pane.resize(minSize);
					}
				}
			}
		});

		// Start observing the container's size changes
		resizeObserver.observe(container);

		if (pane) {
			pane.expand();
		}

		id = $page.params.id;
		const res = await getKnowledgeById(localStorage.token, id).catch((e) => {
			toast.error(`${e}`);
			return null;
		});

		if (res) {
			knowledge = res;
			knowledgeId = knowledge?.id;
		} else {
			goto('/workspace/knowledge');
		}

		const dropZone = document.querySelector('body');
		dropZone?.addEventListener('dragover', onDragOver);
		dropZone?.addEventListener('drop', onDrop);
		dropZone?.addEventListener('dragleave', onDragLeave);
	});

	onDestroy(() => {
		clearTimeout(searchDebounceTimer);
		stopChapterHomeworkPolling();
		mediaQuery?.removeEventListener('change', handleMediaQuery);
		const dropZone = document.querySelector('body');
		dropZone?.removeEventListener('dragover', onDragOver);
		dropZone?.removeEventListener('drop', onDrop);
		dropZone?.removeEventListener('dragleave', onDragLeave);
	});

	const decodeString = (str: string) => {
		try {
			return decodeURIComponent(str);
		} catch (e) {
			return str;
		}
	};
</script>

<FilesOverlay show={dragged} />
<SyncConfirmDialog
	bind:show={showSyncConfirmModal}
	message={$i18n.t(
		'This will reset the knowledge base and sync all files. Do you wish to continue?'
	)}
	on:confirm={() => {
		syncDirectoryHandler();
	}}
/>

<AttachWebpageModal
	bind:show={showAddWebpageModal}
	onSubmit={async (e) => {
		uploadWeb(e.data);
	}}
/>

<AddTextContentModal
	bind:show={showAddTextContentModal}
	on:submit={(e) => {
		const file = createFileFromText(e.detail.name, e.detail.content);
		uploadFileHandler(file);
	}}
/>

<input
	id="files-input"
	bind:files={inputFiles}
	type="file"
	multiple
	hidden
	on:change={async () => {
		if (inputFiles && inputFiles.length > 0) {
			for (const file of inputFiles) {
				await uploadFileHandler(file);
			}

			inputFiles = null;
			const fileInputElement = document.getElementById('files-input');

			if (fileInputElement) {
				fileInputElement.value = '';
			}
		} else {
			toast.error($i18n.t(`File not found.`));
		}
	}}
/>

<div class="flex flex-col w-full h-full min-h-full" id="collection-container">
	{#if id && knowledge}
		<AccessControlModal
			bind:show={showAccessControlModal}
			bind:accessControl={knowledge.access_control}
			share={$user?.permissions?.sharing?.knowledge || $user?.role === 'admin'}
			sharePublic={$user?.permissions?.sharing?.public_knowledge || $user?.role === 'admin'}
			onChange={() => {
				changeDebounceHandler();
			}}
			accessRoles={['read', 'write']}
		/>
		<div class="w-full px-2">
			<div class=" flex w-full">
				<div class="flex-1">
					<div class="flex items-center justify-between w-full">
						<div class="w-full flex justify-between items-center">
							<input
								type="text"
								class="text-left w-full font-medium text-lg font-primary bg-transparent outline-hidden flex-1"
								bind:value={knowledge.name}
								placeholder={$i18n.t('Knowledge Name')}
								disabled={!knowledge?.write_access}
								on:input={() => {
									changeDebounceHandler();
								}}
							/>

							<div class="shrink-0 mr-2.5">
								{#if fileItemsTotal}
									<div class="text-xs text-gray-500">
										<!-- {$i18n.t('{{COUNT}} files')} -->
										{$i18n.t('{{COUNT}} files', {
											COUNT: fileItemsTotal
										})}
									</div>
								{/if}
							</div>
						</div>

						{#if knowledge?.write_access}
							<div class="self-center shrink-0">
								<button
									class="bg-gray-50 hover:bg-gray-100 text-black dark:bg-gray-850 dark:hover:bg-gray-800 dark:text-white transition px-2 py-1 rounded-full flex gap-1 items-center"
									type="button"
									on:click={() => {
										showAccessControlModal = true;
									}}
								>
									<LockClosed strokeWidth="2.5" className="size-3.5" />

									<div class="text-sm font-medium shrink-0">
										{$i18n.t('Access')}
									</div>
								</button>
							</div>
						{:else}
							<div class="text-xs shrink-0 text-gray-500">
								{$i18n.t('Read Only')}
							</div>
						{/if}
					</div>

					<div class="flex w-full">
						<input
							type="text"
							class="text-left text-xs w-full text-gray-500 bg-transparent outline-hidden"
							bind:value={knowledge.description}
							placeholder={$i18n.t('Knowledge Description')}
							disabled={!knowledge?.write_access}
							on:input={() => {
								changeDebounceHandler();
							}}
						/>
					</div>
				</div>
			</div>
		</div>

		<div
			class="mt-2 mb-2.5 py-2 -mx-0 bg-white dark:bg-gray-900 rounded-3xl border border-gray-100/30 dark:border-gray-850/30 flex-1"
		>
			<div class="px-3.5 flex flex-1 items-center w-full space-x-2 py-0.5 pb-2">
				<div class="flex flex-1 items-center">
					<div class=" self-center ml-1 mr-3">
						<Search className="size-3.5" />
					</div>
					<input
						class=" w-full text-sm pr-4 py-1 rounded-r-xl outline-hidden bg-transparent"
						bind:value={query}
						placeholder={`${$i18n.t('Search Collection')}`}
						on:focus={() => {
							selectedFileId = null;
						}}
					/>

					{#if knowledge?.write_access}
						<div>
							<AddContentMenu
								onUpload={(data) => {
									if (data.type === 'directory') {
										uploadDirectoryHandler();
									} else if (data.type === 'web') {
										showAddWebpageModal = true;
									} else if (data.type === 'text') {
										showAddTextContentModal = true;
									} else {
										document.getElementById('files-input').click();
									}
								}}
								onSync={() => {
									showSyncConfirmModal = true;
								}}
							/>
						</div>
					{/if}
				</div>
			</div>

			<div class="px-3 flex justify-between">
				<div
					class="flex w-full bg-transparent overflow-x-auto scrollbar-none"
					on:wheel={(e) => {
						if (e.deltaY !== 0) {
							e.preventDefault();
							e.currentTarget.scrollLeft += e.deltaY;
						}
					}}
				>
					<div
						class="flex gap-3 w-fit text-center text-sm rounded-full bg-transparent px-0.5 whitespace-nowrap"
					>
						<DropdownOptions
							align="start"
							className="flex w-full items-center gap-2 truncate px-3 py-1.5 text-sm bg-gray-50 dark:bg-gray-850 rounded-xl  placeholder-gray-400 outline-hidden focus:outline-hidden"
							bind:value={viewOption}
							items={[
								{ value: null, label: $i18n.t('All') },
								{ value: 'created', label: $i18n.t('Created by you') },
								{ value: 'shared', label: $i18n.t('Shared with you') }
							]}
							onChange={(value) => {
								if (value) {
									localStorage.workspaceViewOption = value;
								} else {
									delete localStorage.workspaceViewOption;
								}
							}}
						/>

						<DropdownOptions
							align="start"
							bind:value={sortKey}
							placeholder={$i18n.t('Sort')}
							items={[
								{ value: 'name', label: $i18n.t('Name') },
								{ value: 'created_at', label: $i18n.t('Created At') },
								{ value: 'updated_at', label: $i18n.t('Updated At') }
							]}
						/>

						{#if sortKey}
							<DropdownOptions
								align="start"
								bind:value={direction}
								items={[
									{ value: 'asc', label: $i18n.t('Asc') },
									{ value: null, label: $i18n.t('Desc') }
								]}
							/>
						{/if}
					</div>
				</div>
			</div>

			{#if fileItems !== null && fileItemsTotal !== null}
				<div class="flex flex-row flex-1 gap-3 px-2.5 mt-2">
					<div class="flex-1 flex">
						<div class=" flex flex-col w-full space-x-2 rounded-lg h-full">
							<div class="w-full h-full flex flex-col min-h-full">
								{#if fileItems.length > 0}
									<div class=" flex overflow-y-auto h-full w-full scrollbar-hidden text-xs">
										<Files
											files={fileItems}
											{knowledge}
											{selectedFileId}
											onClick={(fileId) => {
												selectedFileId = fileId;

												if (fileItems) {
													const file = fileItems.find((file) => file.id === selectedFileId);
													if (file) {
														fileSelectHandler(file);
													} else {
														selectedFile = null;
													}
												}
											}}
											onDelete={(fileId) => {
												selectedFileId = null;
												selectedFile = null;

												deleteFileHandler(fileId);
											}}
										/>
									</div>

									{#if fileItemsTotal > 30}
										<Pagination bind:page={currentPage} count={fileItemsTotal} perPage={30} />
									{/if}
								{:else}
									<div class="my-3 flex flex-col justify-center text-center text-gray-500 text-xs">
										<div>
											{$i18n.t('No content found')}
										</div>
									</div>
								{/if}
							</div>
						</div>
					</div>

					{#if selectedFileId !== null}
						<Drawer
							className="h-full"
							show={selectedFileId !== null}
							onClose={() => {
								selectedFileId = null;
								selectedFile = null;
								stopChapterHomeworkPolling();
							}}
						>
							<div class="flex flex-col justify-start h-full max-h-full">
								<div class="flex flex-col w-full h-full max-h-full">
									<!-- Header: back + filename + tabs + save -->
									<div class="shrink-0 flex items-center p-2 border-b dark:border-gray-700">
										<div class="mr-2">
											<button
												class="w-full text-left text-sm p-1.5 rounded-lg dark:text-gray-300 dark:hover:text-white hover:bg-black/5 dark:hover:bg-gray-850"
												on:click={() => {
													selectedFileId = null;
													selectedFile = null;
																	stopChapterHomeworkPolling();
												}}
											>
												<ChevronLeft strokeWidth="2.5" />
											</button>
										</div>
										<div class="flex-1 text-lg line-clamp-1">
											{selectedFile?.meta?.name}
										</div>

										<!-- Tab buttons -->
										<div class="flex items-center gap-1 mr-2">
											{#if isPdf}
												<button
													class="text-xs px-2.5 py-1 rounded-lg transition-colors
														{drawerTab === 'preview'
														? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
														: 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'}"
													on:click={() => {
														drawerTab = 'preview';
													}}
												>
													{$i18n.t('Preview')}
												</button>
											{/if}
											{#if !isPdf}
												<button
													class="text-xs px-2.5 py-1 rounded-lg transition-colors
														{drawerTab === 'content'
														? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
														: 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'}"
													on:click={() => {
														drawerTab = 'content';
													}}
												>
													{$i18n.t('Content')}
												</button>
											{/if}
											{#if isPdf && chapterMindmapVisible}
												<button
													class="text-xs px-2.5 py-1 rounded-lg transition-colors
														{drawerTab === 'mindmap'
														? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
														: 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'}"
													on:click={() => {
														drawerTab = 'mindmap';
													}}
												>
													思维导图
												</button>
											{/if}
											{#if isPdf && chapterHomeworkVisible}
												<button
													class="text-xs px-2.5 py-1 rounded-lg transition-colors
															{drawerTab === 'homework'
														? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
														: 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'}"
													on:click={() => {
														drawerTab = 'homework';
													}}
												>
													作业
												</button>
											{/if}
										</div>

										{#if knowledge?.write_access && drawerTab === 'content' && !isPdf}
											<div>
												<button
													class="flex self-center w-fit text-sm py-1 px-2.5 dark:text-gray-300 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
													disabled={isSaving}
													on:click={() => {
														updateFileContentHandler();
													}}
												>
													{$i18n.t('Save')}
													{#if isSaving}
														<div class="ml-2 self-center">
															<Spinner />
														</div>
													{/if}
												</button>
											</div>
										{/if}
									</div>

									<!-- Tab content -->
									{#key selectedFile.id}
										{#if drawerTab === 'preview' && isPdf}
											<!-- PDF Preview Tab: left outline + right PDF viewer -->
											<div class="flex flex-1 overflow-hidden">
												<!-- Left: Chapter outline -->
												{#if fileChapters.length > 0}
													<div
														class="w-56 shrink-0 border-r dark:border-gray-700 overflow-y-auto bg-gray-50 dark:bg-gray-900"
													>
														<ChapterOutline
															items={fileChapters}
															selectedIndex={selectedChapterIndex}
															type="chapter"
															actionLabel="导图"
															actionTitle="查看本章节思维导图"
															onActionClick={(chapter, index) => {
																openChapterMindmap(chapter, index);
															}}
															onClick={(chapter, index) => {
																selectedChapterIndex = index;
																pdfCurrentPage = chapter.start_page + 1;
															}}
														/>
													</div>
												{/if}

												<!-- Right: PDF viewer -->
												<div class="flex-1 overflow-hidden">
													<PdfViewer
														fileId={selectedFile.id}
														token={localStorage.token}
														page={pdfCurrentPage}
													/>
												</div>
											</div>
										{:else if drawerTab === 'content' && !isPdf}
											<!-- Content Tab -->
											<div class="flex flex-1 overflow-hidden">
												<!-- Left: Chapter/Section outline -->
												{#if isPdf && fileChapters.length > 0}
													<div
														class="w-56 shrink-0 border-r dark:border-gray-700 overflow-y-auto bg-gray-50 dark:bg-gray-900"
													>
														<ChapterOutline
															items={fileChapters}
															selectedIndex={selectedChapterIndex}
															type="chapter"
															actionLabel="导图"
															actionTitle="查看本章节思维导图"
															onActionClick={(chapter, index) => {
																openChapterMindmap(chapter, index);
															}}
															onClick={(chapter, index) => {
																selectedChapterIndex = index;
																loadChapterContent(chapter);
															}}
														/>
													</div>
												{:else if !isPdf && fileSections.length > 0}
													<div
														class="w-56 shrink-0 border-r dark:border-gray-700 overflow-y-auto bg-gray-50 dark:bg-gray-900"
													>
														<ChapterOutline
															items={fileSections}
															selectedIndex={selectedSectionIndex}
															type="section"
															onClick={(section, index) => {
																selectedSectionIndex = index;
																loadSectionContent(section);
															}}
														/>
													</div>
												{/if}

												<!-- Right: Content area -->
												<div class="flex-1 flex flex-col overflow-hidden">
													{#if isPdf && fileChapters.length > 0}
														<!-- PDF with chapters: show chapter content -->
														{#if selectedChapterIndex < 0}
															<div
																class="flex items-center justify-center h-full text-sm text-gray-400"
															>
																{$i18n.t('Select a chapter to view content')}
															</div>
														{:else if chapterContentLoading}
															<div class="flex items-center justify-center h-full">
																<Spinner className="size-4" />
															</div>
														{:else}
															<div
																class="px-1 py-1 text-xs text-gray-500 dark:text-gray-400 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-900 font-medium"
															>
																{fileChapters[selectedChapterIndex]?.title}
															</div>
															<div class="flex-1 overflow-y-auto">
																<textarea
																	class="w-full h-full text-sm outline-none resize-none px-3 py-2 bg-white dark:bg-gray-950"
																	value={chapterContent}
																	readonly
																	placeholder={$i18n.t('No content')}
																/>
															</div>
														{/if}
													{:else if !isPdf && fileSections.length > 0}
														<!-- txt/docx with sections: show section content -->
														{#if selectedSectionIndex < 0}
															<div
																class="flex items-center justify-center h-full text-sm text-gray-400"
															>
																{$i18n.t('Select a section to view content')}
															</div>
														{:else if chapterContentLoading}
															<div class="flex items-center justify-center h-full">
																<Spinner className="size-4" />
															</div>
														{:else}
															<div
																class="px-1 py-1 text-xs text-gray-500 dark:text-gray-400 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-900 font-medium"
															>
																{fileSections[selectedSectionIndex]?.title}
															</div>
															<textarea
																class="w-full flex-1 text-sm outline-none resize-none px-3 py-2 bg-white dark:bg-gray-950"
																value={chapterContent}
																readonly
																placeholder={$i18n.t('No content')}
															/>
														{/if}
													{:else}
														<!-- Fallback: no chapters/sections, full text editor -->
														<div class="flex flex-col h-full">
															<textarea
																class="w-full flex-1 text-sm outline-none resize-none px-3 py-2"
																bind:value={selectedFileContent}
																disabled={!knowledge?.write_access}
																placeholder={$i18n.t('Add content here')}
															/>
															{#if knowledge?.write_access}
																<div
																	class="shrink-0 flex justify-end p-2 border-t dark:border-gray-700"
																>
																	<button
																		class="text-sm py-1 px-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
																		disabled={isSaving}
																		on:click={() => {
																			updateFileContentHandler();
																		}}
																	>
																		{$i18n.t('Save')}
																		{#if isSaving}
																			<Spinner />
																		{/if}
																	</button>
																</div>
															{/if}
														</div>
													{/if}
												</div>
											</div>
										{:else if drawerTab === 'mindmap' && isPdf && chapterMindmapVisible}
											<div class="flex flex-1 overflow-hidden">
												{#if fileChapters.length > 0}
													<div
														class="w-56 shrink-0 border-r dark:border-gray-700 overflow-y-auto bg-gray-50 dark:bg-gray-900"
													>
														<ChapterOutline
															items={fileChapters}
															selectedIndex={selectedChapterIndex}
															type="chapter"
															actionLabel="导图"
															actionTitle="查看本章节思维导图"
															onActionClick={(chapter, index) => {
																loadChapterMindmap(chapter, index);
															}}
															onClick={(chapter, index) => {
																loadChapterMindmap(chapter, index);
															}}
														/>
													</div>
												{/if}

												<div class="flex-1 min-w-0 overflow-y-auto px-3 py-3">
													{#if selectedChapterIndex < 0}
														<div class="text-sm text-gray-400">请选择一个章节查看思维导图</div>
													{:else if !selectedChapterMindmap}
														<div class="space-y-2 text-sm text-gray-400">
															<div>当前章节还没有可用思维导图。</div>
															<div>如果这是刚上传的新课本，等待章节处理完成后重新打开即可。</div>
														</div>
													{:else}
														{@const mindmapStats = getMindmapStats(
															selectedChapterMindmap.tree_data
														)}
														<div
															class="mb-3 rounded-xl border border-gray-200 bg-white/90 p-3 dark:border-gray-800 dark:bg-gray-950/80"
														>
															<div class="text-sm font-medium text-gray-800 dark:text-gray-100">
																{selectedChapterMindmap.chapter_title}
															</div>
															<div
																class="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400"
															>
																<span
																	class="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-1 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300"
																>
																	<span class="inline-block h-2 w-2 rounded-full bg-blue-400"
																	></span>
																	已掌握 {mindmapStats.mastered}
																</span>
																<span
																	class="inline-flex items-center gap-1 rounded-full bg-pink-50 px-2 py-1 text-pink-600 dark:bg-pink-950/40 dark:text-pink-300"
																>
																	<span class="inline-block h-2 w-2 rounded-full bg-pink-400"
																	></span>
																	待巩固 {mindmapStats.unmastered}
																</span>
																<span
																	class="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-1 text-red-600 dark:bg-red-950/40 dark:text-red-300"
																>
																	<span class="inline-block h-2 w-2 rounded-full bg-red-500"></span>
																	薄弱/高频错题 {mindmapStats.weak}
																</span>
																<span class="text-gray-400">节点总数 {mindmapStats.total}</span>
															</div>
															<div class="mt-2 text-xs text-gray-500 dark:text-gray-400">
																节点染色规则：蓝色表示已掌握，粉色表示待巩固，红色越深表示错题越集中、掌握越薄弱。
															</div>
														</div>

														<div
															class="min-h-[520px] rounded-2xl border border-gray-200 bg-white p-2 dark:border-gray-800 dark:bg-gray-950"
														>
															<MarkmapRenderer
																markdown={selectedChapterMindmap.markmap_markdown ?? ''}
																className="h-full min-h-[500px] w-full"
															/>
														</div>
													{/if}
												</div>
											</div>
										{:else if drawerTab === 'homework' && isPdf && chapterHomeworkVisible}
											<div class="flex flex-1 overflow-hidden">
												<div
													class="w-64 shrink-0 border-r dark:border-gray-700 overflow-y-auto bg-gray-50 dark:bg-gray-900"
												>
													<div class="sticky top-0 z-10 border-b dark:border-gray-700 bg-gray-50/95 px-2 py-2 dark:bg-gray-900/95">
														<div class="grid grid-cols-2 gap-1 rounded-lg bg-white p-1 shadow-sm dark:bg-gray-800">
															<button
																class="rounded-md px-2 py-1 text-xs font-medium transition-colors {homeworkSidebarMode === 'outline'
																	? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
																	: 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'}"
																on:click={() => {
																	homeworkSidebarMode = 'outline';
																}}
															>
																章节
															</button>
															<button
																class="rounded-md px-2 py-1 text-xs font-medium transition-colors {homeworkSidebarMode === 'history'
																	? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
																	: 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'}"
																on:click={() => {
																	homeworkSidebarMode = 'history';
																}}
															>
																历史记录
															</button>
														</div>
													</div>

													{#if homeworkSidebarMode === 'outline'}
														{#if fileChapters.length > 0}
															<ChapterOutline
																items={fileChapters}
																selectedIndex={selectedChapterIndex}
																type="chapter"
																actionLabel="导图"
																actionTitle="查看本章节思维导图"
																onActionClick={(chapter, index) => {
																	openChapterMindmap(chapter, index);
																}}
																onClick={(chapter, index) => {
																	loadChapterHomework(chapter, index);
																}}
															/>
														{/if}
													{:else}
														<div class="px-2 py-2 space-y-1">
															{#if homeworkHistoryLoading}
																<div class="flex items-center justify-center py-5">
																	<Spinner className="size-4" />
																</div>
															{:else if homeworkHistoryItems.length === 0}
																<div class="px-1 py-2 text-xs text-gray-400">暂无历史作业</div>
															{:else}
																{#each homeworkHistoryItems as item}
																	<button
																		class="w-full rounded-lg border px-2 py-2 text-left transition-colors dark:border-gray-700 {selectedHistoryHomeworkId === item.id
																			? 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800'
																			: 'bg-white hover:bg-gray-100 dark:bg-gray-950 dark:hover:bg-gray-800'}"
																		on:click={() => {
																			openHistoryHomework(item.id);
																		}}
																	>
																		<div class="text-xs font-medium line-clamp-2">{item.title}</div>
																		<div class="mt-1 text-[11px] text-gray-500">{formatHomeworkTime(item.created_at)}</div>
																	</button>
																{/each}
															{/if}
														</div>
													{/if}
												</div>

												<div class="flex-1 overflow-y-auto px-3 py-2 space-y-3">
													{#if homeworkSidebarMode === 'outline'}
														{#if selectedChapterIndex < 0}
															<div class="text-sm text-gray-400">
																{$i18n.t('Select a chapter to view homework')}
															</div>
														{:else if !selectedChapterHomework}
															{#if chapterHomeworkGenerating || chapterHomeworkLoading}
																<div class="flex h-full min-h-[360px] items-center justify-center">
																	<div class="flex flex-col items-center gap-3 text-gray-500">
																		<Spinner className="size-7" />
																		<div class="text-base font-medium">作业生成中，请稍候…</div>
																		<div class="text-xs text-gray-400">章节作业生成完成后会自动刷新</div>
																	</div>
																</div>
															{:else}
																<div class="text-sm text-gray-400">
																	{$i18n.t('No homework generated for this chapter yet')}
																</div>
															{/if}
														{:else}
															<div class="text-sm font-medium">作业</div>
															{#each selectedChapterHomework.questions ?? [] as question, qIndex}
																<div
																	class="rounded-lg border dark:border-gray-700 p-3 bg-white dark:bg-gray-950"
																>
																	{@const answerKey = getChapterAnswerKey(question, qIndex)}
																	<div class="text-xs text-gray-500 mb-1">{`Q${qIndex + 1}`}</div>
																	<div class="text-sm leading-6 whitespace-pre-wrap">
																		{question.question}
																	</div>
																	{#if question.type === 'choice'}
																		<div class="mt-2 grid grid-cols-2 gap-2">
																			{#each getChoiceOptions(question) as option, optionIndex}
																				{@const rawOption = String(option ?? '').trim()}
																				{@const optionLetter = (rawOption.match(/^([A-F])/i)?.[1] || optionLetters[optionIndex] || '').toUpperCase()}
																				<button
																					type="button"
																					class="rounded-lg border px-2 py-1.5 text-left text-sm transition-colors dark:border-gray-700 {chapterHomeworkAnswers[answerKey] === optionLetter
																						? 'border-blue-400 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-900/30 dark:text-blue-300'
																						: 'hover:bg-gray-50 dark:hover:bg-gray-900'}"
																					on:click={() => {
																						setChapterAnswer(question, qIndex, optionLetter);
																					}}
																				>
																					{formatChoiceOption(option, optionIndex)}
																				</button>
																			{/each}
																		</div>
																	{:else if question.type === 'judge'}
																		<div class="mt-2 flex gap-2">
																			<button
																				type="button"
																				class="rounded-lg border px-3 py-1.5 text-sm transition-colors dark:border-gray-700 {chapterHomeworkAnswers[answerKey] === '正确'
																					? 'border-green-400 bg-green-50 text-green-700 dark:border-green-500 dark:bg-green-900/30 dark:text-green-300'
																					: 'hover:bg-gray-50 dark:hover:bg-gray-900'}"
																				on:click={() => {
																					setChapterAnswer(question, qIndex, '正确');
																				}}
																			>
																				正确
																			</button>
																			<button
																				type="button"
																				class="rounded-lg border px-3 py-1.5 text-sm transition-colors dark:border-gray-700 {chapterHomeworkAnswers[answerKey] === '错误'
																					? 'border-red-400 bg-red-50 text-red-700 dark:border-red-500 dark:bg-red-900/30 dark:text-red-300'
																					: 'hover:bg-gray-50 dark:hover:bg-gray-900'}"
																				on:click={() => {
																					setChapterAnswer(question, qIndex, '错误');
																				}}
																			>
																				错误
																			</button>
																		</div>
																	{/if}
																</div>
															{/each}

															<div class="flex justify-end">
																<button
																	type="button"
																	class="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white transition-colors hover:bg-blue-700"
																	on:click={submitChapterHomework}
																>
																	提交作业
																</button>
															</div>

															{#if !chapterHomeworkEditMode}
																<div class="text-xs text-gray-500">{$i18n.t('参考答案(可编辑)')}</div>
															{/if}
															<textarea
																class="w-full text-sm outline-none resize-none overflow-hidden px-2 py-1.5 border dark:border-gray-700 rounded-md bg-white dark:bg-gray-950 min-h-[320px]"
																bind:value={selectedChapterHomework.answer_markdown}
																bind:this={answerMarkdownTextarea}
																on:input={resizeAnswerMarkdownTextarea}
																on:focus={resizeAnswerMarkdownTextarea}
																readonly
																hidden={chapterHomeworkEditMode}
															/>

															{#if knowledge?.write_access && chapterHomeworkEditMode}
																<div class="text-xs text-gray-500">作答中：当前不展示标准答案。</div>
															{/if}
														{/if}
													{:else}
														{#if !selectedHistoryHomework}
															<div class="text-sm text-gray-400">请选择左侧历史作业</div>
														{:else}
															<div class="text-sm font-medium">{selectedHistoryHomework.title || '历史作业'}</div>
															<div class="text-xs text-gray-500">创建时间：{formatHomeworkTime(selectedHistoryHomework.created_at)}</div>
															{#each selectedHistoryHomework.questions ?? [] as question, qIndex}
																<div class="rounded-lg border dark:border-gray-700 p-3 bg-white dark:bg-gray-950">
																	<div class="text-xs text-gray-500 mb-1">{`Q${qIndex + 1}`}</div>
																	<div class="text-sm leading-6 whitespace-pre-wrap">{question.question}</div>
																	{#if question.type === 'choice'}
																		<div class="mt-2 space-y-1">
																			{#each getChoiceOptions(question) as option, optionIndex}
																				<div class="text-sm text-gray-700 dark:text-gray-200">{formatChoiceOption(option, optionIndex)}</div>
																			{/each}
																		</div>
																	{/if}
																</div>
															{/each}

															{#if !historyHomeworkEditMode}
																<div class="text-xs text-gray-500">{$i18n.t('参考答案')}</div>
																<textarea
																	class="w-full text-sm outline-none resize-y px-2 py-1.5 border dark:border-gray-700 rounded-md bg-white dark:bg-gray-950 min-h-[220px]"
																	value={selectedHistoryHomework.answer_markdown || ''}
																	readonly
																/>
															{/if}
														{/if}
													{/if}
												</div>
											</div>
										{/if}
									{/key}
								</div>
							</div>
						</Drawer>
					{/if}
				</div>
			{:else}
				<div class="my-10">
					<Spinner className="size-4" />
				</div>
			{/if}
		</div>
	{:else}
		<Spinner className="size-5" />
	{/if}
</div>
