<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import {
		KNOWLEDGE_DEFENSE_DROP_LEGEND,
		KNOWLEDGE_DEFENSE_MODE_NAME,
		KNOWLEDGE_DEFENSE_TELEGRAPH_LEGEND
	} from '../systems/mode-guidance';
	import type { ModeGuidanceMessage, PreRunBriefing } from '../systems/mode-guidance';

	export let visible = false;
	export let modeName = KNOWLEDGE_DEFENSE_MODE_NAME;
	export let title = '模式帮助 / Mode Guide';
	export let description = '开局前确认循环、操作、奖励节奏与怪物读图。';
	export let briefing: PreRunBriefing;
	export let currentGuidance: ModeGuidanceMessage[] = [];
	export let onboarding = false;

	const dispatch = createEventDispatcher<{ close: void; dismiss: void }>();

	function handleOverlayKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			dispatch('close');
		}
	}
</script>

{#if visible}
	<div
		class="overlay"
		role="button"
		tabindex="0"
		aria-label="关闭模式帮助面板"
		on:click|self={() => dispatch('close')}
		on:keydown|self={handleOverlayKeydown}
	>
		<section class="panel" aria-label={title}>
			<div class="header">
				<div>
					<div class="eyebrow">{modeName}</div>
					<h2>{title}</h2>
					<p>{description}</p>
				</div>
				<button type="button" class="close" on:click={() => dispatch('close')}>关闭</button>
			</div>

			{#if onboarding}
				<div class="onboarding-banner">
					<div class="badge">首次上手</div>
					<p>
						先记住这几点：奖励要你主动打开、答错值得复盘、HUD 随时能回看帮助与图例。
					</p>
				</div>
			{/if}

			{#if currentGuidance.length > 0}
				<div class="section">
					<div class="section-head">
						<h3>当前提示</h3>
						<span>战场内会按状态自动变化</span>
					</div>
					<div class="guidance-grid">
						{#each currentGuidance as guidance (guidance.id)}
							<article class={`guidance-card ${guidance.tone}`}>
								<h4>{guidance.title}</h4>
								<p>{guidance.detail}</p>
							</article>
						{/each}
					</div>
				</div>
			{/if}

			<div class="section">
				<div class="section-head">
					<h3>开局前速览</h3>
					<span>不进设置也能先理解玩法</span>
				</div>
				<div class="brief-grid">
					<article class="brief-card emphasis">
						<h4>模式循环</h4>
						<p>{briefing.modeLoop}</p>
					</article>
					<article class="brief-card">
						<h4>奖励时机</h4>
						<p>{briefing.rewardTiming}</p>
					</article>
					<article class="brief-card">
						<h4>错题 / 复盘价值</h4>
						<p>{briefing.reviewValue}</p>
					</article>
					<article class="brief-card controls-card">
						<h4>主控操作</h4>
						<ul>
							{#each briefing.controls as control}
								<li>{control}</li>
							{/each}
						</ul>
					</article>
					<article class="brief-card">
						<h4>当前攻击偏好</h4>
						<strong>{briefing.attackPreference}</strong>
						<p>{briefing.attackPreferenceDetail}</p>
					</article>
					<article class="brief-card source-card">
						<h4>当前题目来源</h4>
						<strong>{briefing.contentSource}</strong>
						<p>{briefing.contentSourceDetail}</p>
					</article>
				</div>
			</div>

			<div class="legend-layout">
				<div class="section">
					<div class="section-head">
						<h3>掉落图例</h3>
						<span>看懂战场资源值不值得冒险去拿</span>
					</div>
					<div class="legend-grid">
						{#each KNOWLEDGE_DEFENSE_DROP_LEGEND as item (item.id)}
							<article class={`legend-card ${item.tone}`}>
								<div class="legend-badge">{item.badge}</div>
								<h4>{item.label}</h4>
								<p>{item.detail}</p>
							</article>
						{/each}
					</div>
				</div>

				<div class="section">
					<div class="section-head">
						<h3>怪物前摇图例</h3>
						<span>HUD 与战场标签会沿用这些名称</span>
					</div>
					<div class="legend-grid">
						{#each KNOWLEDGE_DEFENSE_TELEGRAPH_LEGEND as item (item.id)}
							<article class={`legend-card ${item.tone}`}>
								<div class="legend-badge">{item.badge}</div>
								<h4>{item.label}</h4>
								<p>{item.detail}</p>
							</article>
						{/each}
					</div>
				</div>
			</div>

			<div class="footer">
				{#if onboarding}
					<button type="button" class="secondary" on:click={() => dispatch('close')}>稍后再看</button>
					<button type="button" class="primary" on:click={() => dispatch('dismiss')}
						>知道了，不再自动显示</button
					>
				{:else}
					<button type="button" class="primary" on:click={() => dispatch('close')}>关闭帮助</button>
				{/if}
			</div>
		</section>
	</div>
{/if}

<style>
	.overlay {
		position: fixed;
		inset: 0;
		z-index: 180;
		display: grid;
		place-items: center;
		padding: 24px;
		background: rgba(39, 28, 19, 0.34);
		backdrop-filter: blur(5px);
	}

	.panel {
		width: min(1120px, calc(100vw - 48px));
		max-height: min(90dvh, 960px);
		overflow: auto;
		background: #fffaf4;
		border: 1px solid #e3d5c7;
		border-radius: 28px;
		padding: 22px;
		box-shadow: 0 24px 60px rgba(54, 41, 30, 0.18);
	}

	.header {
		display: flex;
		justify-content: space-between;
		gap: 16px;
		align-items: flex-start;
	}

	.eyebrow,
	.badge,
	.legend-badge {
		display: inline-flex;
		align-items: center;
		border-radius: 999px;
		font-size: 12px;
		font-weight: 800;
	}

	.eyebrow {
		padding: 8px 14px;
		background: #fff3df;
		color: #9a5c0e;
	}

	h2 {
		margin: 12px 0 0;
		font-size: clamp(28px, 4vw, 40px);
		color: #5b4837;
	}

	.header p,
	.onboarding-banner p,
	.brief-card p,
	.guidance-card p,
	.legend-card p {
		margin: 0;
		line-height: 1.75;
		color: #6d5847;
	}

	.header p {
		margin-top: 10px;
		max-width: 720px;
	}

	.close,
	.primary,
	.secondary {
		border-radius: 16px;
		padding: 11px 16px;
		font-weight: 800;
		cursor: pointer;
	}

	.close,
	.secondary {
		border: 1px solid #b69b7c;
		background: #fff8ef;
		color: #5a4736;
	}

	.primary {
		border: 1px solid #f59e0b;
		background: linear-gradient(180deg, #fbbf24, #f59e0b);
		color: #fff;
	}

	.onboarding-banner,
	.brief-card,
	.guidance-card,
	.legend-card {
		border-radius: 20px;
		border: 1px solid #eadfce;
		background: #fffdf9;
	}

	.onboarding-banner {
		margin-top: 18px;
		padding: 16px 18px;
		display: grid;
		gap: 10px;
		background: linear-gradient(180deg, #fff7ed, #fffdf9);
		border-color: #f2c98f;
	}

	.badge,
	.legend-badge {
		padding: 6px 10px;
	}

	.badge {
		background: rgba(251, 191, 36, 0.16);
		color: #9a5c0e;
		width: fit-content;
	}

	.section {
		margin-top: 18px;
	}

	.section-head {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		align-items: baseline;
		margin-bottom: 12px;
	}

	.section-head h3,
	.brief-card h4,
	.guidance-card h4,
	.legend-card h4 {
		margin: 0;
		color: #5b4837;
	}

	.section-head span,
	.brief-card li,
	.brief-card strong {
		color: #7b6756;
	}

	.brief-grid,
	.guidance-grid,
	.legend-grid {
		display: grid;
		gap: 12px;
	}

	.brief-grid {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.guidance-grid,
	.legend-grid {
		grid-template-columns: repeat(3, minmax(0, 1fr));
	}

	.brief-card,
	.guidance-card,
	.legend-card {
		padding: 16px;
		display: grid;
		gap: 10px;
	}

	.brief-card.emphasis,
	.guidance-card.accent,
	.legend-card.accent {
		background: linear-gradient(180deg, #fff8ee, #fffdf9);
		border-color: #edcf9c;
	}

	.guidance-card.warning,
	.legend-card.warning {
		background: linear-gradient(180deg, #fff7f4, #fffdf9);
		border-color: #efc7b8;
	}

	.controls-card ul {
		margin: 0;
		padding-left: 20px;
		line-height: 1.75;
	}

	.source-card strong,
	.brief-card strong {
		font-size: 18px;
		color: #4e3c2e;
	}

	.legend-layout {
		display: grid;
		gap: 18px;
	}

	.legend-badge {
		background: #f4ede4;
		color: #7a644f;
		width: fit-content;
	}

	.footer {
		margin-top: 20px;
		display: flex;
		justify-content: flex-end;
		gap: 12px;
		flex-wrap: wrap;
	}

	@media (max-width: 980px) {
		.panel {
			width: min(100vw - 28px, 1120px);
			padding: 18px;
			border-radius: 24px;
		}

		.brief-grid,
		.guidance-grid,
		.legend-grid {
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
			padding: 16px;
		}

		.header,
		.section-head,
		.footer {
			align-items: stretch;
			flex-direction: column;
		}

		.close,
		.primary,
		.secondary {
			width: 100%;
		}
	}
</style>
