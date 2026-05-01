<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { KNOWLEDGE_DEFENSE_MODE_NAME } from '../systems/mode-guidance';

	interface KnowledgeBaseOption {
		id: string;
		name: string;
	}

	interface KnowledgeFileOption {
		id: string;
		name: string;
	}

	interface ChapterHomeworkOption {
		id: string;
		chapter_title: string;
		question_count: number;
	}

	export let visible = false;

	export let loadingKnowledgeBases = false;
	export let loadingKnowledgeFiles = false;
	export let loadingChapterHomeworks = false;

	export let knowledgeBases: KnowledgeBaseOption[] = [];
	export let knowledgeFiles: KnowledgeFileOption[] = [];
	export let chapterHomeworks: ChapterHomeworkOption[] = [];

	export let selectedKnowledgeId = '';
	export let selectedFileId = '';
	export let selectedHomeworkId = '';
	export let usingSampleFallback = true;
	export let sourceLabel = '备用样例题源（Fallback）';
	export let sourceDetail = '';

	const dispatch = createEventDispatcher<{
		close: void;
		changeKnowledge: { value: string };
		changeFile: { value: string };
		changeChapterHomework: { value: string };
	}>();

	function close() {
		dispatch('close');
	}

	function handleOverlayKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			close();
		}
	}

	$: sourceModeLabel = usingSampleFallback ? 'Fallback' : '章节作业';
</script>

