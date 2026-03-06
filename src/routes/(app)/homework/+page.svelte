<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';

	import { uploadFile, getFileById } from '$lib/apis/files';
	import {
		generateHomework,
		getHomeworkById,
		listHomeworks,
		submitHomework
	} from '$lib/apis/homework';
	import Spinner from '$lib/components/common/Spinner.svelte';

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
	};

	type SubmitResult = {
		submission_id: string;
		homework_id: string;
		score: number;
		correct_count: number;
		total_questions: number;
		results: {
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
		}[];
	};

	const SUPPORTED_EXTENSIONS = ['pdf', 'md', 'markdown', 'txt'];

	let loadingHistory = false;
	let generating = false;
	let submitting = false;
	let uploadingSource = false;

	let homeworks: HomeworkSummary[] = [];
	let selectedHomeworkId: string | null = null;
	let currentHomework: HomeworkDetail | null = null;

	let formTitle = '';
	let formDescription = '';
	let difficultyEasy = 5;
	let difficultyMedium = 3;
	let difficultyHard = 2;

	let includeChoice = true;
	let includeJudge = true;
	let includeShort = true;

	let selectedFile: File | null = null;
	let sourceFileId = '';
	let sourceFileName = '';
	let sourceFilePreview = '';
	let sourceReady = false;

	let answers: Record<string, string> = {};
	let submitResult: SubmitResult | null = null;

	const formatTime = (ts: number) => {
		if (!ts) return '-';
		return new Date(ts * 1000).toLocaleString();
	};

	const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

	const openHomework = async (homeworkId: string, clearSubmitResult = true) => {
		try {
			const res = await getHomeworkById(localStorage.token, homeworkId);
			currentHomework = res as HomeworkDetail;
			selectedHomeworkId = homeworkId;
			resetAnswerState(clearSubmitResult);
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

	const validateSelectedFile = (file: File) => {
		const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
		if (!SUPPORTED_EXTENSIONS.includes(ext)) {
			throw new Error('仅支持 PDF / Markdown / TXT 文件');
		}
	};

	const onSourceFileChange = async (event: Event) => {
		const target = event.target as HTMLInputElement;
		if (!target.files || target.files.length === 0) return;

		const file = target.files[0];
		try {
			validateSelectedFile(file);
			selectedFile = file;
			sourceFileName = file.name;
			sourceFileId = '';
			sourceFilePreview = '';
			sourceReady = false;
		} catch (error) {
			toast.error(`${error}`);
			target.value = '';
			selectedFile = null;
		}
	};

	const waitForProcessedFileContent = async (fileId: string) => {
		const maxAttempts = 120;
		for (let attempt = 0; attempt < maxAttempts; attempt++) {
			const file = await getFileById(localStorage.token, fileId);
			const content = file?.data?.content ?? '';
			if (typeof content === 'string' && content.trim().length > 0) {
				return {
					name: file?.meta?.name ?? file?.filename ?? sourceFileName,
					content
				};
			}
			await sleep(1000);
		}
		throw new Error('文件解析超时，请稍后重试');
	};

	const uploadAndProcessSourceFile = async () => {
		if (!selectedFile) {
			throw new Error('请先选择教材文件');
		}
		uploadingSource = true;
		try {
			const uploadRes = await uploadFile(localStorage.token, selectedFile, null, true);
			sourceFileId = uploadRes.id;

			const processed = await waitForProcessedFileContent(uploadRes.id);
			sourceFileName = processed.name;
			sourceFilePreview = processed.content.slice(0, 600);
			sourceReady = true;
		} finally {
			uploadingSource = false;
		}
	};

	const getSelectedQuestionTypes = () => {
		const types: string[] = [];
		if (includeChoice) types.push('choice');
		if (includeJudge) types.push('judge');
		if (includeShort) types.push('short_answer');
		return types;
	};

	const generateHomeworkHandler = async () => {
		try {
			if (!sourceReady) {
				await uploadAndProcessSourceFile();
			}

			if (!sourceFileId) {
				throw new Error('教材文件未准备完成');
			}

			const questionTypes = getSelectedQuestionTypes();
			if (questionTypes.length === 0) {
				throw new Error('请至少选择一种题型');
			}

			generating = true;
			const payload = {
				title: formTitle?.trim() || undefined,
				source_file_id: sourceFileId,
				description: formDescription?.trim() || '',
				difficulty_config: {
					easy: Number(difficultyEasy) || 0,
					medium: Number(difficultyMedium) || 0,
					hard: Number(difficultyHard) || 0
				},
				question_types: questionTypes
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
			await loadHistory();
			toast.success('批改完成');
		} catch (error) {
			toast.error(`${error}`);
		} finally {
			submitting = false;
		}
	};

	onMount(async () => {
		await loadHistory();
	});
</script>

<div class="flex h-full max-h-[100dvh] w-full flex-col gap-3 overflow-hidden p-3 sm:gap-4 sm:p-4">
	<div
		class="flex items-center justify-between rounded-2xl border border-gray-200 bg-white px-3 py-2 dark:border-gray-800 dark:bg-gray-900"
	>
		<div class="text-sm font-semibold">生成作业</div>
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
			class="flex min-h-0 flex-col rounded-2xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900"
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
						<button
							type="button"
							class="w-full rounded-xl border px-3 py-2 text-left transition {selectedHomeworkId ===
							item.id
								? 'border-blue-400 bg-blue-50 dark:border-blue-500/80 dark:bg-blue-900/20'
								: 'border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800/50'}"
							on:click={() => openHomework(item.id)}
						>
							<div class="line-clamp-1 text-sm font-medium">{item.title}</div>
							<div class="mt-1 text-xs text-gray-500 dark:text-gray-400">
								<div>题数：{item.question_count}</div>
								<div class="line-clamp-1">来源：{item.source_file || '-'}</div>
								<div>{formatTime(item.created_at)}</div>
							</div>
						</button>
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
					<label
						for="homework-source-file"
						class="mb-1 block text-xs text-gray-500 dark:text-gray-400"
						>上传教材片段（PDF/MD/TXT）</label
					>
					<input
						id="homework-source-file"
						type="file"
						accept=".pdf,.md,.markdown,.txt"
						class="w-full rounded-lg border border-gray-300 px-2 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
						on:change={onSourceFileChange}
					/>
					{#if sourceFileName}
						<div class="mt-2 rounded-lg bg-gray-50 px-2 py-1.5 text-xs dark:bg-gray-800">
							<div class="line-clamp-1">{sourceFileName}</div>
							{#if sourceReady}
								<div class="mt-1 text-green-600 dark:text-green-400">
									文件已解析，可用于生成作业
								</div>
							{:else}
								<div class="mt-1 text-amber-600 dark:text-amber-400">待解析（生成时自动处理）</div>
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
					<div class="flex flex-wrap gap-3 text-sm">
						<label class="flex items-center gap-1.5">
							<input type="checkbox" bind:checked={includeChoice} />
							<span>选择题</span>
						</label>
						<label class="flex items-center gap-1.5">
							<input type="checkbox" bind:checked={includeJudge} />
							<span>判断题</span>
						</label>
						<label class="flex items-center gap-1.5">
							<input type="checkbox" bind:checked={includeShort} />
							<span>简答题</span>
						</label>
					</div>
				</div>

				<div class="pt-1">
					<button
						class="inline-flex w-full items-center justify-center rounded-xl bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
						on:click={generateHomeworkHandler}
						disabled={generating || uploadingSource}
					>
						{#if generating || uploadingSource}
							<Spinner className="mr-2 size-4" />
						{/if}
						{generating ? '生成中...' : uploadingSource ? '处理中...' : '生成作业'}
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
