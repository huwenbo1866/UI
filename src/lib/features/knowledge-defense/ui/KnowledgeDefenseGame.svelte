<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { get } from 'svelte/store';
	import { getKnowledgeBases, searchKnowledgeFilesById } from '$lib/apis/knowledge';
	import {
		generateChapterHomeworkReinforcement,
		getFileChapterHomeworks,
		updateFileChapterHomework
	} from '$lib/apis/files';
	import {
		KD_AMPLIFY_PER_WRONG_MAX,
		KD_AMPLIFY_PER_WRONG_MIN,
		KD_CHAPTER_MAX_QUESTIONS,
		KD_CORRECT_COOLDOWN_ROUNDS,
		KD_ENABLE_DEBUG_LOGS,
		KD_MASTERY_STREAK_TO_REMOVE,
		KD_MASTERED_COOLDOWN_ROUNDS,
		KD_SYNC_BATCH_SIZE,
		KD_SYNC_DEFER_MS,
		KD_WRONG_COOLDOWN_BASE,
		KD_WRONG_COOLDOWN_MAX_ROUNDS,
		KD_WRONG_COOLDOWN_MIN_ROUNDS,
		PLAYFIELD_MIN_HEIGHT
	} from '../config/constants';
	import type { QuestionPack, RewardChoice, WrongNotebookStats } from '../core/types';
	import { isAnswerCorrectWithOptions } from '../core/utils';
	import { samplePack } from '../data/sample-pack';
	import { createInitialGameState } from '../state/game-store';
	import { audioManager } from '../systems/audio-manager';
	import {
		createInputState,
		attachKeyboard,
		updateTouchDirectionFromClientPoint,
		clearTouchDirection
	} from '../adapters/input-adapter';
	import {
		wrongNotebookStore,
		loadWrongNotebook,
		buildWrongNotebookStats,
		recordWrongNotebookEntry,
		markWrongNotebookCorrect,
		clearWrongNotebook
	} from '../adapters/wrong-question-adapter';
	import { updatePlayer } from '../systems/player-system';
	import { maybeSpawnMonster, updateMonsters } from '../systems/monster-system';
	import { tickDamageTexts } from '../systems/combat-feedback-system';
	import { tickAutoAttack, tickAttackSequences } from '../systems/auto-attack-system';
	import { updateProjectiles } from '../systems/projectile-system';
	import { applyRewardByKind } from '../systems/progression-system';
	import { addDrone, updateDrones } from '../systems/drone-system';
	import { openRewardPanel, closeRewardPanel } from '../systems/reward-system';
	import GameCanvas from './GameCanvas.svelte';
	import HudOverlay from './HudOverlay.svelte';
	import RewardPanel from './RewardPanel.svelte';
	import PrepPanel from './PrepPanel.svelte';
	import SettingsPanel from './SettingsPanel.svelte';
	import StartMenu from './StartMenu.svelte';
	import ExitConfirmPanel from './ExitConfirmPanel.svelte';

	export let pack: QuestionPack = samplePack;
	type ChapterHomeworkItem = {
		id: string;
		chapter_title: string;
		questions?: Array<Record<string, any>>;
	};

	let hostEl: HTMLDivElement;
	let frameHandle = 0;
	let lastFrameTs = 0;
	let teardownKeyboard = () => {};
	let detachGlobalHandler = () => {};

	let activePack: QuestionPack = pack ?? samplePack;
	let state = createInitialGameState(activePack, 1200, 820);
	let wrongNotebook = get(wrongNotebookStore);
	let rewardPanelOpenedFromPending = false;
	let showExitConfirm = false;

	// 非阻塞的错题分析统计（默认本地回退值，AI 只在打开面板时才异步执行）
	let wrongNotebookStats: WrongNotebookStats = {
		total: 0,
		repeated: 0,
		typeEntries: [],
		advice: ['加载中...']
	};

	const input = createInputState();
	let savingHomeworkProgress = false;

	let loadingKnowledgeBases = false;
	let loadingKnowledgeFiles = false;
	let loadingChapterHomeworks = false;
	let knowledgeBases: Array<{ id: string; name: string }> = [];
	let knowledgeFiles: Array<{ id: string; name: string }> = [];
	let chapterHomeworks: Array<{ id: string; chapter_title: string; question_count: number }> = [];
	let selectedKnowledgeId = '';
	let selectedFileId = '';
	let selectedHomeworkId = '';
	let usingSampleFallback = true;
	let chapterHomeworkPayload: ChapterHomeworkItem | null = null;
	let persistTimer: ReturnType<typeof setTimeout> | null = null;
	let pendingPersistAnswerCount = 0;
	let gameOverPersisted = false;

	const unsubscribeWrongNotebook = wrongNotebookStore.subscribe((items) => {
		wrongNotebook = items;
	});

	function resizeArena() {
		if (!hostEl) return;
		const rect = hostEl.getBoundingClientRect();
		const nextWidth = rect.width || 1200;
		const nextHeight = Math.max(PLAYFIELD_MIN_HEIGHT, rect.height || 820);
		state.width = nextWidth;
		state.height = nextHeight;
		state.player.x = Math.min(
			Math.max(state.player.x, state.player.radius),
			state.width - state.player.radius
		);
		state.player.y = Math.min(
			Math.max(state.player.y, state.player.radius),
			state.height - state.player.radius
		);
		state = { ...state };
	}

	function closeTransientPanels() {
		state.ui.showSettingsPanel = false;
		state.ui.showPrepPanel = false;
		if (state.ui.showRewardPanel) {
			closeRewardPanelKeepingPending();
		}
	}

	function resetRun(keepStartMenu = true) {
		const attackPreference = state.settings.attackPreference;
		state = createInitialGameState(activePack, state.width, state.height, attackPreference);
		state.ui.showStartMenu = keepStartMenu;
		state.runtime.running = !keepStartMenu;
		rewardPanelOpenedFromPending = false;
		showExitConfirm = false;
		gameOverPersisted = false;
	}

	$: {
		const isInPanel = state.ui.showRewardPanel || showExitConfirm;
		if (!isInPanel) {
			audioManager.playBGM(); // StartMenu 或战斗区 → 播放
		} else {
			audioManager.pauseBGM(); // RewardPanel 或 ExitConfirmPanel → 暂停
		}
	}

	function startRun() {
		resetRun(false);
		state.ui.showStartMenu = false;
		state.runtime.running = true;
		state = { ...state };
		requestAnimationFrame(() => resizeArena());
	}

	function exitToStartMenu() {
		void persistHomeworkProgress(true);
		state.runtime.running = false;
		state.ui.showRewardPanel = false;
		state.ui.showSettingsPanel = false;
		state.ui.showPrepPanel = false;
		state.ui.showStartMenu = true;
		closeRewardPanel(state);
		rewardPanelOpenedFromPending = false;
		showExitConfirm = false;
		clearTouchDirection(input);
		state = { ...state };
	}

	async function exitToAppHome() {
		showExitConfirm = false;
		closeTransientPanels();
		await goto('/');
	}

	function openSettings() {
		if (showExitConfirm) return;
		state.ui.showSettingsPanel = true;
		state.ui.showPrepPanel = false;
		state = { ...state };
	}

	function closeSettings() {
		state.ui.showSettingsPanel = false;
		state = { ...state };
	}

	// ========== 非阻塞核心：只有真正打开错题集时才异步调用 AI ==========
	async function openPrepPanel() {
		if (showExitConfirm) return;
		state.ui.showPrepPanel = true;
		state.ui.showSettingsPanel = false;
		state = { ...state };

		// 异步 + 完全错误隔离，绝不阻塞任何面板
		try {
			const stats = await buildWrongNotebookStats(wrongNotebook);
			wrongNotebookStats = stats;
		} catch (err) {
			console.warn('AI 分析失败，已自动回退本地逻辑', err);
			wrongNotebookStats = {
				total: wrongNotebook.length,
				repeated: wrongNotebook.filter((i) => i.wrong_count >= 2).length,
				typeEntries: [],
				advice: ['AI 分析暂时不可用，使用本地统计']
			};
		}
	}

	function closePrepPanel() {
		state.ui.showPrepPanel = false;
		state = { ...state };
	}

	async function clearPrepPanel() {
		await clearWrongNotebook(activePack.id).catch(() => undefined);
	}

	function changeAttackPreference(value: 'straight' | 'scatter') {
		state.settings.attackPreference = value;
		state.buffs.queuedWeaponBuff = null;
		state.buffs.queuedWeaponBuffUses = 0;
		state = { ...state };
	}

	function tryOpenRewardPanel() {
		if (showExitConfirm || state.progress.pendingLevelUps <= 0 || state.ui.showRewardPanel) return;
		state.progress.pendingLevelUps -= 1;
		openRewardPanel(state);
		rewardPanelOpenedFromPending = true;
		audioManager.pauseBGM();
		state = { ...state };
	}

	function closeRewardPanelKeepingPending() {
		if (rewardPanelOpenedFromPending) {
			state.progress.pendingLevelUps += 1;
			rewardPanelOpenedFromPending = false;
		}
		closeRewardPanel(state);
		audioManager.playBGM();
		state = { ...state };
	}

	function handlePlayerActivate() {
		if (
			showExitConfirm ||
			state.ui.showStartMenu ||
			state.ui.showSettingsPanel ||
			state.ui.showPrepPanel
		)
			return;
		if (state.progress.pendingLevelUps > 0) {
			tryOpenRewardPanel();
		}
	}

	function openExitConfirm() {
		if (state.ui.showStartMenu || showExitConfirm || state.player.hp <= 0) return;
		showExitConfirm = true;
		audioManager.pauseBGM();
	}

	function closeExitConfirm() {
		showExitConfirm = false;
		audioManager.playBGM();
	}

	function handleSurfaceTouchStart(event: TouchEvent) {
		if (
			!hostEl ||
			showExitConfirm ||
			state.ui.showStartMenu ||
			state.ui.showSettingsPanel ||
			state.ui.showPrepPanel ||
			state.ui.showRewardPanel
		)
			return;
		const touch = event.touches[0];
		if (!touch) return;
		updateTouchDirectionFromClientPoint(
			input,
			hostEl.getBoundingClientRect(),
			state.player.x,
			state.player.y,
			touch.clientX,
			touch.clientY
		);
	}

	function handleSurfaceTouchMove(event: TouchEvent) {
		if (
			!hostEl ||
			showExitConfirm ||
			state.ui.showStartMenu ||
			state.ui.showSettingsPanel ||
			state.ui.showPrepPanel ||
			state.ui.showRewardPanel
		)
			return;
		const touch = event.touches[0];
		if (!touch) return;
		updateTouchDirectionFromClientPoint(
			input,
			hostEl.getBoundingClientRect(),
			state.player.x,
			state.player.y,
			touch.clientX,
			touch.clientY
		);
	}

	function handleSurfaceTouchEnd() {
		clearTouchDirection(input);
	}

	async function handleRewardAnswer(
		event: CustomEvent<{ choice: RewardChoice; selected: string }>
	) {
		const { choice, selected } = event.detail;
		const isCorrect = isAnswerCorrectWithOptions(
			selected,
			choice.question.answer,
			choice.question.options ?? []
		);
		debugLog('answer.evaluated', {
			questionId: choice.question.id,
			selected,
			answer: choice.question.answer,
			isCorrect
		});

		if (isCorrect) {
			state.battle.correct += 1;
			state.battle.qaRound += 1;
			state.ui.rewardFeedback = `答对了：${choice.question.explanation}`;
			state.ui.rewardFeedbackKind = 'success';
			await markWrongNotebookCorrect(activePack.id, choice.question.id, activePack.source).catch(
				() => undefined
			);
			queuePersistProgress(choice.question, selected, true);

			if (choice.rewardKind === 'drone') {
				addDrone(state);
			}
			applyRewardByKind(state, choice.rewardKind);
			rewardPanelOpenedFromPending = false;
		} else {
			state.battle.wrong += 1;
			state.battle.qaRound += 1;
			state.ui.rewardFeedback = `答错了。正确答案：${choice.question.answer}`;
			state.ui.rewardFeedbackKind = 'error';
			await recordWrongNotebookEntry(activePack.id, choice.question, selected, activePack.source).catch(
				() => undefined
			);
			queuePersistProgress(choice.question, selected, false);
			closeRewardPanel(state);
			rewardPanelOpenedFromPending = false;
		}

		state = { ...state };
	}

	function gameLoop(ts: number) {
		if (!lastFrameTs) lastFrameTs = ts;
		const rawDtMs = Math.min(40, ts - lastFrameTs);
		lastFrameTs = ts;

		const shouldSimulate =
			state.runtime.running &&
			state.player.hp > 0 &&
			!showExitConfirm &&
			!state.ui.showStartMenu &&
			!state.ui.showSettingsPanel &&
			!state.ui.showPrepPanel &&
			!state.ui.showRewardPanel;

		if (shouldSimulate) {
			const dtMs = rawDtMs * state.runtime.timeScale;
			const dtSeconds = dtMs / 1000;

			maybeSpawnMonster(state, dtMs);
			updatePlayer(state, input, dtSeconds, dtMs);
			updateMonsters(state, dtSeconds, dtMs);
			tickAutoAttack(state, dtMs);
			tickAttackSequences(state, dtMs);
			updateProjectiles(state, dtSeconds);
			updateDrones(state, dtSeconds, dtMs);
			tickDamageTexts(state, dtSeconds, dtMs);
			state = { ...state };
		}

		frameHandle = requestAnimationFrame(gameLoop);
	}

	onMount(() => {
		debugLog('system.ready', {
			debugEnabled: KD_ENABLE_DEBUG_LOGS
		});
		void initializeKnowledgeSource();
		teardownKeyboard = attachKeyboard(input);
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.code === 'Space') {
				event.preventDefault();
				handlePlayerActivate();
				return;
			}

			if (event.key === 'Escape') {
				event.preventDefault();

				if (showExitConfirm) {
					closeExitConfirm();
					return;
				}

				if (state.ui.showSettingsPanel) {
					closeSettings();
					return;
				}

				if (state.ui.showPrepPanel) {
					closePrepPanel();
					return;
				}

				if (state.ui.showRewardPanel) {
					closeRewardPanelKeepingPending();
					return;
				}

				if (state.ui.showStartMenu) {
					void exitToAppHome();
					return;
				}

				openExitConfirm();
			}
		};

		window.addEventListener('keydown', onKeyDown);
		detachGlobalHandler = () => window.removeEventListener('keydown', onKeyDown);

		void loadWrongNotebook(activePack.id).catch(() => undefined);
		resizeArena();
		const onResize = () => resizeArena();
		window.addEventListener('resize', onResize);
		frameHandle = requestAnimationFrame(gameLoop);

		return () => {
			window.removeEventListener('resize', onResize);
		};
	});

	onDestroy(() => {
		if (persistTimer) {
			clearTimeout(persistTimer);
			persistTimer = null;
		}
		void persistHomeworkProgress();
		teardownKeyboard();
		detachGlobalHandler();
		unsubscribeWrongNotebook();
		if (frameHandle) cancelAnimationFrame(frameHandle);
	});

	$: if (state.player.hp <= 0 && !gameOverPersisted) {
		gameOverPersisted = true;
		void persistHomeworkProgress(true);
	}

	function getToken() {
		if (typeof localStorage === 'undefined') return '';
		return localStorage.token ?? '';
	}

	function getQuestionOptions(raw: any): string[] {
		if (Array.isArray(raw)) {
			const values = raw
				.map((item) => (typeof item === 'string' ? item.trim() : String(item ?? '').trim()))
				.filter(Boolean);
			if (values.length >= 2) return values;
		}
		return ['A', 'B', 'C', 'D'];
	}

	function normalizeChapterHomeworkToPack(
		homework: ChapterHomeworkItem,
		fileId: string
	): QuestionPack | null {
		const questions = (homework.questions ?? [])
			.map((item, idx) => {
				const questionText = String(item?.question ?? '').trim();
				const answer = String(item?.answer ?? '').trim();
				if (!questionText || !answer) return null;

				const perf = item?.performance ?? {};
				const attempts = Number(perf?.attempts ?? 0);
				const correct = Number(perf?.correct ?? 0);
				const wrong = Number(perf?.wrong ?? 0);
				const accuracy = attempts > 0 ? correct / attempts : 0;

				return {
					id: `hw-${homework.id}-${idx}`,
					difficulty: (['easy', 'medium', 'hard'].includes(item?.difficulty)
						? item.difficulty
						: 'medium') as 'easy' | 'medium' | 'hard',
					prompt: questionText,
					options: getQuestionOptions(item?.options),
					answer,
					explanation: String(item?.analysis ?? item?.explanation ?? '请回到章节内容复盘本题。').trim(),
					sourceIndex: idx,
					performance: {
						attempts,
						correct,
						wrong,
						accuracy,
						consecutive_correct_count: Number(perf?.consecutive_correct_count ?? 0),
						cooldown_until_round: Number(perf?.cooldown_until_round ?? 0),
						last_user_answer:
							typeof perf?.last_user_answer === 'string' ? perf.last_user_answer : undefined,
						last_result:
							perf?.last_result === 'correct' || perf?.last_result === 'wrong'
								? perf.last_result
								: undefined,
						updated_at:
							typeof perf?.updated_at === 'number' ? perf.updated_at : undefined
					}
				};
			})
			.filter(Boolean);

		if (questions.length < 3) return null;

		return {
			id: `chapter-homework-${homework.id}`,
			title: `章节闯关 · ${homework.chapter_title}`,
			description: '知识库章节作业题源（实时按答题表现进行个性化强化）',
			source: { file_id: fileId, chapter: homework.chapter_title },
			questions: questions as QuestionPack['questions']
		};
	}

	async function initializeKnowledgeSource() {
		const token = getToken();
		if (!token) return;
		loadingKnowledgeBases = true;
		try {
			const res = await getKnowledgeBases(token, 1);
			knowledgeBases = (res?.items ?? []).map((kb) => ({ id: kb.id, name: kb.name ?? kb.id }));
		} catch (e) {
			console.warn('加载知识库失败，将继续使用 sample_pack', e);
		} finally {
			loadingKnowledgeBases = false;
		}
	}

	async function handleKnowledgeChange(value: string) {
		selectedKnowledgeId = value;
		selectedFileId = '';
		selectedHomeworkId = '';
		knowledgeFiles = [];
		chapterHomeworks = [];
		chapterHomeworkPayload = null;
		activePack = samplePack;
		usingSampleFallback = true;

		if (!value) return;
		const token = getToken();
		if (!token) return;
		loadingKnowledgeFiles = true;
		try {
			const res = await searchKnowledgeFilesById(token, value, null, null, null, null, 1);
			knowledgeFiles = (res?.items ?? []).map((item) => ({
				id: item.id,
				name: item?.meta?.name || item?.filename || item.id
			}));
		} catch (e) {
			console.warn('加载知识库文件失败，将继续使用 sample_pack', e);
		} finally {
			loadingKnowledgeFiles = false;
		}
	}

	async function handleFileChange(value: string) {
		selectedFileId = value;
		selectedHomeworkId = '';
		chapterHomeworkPayload = null;
		chapterHomeworks = [];
		activePack = samplePack;
		usingSampleFallback = true;

		if (!value) return;
		const token = getToken();
		if (!token) return;
		loadingChapterHomeworks = true;
		try {
			const items = await getFileChapterHomeworks(token, value);
			chapterHomeworks = (items ?? []).map((item) => ({
				id: item.id,
				chapter_title: item.chapter_title ?? '未命名章节',
				question_count: Array.isArray(item.questions) ? item.questions.length : 0
			}));
		} catch (e) {
			console.warn('加载章节作业失败，将继续使用 sample_pack', e);
		} finally {
			loadingChapterHomeworks = false;
		}
	}

	async function handleChapterHomeworkChange(value: string) {
		selectedHomeworkId = value;
		chapterHomeworkPayload = null;
		activePack = samplePack;
		usingSampleFallback = true;
		if (!value || !selectedFileId) return;

		const token = getToken();
		if (!token) return;
		loadingChapterHomeworks = true;
		try {
			const items = await getFileChapterHomeworks(token, selectedFileId);
			const target = (items ?? []).find((item) => item.id === value);
			if (!target) return;
			const nextPack = normalizeChapterHomeworkToPack(target, selectedFileId);
			if (!nextPack) return;
			chapterHomeworkPayload = target;
			activePack = nextPack;
			usingSampleFallback = false;
			resetRun(true);
			void loadWrongNotebook(activePack.id).catch(() => undefined);
		} catch (e) {
			console.warn('切换章节作业失败，将继续使用 sample_pack', e);
		} finally {
			loadingChapterHomeworks = false;
		}
	}

	function queuePersistProgress(question: RewardChoice['question'], selected: string, isCorrect: boolean) {
		if (usingSampleFallback || !chapterHomeworkPayload || !selectedFileId || !selectedHomeworkId) return;
		const idx = question.sourceIndex;
		if (typeof idx !== 'number') return;
		const questionList = chapterHomeworkPayload.questions ?? [];
		const row = questionList[idx];
		if (!row) return;

		const now = Date.now();
		const previous = row.performance ?? {};
		const attempts = Number(previous.attempts ?? 0) + 1;
		const correct = Number(previous.correct ?? 0) + (isCorrect ? 1 : 0);
		const wrong = Number(previous.wrong ?? 0) + (isCorrect ? 0 : 1);
		const previousStreak = Number(previous.consecutive_correct_count ?? 0);
		const nextStreak = isCorrect ? previousStreak + 1 : 0;
		const cooldownGap = isCorrect
			? nextStreak >= KD_MASTERY_STREAK_TO_REMOVE
				? KD_MASTERED_COOLDOWN_ROUNDS
				: KD_CORRECT_COOLDOWN_ROUNDS
			: Math.max(
					KD_WRONG_COOLDOWN_MIN_ROUNDS,
					Math.min(KD_WRONG_COOLDOWN_MAX_ROUNDS, KD_WRONG_COOLDOWN_BASE + Number(previous.wrong ?? 0))
				);
		row.performance = {
			attempts,
			correct,
			wrong,
			accuracy: attempts > 0 ? Number((correct / attempts).toFixed(4)) : 0,
			consecutive_correct_count: nextStreak,
			cooldown_until_round: state.battle.qaRound + cooldownGap,
			last_user_answer: selected,
			last_result: isCorrect ? 'correct' : 'wrong',
			updated_at: now
		};

		const liveQuestion = state.pack.questions.find((item) => item.id === question.id);
		if (liveQuestion) {
			liveQuestion.performance = { ...row.performance };
		}
		debugLog('answer.recorded', {
			questionId: question.id,
			nextPerformance: row.performance
		});

		pendingPersistAnswerCount += 1;
		if (pendingPersistAnswerCount >= KD_SYNC_BATCH_SIZE) {
			void persistHomeworkProgress(true);
			return;
		}

		if (!persistTimer) {
			persistTimer = setTimeout(() => {
				void persistHomeworkProgress();
			}, KD_SYNC_DEFER_MS);
		}
	}

	async function buildRefreshedHomeworkQuestions(): Promise<Array<Record<string, any>>> {
		const sourceQuestions = chapterHomeworkPayload?.questions ?? [];
		const keepList = sourceQuestions.filter((item) => {
			const perf = item?.performance ?? {};
			const attempts = Number(perf?.attempts ?? 0);
			const wrong = Number(perf?.wrong ?? 0);
			const streak = Number(perf?.consecutive_correct_count ?? 0);
			if (attempts <= 0) return true;
			if (wrong > 0 && streak < KD_MASTERY_STREAK_TO_REMOVE) return true;
			if (streak >= KD_MASTERY_STREAK_TO_REMOVE) return false;
			return false;
		});

		const wrongSeeds = keepList.filter((item) => Number(item?.performance?.wrong ?? 0) > 0);
		const next = [...keepList];

		const remainingSlots = Math.max(0, KD_CHAPTER_MAX_QUESTIONS - next.length);
		const token = getToken();
		if (wrongSeeds.length > 0 && remainingSlots > 0 && token && selectedFileId && selectedHomeworkId) {
			const reinforceCount = Math.min(
				remainingSlots,
				wrongSeeds.reduce((sum, item) => {
					const wrongLevel = Number(item?.performance?.wrong ?? 1);
					return (
						sum + Math.min(KD_AMPLIFY_PER_WRONG_MAX, Math.max(KD_AMPLIFY_PER_WRONG_MIN, wrongLevel))
					);
				}, 0)
			);

			const generated = await generateChapterHomeworkReinforcement(
				token,
				selectedFileId,
				selectedHomeworkId,
				{
					chapter_title: chapterHomeworkPayload?.chapter_title || '',
					subject: null,
					count: reinforceCount,
					wrong_records: wrongSeeds.map((seed) => ({
						question: seed?.question,
						answer: seed?.answer,
						options: seed?.options,
						analysis: seed?.analysis,
						type: seed?.type,
						performance: seed?.performance
					})),
					existing_questions: next.map((item) => String(item?.question ?? ''))
				}
			).catch((err) => {
				debugLog('chapter.reinforce.ai.error', {
					error: String(err)
				});
				return [];
			});

			for (const item of generated ?? []) {
				if (next.length >= KD_CHAPTER_MAX_QUESTIONS) break;
				next.push({
					...item,
					performance: {
						attempts: 0,
						correct: 0,
						wrong: 0,
						accuracy: 0,
						consecutive_correct_count: 0,
						cooldown_until_round: state.battle.qaRound + 1
					}
				});
			}
		}
		debugLog('chapter.refresh.built', {
			sourceCount: sourceQuestions.length,
			keepCount: keepList.length,
			wrongSeedCount: wrongSeeds.length,
			resultCount: next.length
		});
		return next.slice(0, KD_CHAPTER_MAX_QUESTIONS);
	}

	async function persistHomeworkProgress(force = false) {
		if (savingHomeworkProgress || usingSampleFallback || !chapterHomeworkPayload) return;
		if (!force && pendingPersistAnswerCount <= 0) return;
		const token = getToken();
		if (!token || !selectedFileId || !selectedHomeworkId) return;
		if (persistTimer) {
			clearTimeout(persistTimer);
			persistTimer = null;
		}
		savingHomeworkProgress = true;
		try {
			const refreshedQuestions = await buildRefreshedHomeworkQuestions();
			debugLog('chapter.sync.start', {
				fileId: selectedFileId,
				homeworkId: selectedHomeworkId,
				pendingPersistAnswerCount,
				questionCount: refreshedQuestions.length,
				force
			});
			await updateFileChapterHomework(token, selectedFileId, selectedHomeworkId, {
				questions: refreshedQuestions
			});
			const updatedPayload = {
				...chapterHomeworkPayload,
				questions: refreshedQuestions
			};
			chapterHomeworkPayload = updatedPayload;
			const refreshedPack = normalizeChapterHomeworkToPack(updatedPayload, selectedFileId);
			if (refreshedPack) {
				activePack = refreshedPack;
				state.pack = refreshedPack;
				state = { ...state };
			}
			pendingPersistAnswerCount = 0;
			debugLog('chapter.sync.success', {
				fileId: selectedFileId,
				homeworkId: selectedHomeworkId,
				questionCount: refreshedQuestions.length
			});
		} catch (e) {
			console.warn('题目表现回传失败，本局仍会继续使用本地个性化策略', e);
			debugLog('chapter.sync.error', {
				fileId: selectedFileId,
				homeworkId: selectedHomeworkId,
				error: e instanceof Error ? e.message : String(e)
			});
		} finally {
			savingHomeworkProgress = false;
		}
	}

	function debugLog(event: string, payload?: Record<string, any>) {
		if (!KD_ENABLE_DEBUG_LOGS) return;
		const message = `[KnowledgeDefense] ${event}`;
		console.log(message, payload ?? {});
		try {
			if (window.top && window.top !== window && window.top.console?.log) {
				window.top.console.log(message, payload ?? {});
			}
		} catch {
			// ignore cross-frame access errors
		}
	}