{#if visible}
	<div
		class="overlay"
		role="button"
		tabindex="0"
		aria-label="关闭设置面板"
		on:click|self={close}
		on:keydown|self={handleOverlayKeydown}
	>
		<div class="panel">
			<div class="header">
				<div class="header-copy">
					<div class="eyebrow">Command Desk</div>
					<h2>{KNOWLEDGE_DEFENSE_MODE_NAME} · 设置</h2>
					<p>在这里确认战前题源路径与当前回退状态；只改界面与选择，不改变现有玩法逻辑。</p>
				</div>

				<button type="button" class="close" on:click={close}>关闭</button>
			</div>

			<div class="summary-grid">
				<section class="summary-card">
					<span class="summary-tag">Source Route</span>
					<strong>{sourceLabel}</strong>
					<p>{sourceDetail}</p>
				</section>

				<section class="summary-card" class:fallback={usingSampleFallback}>
					<span class="summary-tag">Current State</span>
					<strong>{sourceModeLabel}</strong>
					<p>{usingSampleFallback ? '章节不可用时明确回退到样例题源。' : '当前已连接知识库章节作业。'}</p>
				</section>
			</div>

			<div class="layout">
				<section class="section source-section">
					<div class="section-head">
						<h3>题目来源（知识库章节作业）</h3>
						<span>沿用当前 fallback 机制与错题持久化流程</span>
					</div>

					<div class="field-grid">
						<label>
							<span>知识库</span>
							<select
								value={selectedKnowledgeId}
								disabled={loadingKnowledgeBases}
								aria-label="选择知识库"
								on:change={(event) =>
									dispatch('changeKnowledge', {
										value: (event.currentTarget as HTMLSelectElement).value
									})}
							>
								<option value="">{loadingKnowledgeBases ? '知识库加载中...' : '选择知识库'}</option>
								{#each knowledgeBases as kb}
									<option value={kb.id}>{kb.name}</option>
								{/each}
							</select>
						</label>

						<label>
							<span>文件</span>
							<select
								value={selectedFileId}
								disabled={!selectedKnowledgeId || loadingKnowledgeFiles}
								aria-label="选择知识库文件"
								on:change={(event) =>
									dispatch('changeFile', {
										value: (event.currentTarget as HTMLSelectElement).value
									})}
							>
								<option value="">{loadingKnowledgeFiles ? '文件加载中...' : '选择文件'}</option>
								{#each knowledgeFiles as file}
									<option value={file.id}>{file.name}</option>
								{/each}
							</select>
						</label>

						<label>
							<span>章节作业</span>
							<select
								value={selectedHomeworkId}
								disabled={!selectedFileId || loadingChapterHomeworks}
								aria-label="选择章节作业"
								on:change={(event) =>
									dispatch('changeChapterHomework', {
										value: (event.currentTarget as HTMLSelectElement).value
									})}
							>
								<option value="">{loadingChapterHomeworks ? '章节作业加载中...' : '选择章节作业'}</option>
								{#each chapterHomeworks as hw}
									<option value={hw.id}>{hw.chapter_title}（{hw.question_count}题）</option>
								{/each}
							</select>
						</label>
					</div>

					<div class="source-tip" class:fallback={usingSampleFallback}>
						<strong>{sourceLabel}</strong>
						<span>{sourceDetail}</span>
					</div>
				</section>
			</div>
		</div>
	</div>
{/if}

<style>
	.overlay {
		position: fixed;
		inset: 0;
		z-index: 160;
		display: grid;
		place-items: center;
		padding: 20px;
		background: rgba(39, 28, 19, 0.28);
		backdrop-filter: blur(4px);
	}

	.panel {
		--settings-bg: #fffaf4;
		--settings-bg-soft: #fffdf9;
		--settings-border: #e3d5c7;
		--settings-text: #5b4837;
		--settings-text-soft: #7b6756;
		width: min(980px, calc(100vw - 40px));
		max-height: min(90dvh, 940px);
		overflow: auto;
		background: var(--settings-bg);
		border: 1px solid var(--settings-border);
		border-radius: 28px;
		padding: 18px;
		box-shadow: 0 24px 60px rgba(54, 41, 30, 0.16);
	}

	.header,
	.section-head,
	.summary-grid,
	.layout,
	.field-grid {
		display: grid;
	}

	.header {
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 14px;
		align-items: start;
	}

	.header-copy,
	.summary-card,
	.section,
	.field-grid label,
	.source-tip {
		display: grid;
		gap: 8px;
	}

	.eyebrow,
	.summary-tag {
		display: inline-flex;
		align-items: center;
		width: fit-content;
		border-radius: 999px;
		font-size: 11px;
		font-weight: 800;
	}

	.eyebrow {
		padding: 7px 12px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		background: #fff1d7;
		color: #a26514;
	}

	.header h2 {
		margin: 0;
		font-size: clamp(28px, 3.8vw, 38px);
		color: var(--settings-text);
	}

	.header p,
	.summary-card p,
	.section-head span,
	.field-grid label span,
	.source-tip span {
		margin: 0;
		color: var(--settings-text-soft);
		line-height: 1.7;
	}

	.close {
		border: 1px solid #b69b7c;
		background: #fff8ef;
		color: #5a4736;
		border-radius: 14px;
		padding: 10px 14px;
		font-weight: 800;
		cursor: pointer;
	}

	.summary-grid {
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 12px;
		margin-top: 14px;
	}

	.summary-card,
	.section,
	.source-tip {
		border-radius: 20px;
		border: 1px solid var(--settings-border);
		background: var(--settings-bg-soft);
	}

	.summary-card {
		padding: 14px;
	}

	.summary-card strong,
	.section h3,
	.source-tip strong {
		color: var(--settings-text);
	}

	.summary-card strong {
		font-size: 22px;
	}

	.summary-card.compact-card strong {
		font-size: 18px;
	}

	.summary-tag {
		padding: 6px 10px;
		background: rgba(244, 237, 228, 0.96);
		color: #9a5c0e;
	}

	.layout {
		grid-template-columns: minmax(0, 1fr);
		gap: 12px;
		margin-top: 14px;
	}

	.section {
		padding: 14px;
	}

	.section-head {
		gap: 4px;
		margin-bottom: 12px;
	}

	.section h3 {
		margin: 0;
		font-size: 20px;
	}

	.field-grid {
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 10px;
	}

	.field-grid label {
		color: #6b5848;
		font-size: 13px;
	}

	.field-grid select {
		border: 1px solid #ddccb8;
		border-radius: 14px;
		padding: 10px 12px;
		background: #fffdfa;
		color: #4f3d2f;
		min-width: 0;
	}

	.source-tip {
		margin-top: 10px;
		padding: 12px 14px;
	}

	.source-tip.fallback {
		color: #a16207;
		border-color: #edc98e;
		background: #fff8ee;
	}

	@media (max-width: 980px) {
		.summary-grid,
		.field-grid {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 640px) {
		.overlay {
			padding: 12px;
			align-items: end;
		}

		.panel {
			width: 100%;
			max-height: 92dvh;
			border-radius: 22px 22px 0 0;
			padding: 14px;
		}

		.header {
			grid-template-columns: 1fr;
		}

		.close {
			width: 100%;
		}
	}
</style>
