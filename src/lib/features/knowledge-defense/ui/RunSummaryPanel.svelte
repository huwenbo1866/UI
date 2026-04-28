<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import type { RunSummary } from '../core/types';

	export let summary: RunSummary;

	const dispatch = createEventDispatcher<{ restart: void; startMenu: void }>();
</script>

<div class="overlay">
	<section class="panel" aria-label="本局复盘">
		<div class="hero">
			<div class="eyebrow">本局复盘</div>
			<h2>{summary.primaryDefeatReason}</h2>
			<p>{summary.explanation}</p>
		</div>

		<div class="note">本局错题已进入错题集，建议先看清失守原因，再决定立刻重开还是回到启动页调整。</div>

		<div class="stats-grid">
			<div class="stat-card emphasis">
				<span>生存时间</span>
				<strong>{summary.survivalTimeLabel}</strong>
			</div>
			<div class="stat-card">
				<span>达到等级</span>
				<strong>Lv.{summary.levelReached}</strong>
			</div>
			<div class="stat-card">
				<span>击杀</span>
				<strong>{summary.kills}</strong>
			</div>
			<div class="stat-card">
				<span>答对</span>
				<strong>{summary.correct}</strong>
			</div>
			<div class="stat-card">
				<span>答错</span>
				<strong>{summary.wrong}</strong>
			</div>
			<div class="stat-card">
				<span>准确率</span>
				<strong>{summary.accuracyLabel}</strong>
			</div>
			<div class="stat-card emphasis">
				<span>待领奖励</span>
				<strong>{summary.pendingRewards}</strong>
			</div>
		</div>

		<div class="tips-card">
			<h3>下局建议</h3>
			<ul>
				{#each summary.tips as tip}
					<li>{tip}</li>
				{/each}
			</ul>
		</div>

		<div class="actions">
			<button type="button" class="primary" on:click={() => dispatch('restart')}>重新开始</button>
			<button type="button" class="secondary" on:click={() => dispatch('startMenu')}
				>返回启动页</button
			>
		</div>
	</section>
</div>

<style>
	.overlay {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		padding: 20px;
		background: rgba(39, 28, 19, 0.38);
		backdrop-filter: blur(4px);
		z-index: 170;
	}

	.panel {
		--summary-bg: #fffaf4;
		--summary-bg-soft: #fffdf9;
		--summary-border: #e6d7c7;
		--summary-border-strong: #d8c0a0;
		--summary-text: #5b4837;
		--summary-text-soft: #7b6756;
		--summary-accent: #f59e0b;
		--summary-accent-soft: #fff3df;
		width: min(860px, calc(100vw - 40px));
		max-height: min(88dvh, 920px);
		overflow: auto;
		background: var(--summary-bg);
		border: 1px solid var(--summary-border);
		border-radius: 28px;
		padding: 24px;
		box-shadow: 0 24px 60px rgba(54, 41, 30, 0.18);
	}

	.hero h2 {
		margin: 10px 0 0;
		font-size: clamp(28px, 4vw, 40px);
		color: var(--summary-text);
	}

	.hero p {
		margin: 12px 0 0;
		color: var(--summary-text-soft);
		line-height: 1.8;
		font-size: 16px;
	}

	.eyebrow {
		display: inline-flex;
		padding: 8px 14px;
		border-radius: 999px;
		background: var(--summary-accent-soft);
		color: #9a5c0e;
		font-size: 13px;
		font-weight: 800;
	}

	.note,
	.tips-card,
	.stat-card {
		background: var(--summary-bg-soft);
		border: 1px solid var(--summary-border);
		border-radius: 20px;
	}

	.note {
		margin-top: 18px;
		padding: 14px 16px;
		color: var(--summary-text-soft);
		line-height: 1.75;
	}

	.stats-grid {
		margin-top: 18px;
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 12px;
	}

	.stat-card {
		padding: 16px;
		display: grid;
		gap: 8px;
	}

	.stat-card.emphasis {
		border-color: var(--summary-border-strong);
		background: linear-gradient(180deg, #fff8ee, var(--summary-bg-soft));
	}

	.stat-card span {
		font-size: 12px;
		color: var(--summary-text-soft);
	}

	.stat-card strong {
		font-size: clamp(20px, 3vw, 28px);
		color: var(--summary-text);
	}

	.tips-card {
		margin-top: 18px;
		padding: 18px;
	}

	.tips-card h3 {
		margin: 0 0 12px;
		font-size: 22px;
		color: var(--summary-text);
	}

	.tips-card ul {
		margin: 0;
		padding-left: 20px;
		color: #6d5847;
		line-height: 1.85;
	}

	.tips-card li + li {
		margin-top: 8px;
	}

	.actions {
		margin-top: 20px;
		display: flex;
		justify-content: flex-end;
		gap: 12px;
		flex-wrap: wrap;
	}

	button {
		border-radius: 16px;
		padding: 12px 18px;
		font-weight: 800;
		cursor: pointer;
	}

	.primary {
		border: 1px solid var(--summary-accent);
		background: linear-gradient(180deg, #fbbf24, #f59e0b);
		color: #fff;
	}

	.secondary {
		border: 1px solid #b69b7c;
		background: #fff8ef;
		color: #5a4736;
	}

	@media (max-width: 820px) {
		.panel {
			padding: 18px;
			border-radius: 24px;
		}

		.stats-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (max-width: 560px) {
		.overlay {
			padding: 12px;
			align-items: end;
		}

		.panel {
			width: 100%;
			max-height: 92dvh;
			border-radius: 22px 22px 0 0;
			padding: 16px;
		}

		.stats-grid {
			grid-template-columns: 1fr;
		}

		.actions {
			justify-content: stretch;
		}

		.actions button {
			width: 100%;
		}
	}
</style>
