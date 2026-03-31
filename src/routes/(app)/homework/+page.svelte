<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { get } from 'svelte/store';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';

	import { getFileChapters, getFileChapterContent } from '$lib/apis/files';
	import { getKnowledgeBases, searchKnowledgeFilesById } from '$lib/apis/knowledge';
	import {
		generateHomework,
		getHomeworkById,
		listHomeworks,
		submitHomework
	} from '$lib/apis/homework';
	import { showSidebar } from '$lib/stores';
	import Spinner from '$lib/components/common/Spinner.svelte';

	type GradedQuestionResult = {
		question_id: string;
		type: string;
		difficulty: string;
		question: string;
		student_answer: string;
		standard_answer: string;
		is_correct: boolean;
		score: number;
		feedback: string;
		analysis: string;
	};

	type KnowledgeBaseItem = {
		id: string;
		name?: string;
		description?: string;
	};

	type KnowledgeFileItem = {
		id: string;
		meta?: {
			name?: string;
			content_type?: string;
		};
	};

	type FileChapter = {
		title: string;
		start_page: number;
		end_page: number;
	};

	type HomeworkSummary = {
		id: string;
		title: string;
		source_file: string;
		created_at: number;
		question_count: number;
		difficulty_config?: { easy?: number; medium?: number; hard?: number };
	};

	type HomeworkQuestion = {
		id: string;
		order_index: number;
		type: 'choice' | 'judge' | 'short_answer';
		difficulty: 'easy' | 'medium' | 'hard';
		question: string;
		options?: string[];
		answer?: string;
		analysis?: string;
	};

	type HomeworkDetail = {
		homework: {
			id: string;
			title: string;
			source_file?: string;
			source_file_id?: string;
			created_at: number;
			description?: string;
			knowledge_points?: string[];
		};
		questions: HomeworkQuestion[];
		submissions: {
			id: string;
			score: number;
			total_questions: number;
			correct_count: number;
			created_at: number;
		}[];
		latest_submission?: {
			id: string;
			score: number;
			total_questions: number;
			correct_count: number;
			created_at: number;
		} | null;
		latest_submission_results?: GradedQuestionResult[];
	};

	type SubmitResult = {
		submission_id: string;
		homework_id: string;
		score: number;
		correct_count: number;
		total_questions: number;
		results: GradedQuestionResult[];
	};

	let loadingHistory = false;
	let generating = false;
	let submitting = false;
	let loadingKnowledgeBases = false;
	let loadingKnowledgeFiles = false;
	let loadingChapters = false;
	let loadingChapterContent = false;

	let homeworks: HomeworkSummary[] = [];
	let selectedHomeworkId: string | null = null;
	let currentHomework: HomeworkDetail | null = null;

	let formTitle = '';
	let formDescription = '';
	let difficultyEasy = 1;
	let difficultyMedium = 4;
	let difficultyHard = 5;

	let includeChoice = true;
	let includeJudge = true;
	let includeShort = true;
	let autoQuestionTypeSelection = true;

	let knowledgeBases: KnowledgeBaseItem[] = [];
	let knowledgeFiles: KnowledgeFileItem[] = [];
	let selectedChapters: FileChapter[] = [];

	let selectedKnowledgeId = '';
	let selectedKnowledgeFileId = '';
	let selectedChapterKey = '';

	let sourceFileId = '';
	let sourceChapterName = '';
	let sourceChapterStartPage: number | null = null;
	let sourceChapterEndPage: number | null = null;
	let sourceContent = '';
	let sourceFileName = '';
	let sourceFilePreview = '';
	let sourceReady = false;
	let showHistoryPanel = false;
	let previousShowSidebar = true;

	let answers: Record<string, string> = {};
	let submitResult: SubmitResult | null = null;

	const formatTime = (ts: number) => {
		if (!ts) return '-';
		return new Date(ts * 1000).toLocaleString();
	};

	const resetAnswerState = (clearSubmitResult = true) => {
		answers = {};
		if (clearSubmitResult) {
			submitResult = null;
		}
		if (currentHomework?.questions) {
			for (const question of currentHomework.questions) {
				answers[question.id] = '';
			}
		}
	};

	const loadHistory = async () => {
		loadingHistory = true;
		try {
			const res = await listHomeworks(localStorage.token);
			homeworks = res?.items ?? [];
		} catch (error) {
			toast.error(`${error}`);
			homeworks = [];
		} finally {
			loadingHistory = false;
		}
	};

	const openHomework = async (homeworkId: string, clearSubmitResult = false) => {
		try {
			const res = await getHomeworkById(localStorage.token, homeworkId);
			const detail = res as HomeworkDetail;
			currentHomework = detail;
			selectedHomeworkId = homeworkId;
			resetAnswerState(false);

			if (
				!clearSubmitResult &&
				detail?.latest_submission &&
				Array.isArray(detail?.latest_submission_results) &&
				detail.latest_submission_results.length > 0
			) {
				submitResult = {
					submission_id: detail.latest_submission.id,
					homework_id: detail.homework.id,
					score: detail.latest_submission.score,
					correct_count: detail.latest_submission.correct_count,
					total_questions: detail.latest_submission.total_questions,
					results: detail.latest_submission_results
				};
			} else if (clearSubmitResult) {
				submitResult = null;
			}
		} catch (error) {
			toast.error(`${error}`);
		}
	};

	const closeHomeworkPage = async () => {
		try {
			await goto('/');
		} catch {
			window.location.assign('/');
		}
	};

	const resetSourceSelection = () => {
		sourceFileId = '';
		sourceChapterName = '';
		sourceChapterStartPage = null;
		sourceChapterEndPage = null;
		sourceContent = '';
		sourceFileName = '';
		sourceFilePreview = '';
		sourceReady = false;
		selectedChapterKey = '';
	};

	const loadKnowledgeBaseOptions = async () => {
		loadingKnowledgeBases = true;
		try {
			const res = await getKnowledgeBases(localStorage.token, 1);
			knowledgeBases = res?.items ?? [];
		} catch (error) {
			toast.error(`${error}`);
			knowledgeBases = [];
		} finally {
			loadingKnowledgeBases = false;
		}
	};

	const onKnowledgeBaseChange = async (event: Event) => {
		const target = event.target as HTMLSelectElement;
		selectedKnowledgeId = target.value;
		selectedKnowledgeFileId = '';
		knowledgeFiles = [];
		selectedChapters = [];
		resetSourceSelection();

		if (!selectedKnowledgeId) {
			return;
		}

		loadingKnowledgeFiles = true;
		try {
			const res = await searchKnowledgeFilesById(
				localStorage.token,
				selectedKnowledgeId,
				null,
				null,
				null,
				null,
				1
			);
			knowledgeFiles = res?.items ?? [];
		} catch (error) {
			toast.error(`${error}`);
			knowledgeFiles = [];
		} finally {
			loadingKnowledgeFiles = false;
		}
	};

	const onKnowledgeFileChange = async (event: Event) => {
		const target = event.target as HTMLSelectElement;
		selectedKnowledgeFileId = target.value;
		selectedChapters = [];
		resetSourceSelection();

		if (!selectedKnowledgeFileId) {
			return;
		}

		loadingChapters = true;
		try {
			selectedChapters = await getFileChapters(localStorage.token, selectedKnowledgeFileId);
			if (selectedChapters.length === 0) {
				toast.info('该课本暂无可用章节，请在知识库先完成章节抽取');
			}
		} catch (error) {
			toast.error(`${error}`);
			selectedChapters = [];
		} finally {
			loadingChapters = false;
		}
	};

	const onChapterChange = async (event: Event) => {
		const target = event.target as HTMLSelectElement;
		const chapterIndex = Number(target.value);
		selectedChapterKey = target.value;
		resetSourceSelection();
		selectedChapterKey = target.value;

		if (Number.isNaN(chapterIndex) || chapterIndex < 0) {
			return;
		}

		const chapter = selectedChapters[chapterIndex];
		if (!chapter || !selectedKnowledgeFileId) {
			return;
		}

		loadingChapterContent = true;
		try {
			const res = await getFileChapterContent(
				localStorage.token,
				selectedKnowledgeFileId,
				chapter.start_page,
				chapter.end_page
			);

			sourceContent = String(res?.content ?? '').trim();
			if (!sourceContent) {
				throw new Error('章节内容为空，请更换章节后重试');
			}

			sourceFileId = selectedKnowledgeFileId;
			sourceChapterName = chapter.title;
			sourceChapterStartPage = chapter.start_page;
			sourceChapterEndPage = chapter.end_page;
			sourceFileName =
				knowledgeFiles.find((file) => file.id === selectedKnowledgeFileId)?.meta?.name ??
				'未命名课本';
			sourceFilePreview = sourceContent.slice(0, 600);
			sourceReady = true;
		} catch (error) {
			toast.error(`${error}`);
			resetSourceSelection();
			selectedChapterKey = target.value;
		} finally {
			loadingChapterContent = false;
		}
	};

	const getSelectedQuestionTypes = () => {
		const types: string[] = [];
		if (includeChoice) types.push('choice');
		if (includeJudge) types.push('judge');
		if (includeShort) types.push('short_answer');
		return types;
	};

	const getAdaptiveQuestionTypePrompt = () => {
		const chapterHint = sourceChapterName ? `当前章节：${sourceChapterName}。` : '';

		return [
			'请先识别学科与知识类型，再自动确定最合理的题型组合。',
			'要求：不要局限于选择题、判断题、简答题三类。',
			'对于数学/物理等计算型学科，应优先包含计算题、应用题、综合题。',
			'对于语文/英语等语言型学科，可包含阅读理解、写作/表达、语法或文本分析题。',
			'对于化学/生物/地理/历史/政治等学科，按内容特点设计实验分析、材料分析、图表解读、论述等题型。',
			'请保证题型分布与章节内容匹配，并明确每题的作答要求与评分关注点。',
			chapterHint
		]
			.filter((line) => line && line.trim().length > 0)
			.join('\n');
	};

	const generateHomeworkHandler = async () => {
		try {
			if (!sourceReady) {
				throw new Error('请先选择知识库中的课本章节');
			}

			const questionTypes = getSelectedQuestionTypes();
			if (!autoQuestionTypeSelection && questionTypes.length === 0) {
				throw new Error('请至少选择一种题型，或开启“根据内容自动选择题型”');
			}

			const composedDescription = [
				formDescription?.trim() || '',
				autoQuestionTypeSelection ? getAdaptiveQuestionTypePrompt() : ''
			]
				.filter((item) => item && item.trim().length > 0)
				.join('\n\n');

			generating = true;
			const payload = {
				title: formTitle?.trim() || undefined,
				source_file_id: sourceFileId || undefined,
				source_content: sourceContent,
				source_chapter_title: sourceChapterName || undefined,
				source_chapter_start_page:
					sourceChapterStartPage === null ? undefined : sourceChapterStartPage,
				source_chapter_end_page: sourceChapterEndPage === null ? undefined : sourceChapterEndPage,
				description: composedDescription,
				difficulty_config: {
					easy: Number(difficultyEasy) || 0,
					medium: Number(difficultyMedium) || 0,
					hard: Number(difficultyHard) || 0
				},
				question_types: autoQuestionTypeSelection ? undefined : questionTypes
			};

			const res = await generateHomework(localStorage.token, payload);
			selectedHomeworkId = res.homework_id;
			await loadHistory();
			await openHomework(res.homework_id);
			toast.success('作业生成成功');
		} catch (error) {
			toast.error(`${error}`);
		} finally {
			generating = false;
		}
	};

	const submitHomeworkHandler = async () => {
		if (!currentHomework?.homework?.id) return;
		if (!currentHomework?.questions?.length) return;

		const payloadAnswers = currentHomework.questions.map((question) => ({
			question_id: question.id,
			answer: answers[question.id] ?? ''
		}));

		submitting = true;
		try {
			const res = await submitHomework(localStorage.token, {
				homework_id: currentHomework.homework.id,
				answers: payloadAnswers
			});
			submitResult = res;

			const latestSubmission = {
				id: res.submission_id,
				score: res.score,
				total_questions: res.total_questions,
				correct_count: res.correct_count,
				created_at: Math.floor(Date.now() / 1000)
			};

			if (currentHomework?.submissions) {
				currentHomework = {
					...currentHomework,
					submissions: [
						latestSubmission,
						...currentHomework.submissions.filter((item) => item.id !== latestSubmission.id)
					]
				};
			}

			await loadHistory();
			toast.success('批改完成');
		} catch (error) {
			toast.error(`${error}`);
		} finally {
			submitting = false;
		}
	};

	const getLatestSubmission = () => {
		if (!currentHomework?.submissions || currentHomework.submissions.length === 0) {
			return null;
		}

		return [...currentHomework.submissions].sort((a, b) => b.created_at - a.created_at)[0];
	};

	const reopenForRetry = async (homeworkId: string) => {
		await openHomework(homeworkId, true);
		submitResult = null;
		toast.success('已进入重新作答模式');
	};

	onMount(async () => {
		previousShowSidebar = get(showSidebar);
		showSidebar.set(false);
		await loadHistory();
		await loadKnowledgeBaseOptions();
	});

	onDestroy(() => {
		showSidebar.set(previousShowSidebar);
	});
