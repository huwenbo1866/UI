<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import type { RunSummary } from '../core/types';

	export let summary: RunSummary;

	const dispatch = createEventDispatcher<{ restart: void; startMenu: void }>();
</script>

<div class="overlay">
	<section class="panel" aria-label="本局复盘">
		<div class="hero">
			<div class="hero-copy">
				<div class="eyebrow">本局复盘</div>
				<h2>{summary.primaryDefeatReason}</h2>
				<p>{summary.explanation}</p>
			</div>

			<div class="hero-callout">
				<span>待领奖励</span>
				<strong>{summary.pendingRewards}</strong>
				<small>下局记得在安全空档及时领取</small>
			</div>
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
				<span>答题</span>
				<strong>{summary.correct}/{summary.wrong}</strong>
			</div>
			<div class="stat-card emphasis">
				<span>准确率</span>
				<strong>{summary.accuracyLabel}</strong>
			</div>
		</div>

		<div class="tips-card">
			<div class="tips-head">
				<h3>下局建议</h3>
				<span>Next Route</span>
			</div>
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
		padding: 18px;
		background: rgba(39, 28, 19, 0.4);
		backdrop-filter: blur(5px);
		z-index: 170;
	}

	.panel {
		--summary-bg: #fffaf4;
		--summary-bg-soft: #fffdf9;
		--summary-border: #e6d7c7;
		--summary-border-strong: #d8c0a0;
		--summary-text: #5b4837;
		--summary-text-soft: #7b6756;
		width: min(760px, calc(100vw - 36px));
		max-height: min(86dvh, 860px);
		overflow: auto;
		background: var(--summary-bg);
		border: 1px solid var(--summary-border);
		border-radius: 26px;
		padding: 18px;
		box-shadow: 0 24px 60px rgba(54, 41, 30, 0.18);
	}

	.hero,
	.tips-head,
	.actions {
		display: flex;
		gap: 12px;
	}

	.hero {
		justify-content: space-between;
		align-items: flex-start;
	}

	.hero-copy {
		display: grid;
		gap: 10px;
	}

	.hero h2,
	.tips-card h3,
	.stat-card strong,
	.hero-callout strong {
		color: var(--summary-text);
	}

	.hero h2 {
		margin: 0;
		font-size: clamp(26px, 3.8vw, 36px);
	}

	.hero p,
	.note,
	.tips-card ul,
	.hero-callout small,
	.tips-head span,
	.stat-card span {
		color: var(--summary-text-soft);
	}

	.hero p,
	.note,
	.tips-card ul,
	.hero-callout small {
		margin: 0;
		line-height: 1.75;
	}

	.eyebrow {
		display: inline-flex;
		padding: 8px 14px;
		width: fit-content;
		border-radius: 999px;
		background: #fff3df;
		color: #9a5c0e;
		font-size: 12px;
		font-weight: 800;
	}

	.hero-callout,
	.note,
	.tips-card,
	.stat-card {
		background: var(--summary-bg-soft);
		border: 1px solid var(--summary-border);
		border-radius: 18px;
	}

	.hero-callout {
		min-width: 146px;
		padding: 12px 14px;
		display: grid;
		gap: 4px;
		text-align: right;
		background: linear-gradient(180deg, #fff8ed, var(--summary-bg-soft));
		border-color: var(--summary-border-strong);
	}

	.hero-callout span {
		font-size: 12px;
		color: #9a5c0e;
	}

	.hero-callout strong {
		font-size: 34px;
		line-height: 1;
	}

	.note {
		margin-top: 14px;
		padding: 12px 14px;
	}

	.stats-grid {
		margin-top: 14px;
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		gap: 10px;
	}

	.stat-card {
		padding: 14px;
		display: grid;
		gap: 8px;
	}

	.stat-card.emphasis {
		border-color: var(--summary-border-strong);
		background: linear-gradient(180deg, #fff8ee, var(--summary-bg-soft));
	}

	.stat-card span {
		font-size: 12px;
	}

	.stat-card strong {
		font-size: clamp(18px, 2.4vw, 26px);
	}

	.tips-card {
		margin-top: 14px;
		padding: 16px;
	}

	.tips-head {
		justify-content: space-between;
		align-items: baseline;
		margin-bottom: 10px;
	}

	.tips-card h3 {
		margin: 0;
		font-size: 20px;
	}

	.tips-card ul {
		padding-left: 18px;
	}

	.tips-card li + li {
		margin-top: 8px;
	}

	.actions {
		margin-top: 16px;
		justify-content: flex-end;
		flex-wrap: wrap;
	}

	button {
		border-radius: 16px;
		padding: 12px 18px;
		font-weight: 800;
		cursor: pointer;
	}

	.primary {
		border: 1px solid #f59e0b;
		background: linear-gradient(180deg, #fbbf24, #f59e0b);
		color: #fff;
	}

	.secondary {
		border: 1px solid #b69b7c;
		background: #fff8ef;
		color: #5a4736;
	}

	@media (max-width: 920px) {
		.hero {
			flex-direction: column;
		}

		.hero-callout {
			min-width: 0;
			width: 100%;
			text-align: left;
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