</script>

<div class="page-shell">
	{#if state.ui.showStartMenu}
		<div class="start-shell">
			<StartMenu
				attackPreference={state.settings.attackPreference}
				wrongCount={wrongNotebook.length}
				on:start={startRun}
				on:settings={openSettings}
				on:notebook={openPrepPanel}
				on:exitHome={exitToAppHome}
			/>
		</div>
	{:else}
		<div class="arena-shell" bind:this={hostEl}>
			<GameCanvas
				width={state.width}
				height={state.height}
				player={state.player}
				progress={state.progress}
				monsters={state.monsters}
				projectiles={state.projectiles}
				drones={state.drones}
				lasers={state.lasers}
				damageTexts={state.damageTexts}
				pendingLevelUps={state.progress.pendingLevelUps}
				onTouchStartPoint={handleSurfaceTouchStart}
				onTouchMovePoint={handleSurfaceTouchMove}
				onTouchEndPoint={handleSurfaceTouchEnd}
				onPlayerActivate={handlePlayerActivate}
			/>

			<HudOverlay on:exit={openExitConfirm} />

			{#if state.ui.showRewardPanel}
				<RewardPanel
					choices={state.ui.rewardChoices}
					feedback={state.ui.rewardFeedback}
					feedbackKind={state.ui.rewardFeedbackKind}
					on:answer={handleRewardAnswer}
					on:close={closeRewardPanelKeepingPending}
				/>
			{/if}

			{#if state.player.hp <= 0}
				<div class="game-over">
					<div class="game-over-card">
						<h2>本局结束</h2>
						<p>你被怪物突破防线了。保留下来的错题已经进入错题集，可以先复盘再开一局。</p>
						<div class="stats-grid">
							<div><span>等级</span><strong>Lv.{state.progress.level}</strong></div>
							<div><span>击杀</span><strong>{state.battle.kills}</strong></div>
							<div><span>答对</span><strong>{state.battle.correct}</strong></div>
							<div><span>答错</span><strong>{state.battle.wrong}</strong></div>
						</div>
						<div class="actions">
							<button type="button" on:click={startRun}>重新开始</button>
							<button type="button" class="secondary" on:click={exitToStartMenu}>返回启动页</button>
						</div>
					</div>
				</div>
			{/if}
		</div>
	{/if}

	<PrepPanel
		visible={state.ui.showPrepPanel}
		items={wrongNotebook}
		stats={wrongNotebookStats}
		onClose={closePrepPanel}
		onClear={clearPrepPanel}
	/>

	<SettingsPanel
		visible={state.ui.showSettingsPanel}
		attackPreference={state.settings.attackPreference}
		loadingKnowledgeBases={loadingKnowledgeBases}
		loadingKnowledgeFiles={loadingKnowledgeFiles}
		loadingChapterHomeworks={loadingChapterHomeworks}
		knowledgeBases={knowledgeBases}
		knowledgeFiles={knowledgeFiles}
		chapterHomeworks={chapterHomeworks}
		selectedKnowledgeId={selectedKnowledgeId}
		selectedFileId={selectedFileId}
		selectedHomeworkId={selectedHomeworkId}
		usingSampleFallback={usingSampleFallback}
		on:close={closeSettings}
		on:changePreference={(event) => changeAttackPreference(event.detail.value)}
		on:changeKnowledge={(event) => handleKnowledgeChange(event.detail.value)}
		on:changeFile={(event) => handleFileChange(event.detail.value)}
		on:changeChapterHomework={(event) => handleChapterHomeworkChange(event.detail.value)}
	/>

	<ExitConfirmPanel
		visible={showExitConfirm}
		title="确认退出本局？"
		description="退出后将返回启动页，本局战斗会暂停并中断。你可以稍后从启动页重新开始。"
		confirmText="确定"
		cancelText="继续游戏"
		on:confirm={exitToStartMenu}
		on:cancel={closeExitConfirm}
	/>
</div>

<style>
	.page-shell {
		position: relative;
		width: 100%;
		min-height: 100vh;
		box-sizing: border-box;
		background: linear-gradient(180deg, #faf7f3 0%, #f4eee7 100%);
		overflow: hidden;
	}

	.start-shell {
		min-height: 100vh;
	}

	.arena-shell {
		position: relative;
		width: min(100%, 1600px);
		min-height: 100vh;
		margin: 0 auto;
		padding: 16px;
		box-sizing: border-box;
	}

	.game-over {
		position: absolute;
		inset: 16px;
		display: grid;
		place-items: center;
		background: rgba(39, 28, 19, 0.38);
		backdrop-filter: blur(4px);
		z-index: 170;
		border-radius: 28px;
	}

	.game-over-card {
		width: min(560px, calc(100vw - 40px));
		background: #fffaf4;
		border: 1px solid #e6d7c7;
		border-radius: 28px;
		padding: 24px;
		box-shadow: 0 24px 60px rgba(54, 41, 30, 0.18);
	}

	.game-over-card h2 {
		margin: 0 0 10px;
		font-size: 30px;
		color: #5b4837;
	}

	.game-over-card p {
		margin: 0;
		color: #7b6756;
		line-height: 1.7;
	}

	.stats-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 12px;
		margin-top: 18px;
	}

	.stats-grid > div {
		border-radius: 18px;
		padding: 14px;
		background: #fffdf9;
		border: 1px solid #ecdccb;
	}

	.stats-grid span {
		display: block;
		color: #8b7767;
		font-size: 12px;
		margin-bottom: 6px;
	}

	.stats-grid strong {
		font-size: 24px;
		color: #4e3c2e;
	}

	.actions {
		margin-top: 18px;
		display: flex;
		gap: 12px;
		flex-wrap: wrap;
	}

	.actions button {
		border: 1px solid #b69b7c;
		background: #fff4e6;
		color: #5a4736;
		border-radius: 16px;
		padding: 12px 16px;
		font-weight: 700;
		cursor: pointer;
	}

	.actions .secondary {
		background: #fff;
	}

	@media (max-width: 900px) {
		.arena-shell {
			padding: 10px;
		}

		.game-over {
			inset: 10px;
		}
	}
</style>