</script>

<div class="flex h-full max-h-[100dvh] w-full flex-col gap-3 overflow-hidden p-3 sm:gap-4 sm:p-4">
	<div
		class="flex items-center justify-between rounded-2xl border border-gray-200 bg-white px-3 py-2 dark:border-gray-800 dark:bg-gray-900"
	>
		<div class="flex items-center gap-2">
			<div class="text-sm font-semibold">生成作业</div>
			<button
				type="button"
				class="inline-flex items-center rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-600 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 lg:hidden"
				on:click={() => {
					showHistoryPanel = !showHistoryPanel;
				}}
			>
				{showHistoryPanel ? '隐藏历史' : '显示历史'}
			</button>
		</div>
		<button
			type="button"
			class="inline-flex size-8 items-center justify-center rounded-lg text-lg leading-none text-gray-500 transition hover:bg-gray-100 hover:text-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white"
			aria-label="关闭作业页面"
			on:click={closeHomeworkPage}
		>
			×
		</button>
	</div>

	<div class="grid min-h-0 flex-1 gap-3 sm:gap-4 lg:grid-cols-3">
		<!-- 左侧：历史 -->
		<section
			class="{showHistoryPanel ? 'flex' : 'hidden'} min-h-0 flex-col rounded-2xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900 lg:flex"
		>
			<div class="mb-3 flex items-center justify-between">
				<h2 class="text-sm font-semibold">历史作业记录</h2>
				<button
					class="rounded-lg px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
					on:click={loadHistory}
				>
					刷新
				</button>
			</div>

			<div class="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
				{#if loadingHistory}
					<div class="flex h-24 items-center justify-center">
						<Spinner className="size-4" />
					</div>
				{:else if homeworks.length === 0}
					<div
						class="rounded-xl border border-dashed border-gray-200 p-3 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400"
					>
						暂无历史作业
					</div>
				{:else}
					{#each homeworks as item}
						<div
							class="w-full rounded-xl border px-3 py-2 transition {selectedHomeworkId === item.id
								? 'border-blue-400 bg-blue-50 dark:border-blue-500/80 dark:bg-blue-900/20'
								: 'border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800/50'}"
						>
							<button type="button" class="w-full text-left" on:click={() => openHomework(item.id)}>
								<div class="line-clamp-1 text-sm font-medium">{item.title}</div>
								<div class="mt-1 text-xs text-gray-500 dark:text-gray-400">
									<div>题数：{item.question_count}</div>
									<div class="line-clamp-1">来源：{item.source_file || '-'}</div>
									<div>{formatTime(item.created_at)}</div>
								</div>
							</button>

							<div class="mt-2 flex justify-end">
								<button
									type="button"
									class="rounded-lg border border-blue-200 bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700 transition hover:bg-blue-200 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50"
									on:click={() => reopenForRetry(item.id)}
								>
									重新作答
								</button>
							</div>
						</div>
					{/each}
				{/if}
			</div>
		</section>

		<!-- 中间：生成 -->
		<section
			class="flex min-h-0 flex-col rounded-2xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900"
		>
			<h2 class="mb-3 text-sm font-semibold">生成作业</h2>

			<div class="space-y-3 overflow-y-auto pr-1">
				<div>
					<div class="mb-1 block text-xs text-gray-500 dark:text-gray-400">题目来源</div>
					<div class="grid gap-2">
						<select
							class="w-full rounded-lg border border-gray-300 px-2 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
							on:change={onKnowledgeBaseChange}
							bind:value={selectedKnowledgeId}
							disabled={loadingKnowledgeBases}
						>
							<option value="">{loadingKnowledgeBases ? '知识库加载中...' : '选择知识库'}</option>
							{#each knowledgeBases as kb}
								<option value={kb.id}>{kb.name || kb.id}</option>
							{/each}
						</select>

						<select
							class="w-full rounded-lg border border-gray-300 px-2 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
							on:change={onKnowledgeFileChange}
							bind:value={selectedKnowledgeFileId}
							disabled={!selectedKnowledgeId || loadingKnowledgeFiles}
						>
							<option value="">{loadingKnowledgeFiles ? '课本加载中...' : '选择课本文件'}</option>
							{#each knowledgeFiles as file}
								<option value={file.id}>{file?.meta?.name || file.id}</option>
							{/each}
						</select>

						<select
							class="w-full rounded-lg border border-gray-300 px-2 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
							on:change={onChapterChange}
							bind:value={selectedChapterKey}
							disabled={!selectedKnowledgeFileId || loadingChapters || loadingChapterContent}
						>
							<option value="">
								{#if loadingChapters}
									章节加载中...
								{:else if loadingChapterContent}
									章节内容加载中...
								{:else}
									选择章节
								{/if}
							</option>
							{#each selectedChapters as chapter, chapterIdx}
								<option value={String(chapterIdx)}>
									{chapter.title}（p.{chapter.start_page + 1} - p.{(chapter.end_page ??
										chapter.start_page) + 1}）
								</option>
							{/each}
						</select>
					</div>

					{#if sourceFileName}
						<div class="mt-2 rounded-lg bg-gray-50 px-2 py-1.5 text-xs dark:bg-gray-800">
							<div class="line-clamp-1">课本：{sourceFileName}</div>
							{#if sourceChapterName}
								<div class="mt-1 line-clamp-1">章节：{sourceChapterName}</div>
							{/if}
							{#if sourceReady}
								<div class="mt-1 text-green-600 dark:text-green-400">
									章节内容已就绪，可用于生成作业
								</div>
							{/if}
						</div>
					{/if}
				</div>

				<div>
					<label for="homework-title" class="mb-1 block text-xs text-gray-500 dark:text-gray-400"
						>作业名称（可选）</label
					>
					<input
						id="homework-title"
						type="text"
						class="w-full rounded-lg border border-gray-300 px-2 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
						placeholder="例如：力学章节作业"
						bind:value={formTitle}
					/>
				</div>

				<div>
					<label
						for="homework-description"
						class="mb-1 block text-xs text-gray-500 dark:text-gray-400">生成描述</label
					>
					<textarea
						id="homework-description"
						class="h-24 w-full resize-y rounded-lg border border-gray-300 px-2 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
						placeholder="描述希望生成的题目风格、重点与约束..."
						bind:value={formDescription}
					></textarea>
				</div>

				<div>
					<div class="mb-1 text-xs text-gray-500 dark:text-gray-400">难度分布</div>
					<div class="grid grid-cols-3 gap-2">
						<div>
							<label for="homework-difficulty-easy" class="mb-1 block text-xs">简单</label>
							<input
								id="homework-difficulty-easy"
								type="number"
								min="0"
								class="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-950"
								bind:value={difficultyEasy}
							/>
						</div>
						<div>
							<label for="homework-difficulty-medium" class="mb-1 block text-xs">中等</label>
							<input
								id="homework-difficulty-medium"
								type="number"
								min="0"
								class="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-950"
								bind:value={difficultyMedium}
							/>
						</div>
						<div>
							<label for="homework-difficulty-hard" class="mb-1 block text-xs">困难</label>
							<input
								id="homework-difficulty-hard"
								type="number"
								min="0"
								class="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-950"
								bind:value={difficultyHard}
							/>
						</div>
					</div>
				</div>

				<div>
					<div class="mb-1 text-xs text-gray-500 dark:text-gray-400">题型要求</div>
					<label class="mb-2 flex items-center gap-1.5 text-sm">
						<input type="checkbox" bind:checked={autoQuestionTypeSelection} />
						<span>根据内容自动选择题型（推荐）</span>
					</label>
					{#if autoQuestionTypeSelection}
						<div
							class="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-700 dark:border-amber-900/70 dark:bg-amber-900/20 dark:text-amber-300"
						>
							将根据学科内容自动选择题型，例如数学可包含计算题/应用题，避免仅三种固定题型。
						</div>
					{/if}
					<div class="flex flex-wrap gap-3 text-sm">
						<label
							class="flex items-center gap-1.5 {autoQuestionTypeSelection ? 'opacity-50' : ''}"
						>
							<input
								type="checkbox"
								bind:checked={includeChoice}
								disabled={autoQuestionTypeSelection}
							/>
							<span>选择题</span>
						</label>
						<label
							class="flex items-center gap-1.5 {autoQuestionTypeSelection ? 'opacity-50' : ''}"
						>
							<input
								type="checkbox"
								bind:checked={includeJudge}
								disabled={autoQuestionTypeSelection}
							/>
							<span>判断题</span>
						</label>
						<label
							class="flex items-center gap-1.5 {autoQuestionTypeSelection ? 'opacity-50' : ''}"
						>
							<input
								type="checkbox"
								bind:checked={includeShort}
								disabled={autoQuestionTypeSelection}
							/>
							<span>简答题</span>
						</label>
					</div>
				</div>

				<div class="pt-1">
					<button
						class="inline-flex w-full items-center justify-center rounded-xl bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
						on:click={generateHomeworkHandler}
						disabled={generating || loadingChapterContent}
					>
						{#if generating || loadingChapterContent}
							<Spinner className="mr-2 size-4" />
						{/if}
						{generating ? '生成中...' : loadingChapterContent ? '读取章节中...' : '生成作业'}
					</button>
				</div>

				{#if sourceFilePreview}
					<div
						class="rounded-xl border border-gray-200 bg-gray-50 p-2.5 dark:border-gray-700 dark:bg-gray-850"
					>
						<div class="mb-1 text-xs font-medium text-gray-600 dark:text-gray-300">教材预览</div>
						<div
							class="max-h-36 overflow-y-auto whitespace-pre-wrap text-xs text-gray-600 dark:text-gray-300"
						>
							{sourceFilePreview}
						</div>
					</div>
				{/if}
			</div>
		</section>

		<!-- 右侧：作答与批改 -->
		<section
			class="flex min-h-0 flex-col rounded-2xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900"
		>
			<div class="mb-3 flex items-center justify-between">
				<h2 class="text-sm font-semibold">作答与批改</h2>
				{#if currentHomework?.homework}
					<div class="text-xs text-gray-500 dark:text-gray-400">
						{currentHomework.homework.title}
					</div>
				{/if}
			</div>

			{#if !currentHomework || !currentHomework.questions || currentHomework.questions.length === 0}
				<div
					class="flex h-full items-center justify-center rounded-xl border border-dashed border-gray-200 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400"
				>
					请先生成或打开一份历史作业
				</div>
			{:else}
				{@const latestSubmission = getLatestSubmission()}

				{#if latestSubmission}
					<div
						class="mb-3 rounded-xl border border-indigo-200 bg-indigo-50/80 p-3 text-xs text-indigo-700 dark:border-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-200"
					>
						<div class="text-sm font-semibold">上一次批改记录</div>
						<div class="mt-1">时间：{formatTime(latestSubmission.created_at)}</div>
						<div class="mt-1">分数：{latestSubmission.score} / 100</div>
						<div class="mt-1">
							正确题数：{latestSubmission.correct_count}/{latestSubmission.total_questions}
						</div>
					</div>
				{/if}

				<div class="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
					{#each currentHomework.questions as question, index}
						<div class="rounded-xl border border-gray-200 p-3 dark:border-gray-700">
							<div class="mb-2 flex items-center justify-between gap-2">
								<div class="text-sm font-medium">Q{index + 1}. {question.question}</div>
								<div
									class="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300"
								>
									{question.difficulty}
								</div>
							</div>

							{#if question.type === 'choice' || question.type === 'judge'}
								<div class="space-y-1.5">
									{#each question.options && question.options.length > 0 ? question.options : ['True', 'False'] as option}
										<label
											class="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800"
										>
											<input
												type="radio"
												name={`answer-${question.id}`}
												value={option}
												checked={answers[question.id] === option}
												on:change={() => {
													answers = { ...answers, [question.id]: option };
												}}
											/>
											<span class="text-sm">{option}</span>
										</label>
									{/each}
								</div>
							{:else}
								<textarea
									class="h-24 w-full resize-y rounded-lg border border-gray-300 px-2 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
									placeholder="请输入你的答案"
									value={answers[question.id] ?? ''}
									on:input={(event) => {
										const target = event.target as HTMLTextAreaElement;
										answers = { ...answers, [question.id]: target.value };
									}}
								></textarea>
							{/if}

							{#if submitResult}
								{@const graded = submitResult.results.find(
									(item) => item.question_id === question.id
								)}
								{#if graded}
									<div
										class="mt-3 rounded-lg border p-2 text-xs {graded.is_correct
											? 'border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300'
											: 'border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300'}"
									>
										<div class="font-medium">
											{graded.is_correct ? '正确' : '错误'} · 得分 {graded.score}
										</div>
										{#if graded.feedback}
											<div class="mt-1 whitespace-pre-wrap">{graded.feedback}</div>
										{/if}
										<div class="mt-1 whitespace-pre-wrap">你的答案：{graded.student_answer || '（空）'}</div>
										<div class="mt-1 whitespace-pre-wrap">标准答案：{graded.standard_answer || '（无）'}</div>
										{#if graded.analysis}
											<div class="mt-1 whitespace-pre-wrap">解析：{graded.analysis}</div>
										{/if}
									</div>
								{/if}
							{/if}
						</div>
					{/each}
				</div>

				<div class="mt-3 border-t border-gray-200 pt-3 dark:border-gray-800">
					<button
						class="inline-flex w-full items-center justify-center rounded-xl bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
						on:click={submitHomeworkHandler}
						disabled={submitting}
					>
						{#if submitting}
							<Spinner className="mr-2 size-4" />
						{/if}
						{submitting ? '批改中...' : '提交并自动批改'}
					</button>

					{#if submitResult}
						<div class="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-sm dark:bg-gray-850">
							总分：<span class="font-semibold">{submitResult.score}</span> / 100 ，正确题数：{submitResult.correct_count}/{submitResult.total_questions}
						</div>
					{/if}
				</div>
			{/if}
		</section>
	</div>
</div>
