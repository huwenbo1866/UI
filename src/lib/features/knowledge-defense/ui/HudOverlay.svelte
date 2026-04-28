<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import type { BattlefieldDropKind } from '../core/types';
	import {
		KNOWLEDGE_DEFENSE_MODE_NAME,
		type ModeGuidanceMessage
	} from '../systems/mode-guidance';

	type ActivePickupBuff = {
		id: string;
		label: string;
		detail: string;
	};

	export let hp = 0;
	export let maxHp = 0;
	export let level = 1;
	export let kills = 0;
	export let correct = 0;
	export let wrong = 0;
	export let pendingRewards = 0;
	export let modeName = KNOWLEDGE_DEFENSE_MODE_NAME;
	export let attackModeLabel = '直线发射';
	export let sourceLabel = '备用样例题源（Fallback）';
	export let sourceDetail = '';
	export let sourceIsFallback = true;
	export let abilityCooldownMs = 0;
	export let pulseOverchargeStacks = 0;
	export let guidanceMessages: ModeGuidanceMessage[] = [];
	export let activePickupBuffs: ActivePickupBuff[] = [];
	export let pickupFeedbackTitle: string | null = null;
	export let pickupFeedbackDetail: string | null = null;
	export let pickupFeedbackKind: BattlefieldDropKind | null = null;

	const dispatch = createEventDispatcher<{
		exit: void;
		castAbility: void;
		openReward: void;
		openHelp: void;
	}>();

	function exit() {
		dispatch('exit');
	}

	function castAbility() {
		dispatch('castAbility');
	}

	function openReward() {
		dispatch('openReward');
	}

	function openHelp() {
		dispatch('openHelp');
	}

	$: hpRatio = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
	$: abilityReady = abilityCooldownMs <= 0;
	$: abilityText = abilityReady ? '可释放' : `${Math.ceil(abilityCooldownMs / 1000)}s`;
	$: abilityLabel = pulseOverchargeStacks > 0 ? `脉冲 · 超载×${pulseOverchargeStacks}` : '脉冲';
</script>

<div class="hud">
	<div class="hud-status-strip">
		{#each activePickupBuffs as buff (buff.id)}
			<div class="pickup-chip active">
				<span>{buff.label}</span>
				<strong>{buff.detail}</strong>
			</div>
		{/each}

		{#if pickupFeedbackTitle && pickupFeedbackDetail}
			<div class={`pickup-chip flash ${pickupFeedbackKind ?? ''}`}>
				<span>{pickupFeedbackTitle}</span>
				<strong>{pickupFeedbackDetail}</strong>
			</div>
		{/if}
	</div>

	<div class="topbar">
		<div class="pill shell-pill">
			<span>模式</span>
			<strong>{modeName}</strong>
		</div>

		<div class="pill hp-pill">
			<span>HP</span>
			<div class="bar"><i style={`width:${hpRatio * 100}%`}></i></div>
			<strong>{Math.max(0, Math.round(hp))}/{maxHp}</strong>
		</div>

		<div class="pill compact level-pill">
			<span>等级</span>
			<strong>Lv.{level}</strong>
		</div>

		<div class="pill compact kills-pill">
			<span>战绩</span>
			<strong>{kills} 击杀</strong>
		</div>

		<div class="pill compact answers-pill">
			<span>答题</span>
			<strong>{correct}/{wrong}</strong>
		</div>

		<div class="pill compact mode-pill">
			<span>攻击偏好</span>
			<strong>{attackModeLabel}</strong>
		</div>

		<div class={`pill source ${sourceIsFallback ? 'fallback' : ''}`}>
			<span>当前题源</span>
			<strong>{sourceLabel}</strong>
			{#if sourceDetail}
				<small>{sourceDetail}</small>
			{/if}
		</div>
	</div>

	{#if guidanceMessages.length > 0}
		<div class="guidance-panel">
			{#each guidanceMessages as guidance (guidance.id)}
				<article class={`guidance-card ${guidance.tone}`}>
					<h2>{guidance.title}</h2>
					<p>{guidance.detail}</p>
				</article>
			{/each}
		</div>
	{/if}

	<div class="right-actions">
		<button type="button" class="help" aria-label="打开帮助与图例" on:click={openHelp}>
			<span>帮助 / 图例</span>
			<strong>?</strong>
		</button>

		<button
			type="button"
			class={`ability ${abilityReady ? 'ready' : ''}`}
			aria-label="释放脉冲技能"
			on:click={castAbility}
		>
			<span>{abilityLabel}</span>
			<strong>{abilityText}</strong>
		</button>

		{#if pendingRewards > 0}
			<button type="button" class="reward" aria-label="打开奖励面板" on:click={openReward}>
				<span>奖励待领 · 答对回脉冲</span>
				<strong>×{pendingRewards}</strong>
			</button>
		{/if}
	</div>

	<button type="button" class="exit" aria-label="退出本局" on:click={exit}> ← </button>
</div>

<style>
	.hud {
		position: absolute;
		inset: 0;
		pointer-events: none;
		--hud-panel-bg: rgba(255, 250, 244, 0.95);
		--hud-panel-border: #dac8b5;
		--hud-panel-border-strong: #d7c3ae;
		--hud-text-primary: #5d4936;
		--hud-text-secondary: #8b7767;
		--hud-text-strong: #4c3a2c;
		--hud-shadow: 0 8px 18px rgba(66, 48, 31, 0.12);
		--hud-shadow-strong: 0 10px 22px rgba(66, 48, 31, 0.14);
		--hud-weapon-accent: #f59e0b;
		--hud-exp-accent: #3b82f6;
		--hud-heal-accent: #22c55e;
		--hud-warning-accent: #b45309;
	}

	.hud-status-strip {
		position: absolute;
		top: 88px;
		left: 78px;
		right: 160px;
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		z-index: 31;
	}

	.pickup-chip {
		border: 1px solid var(--hud-panel-border);
		background: var(--hud-panel-bg);
		border-radius: 999px;
		padding: 6px 10px;
		display: inline-grid;
		gap: 2px;
		box-shadow: var(--hud-shadow);
		min-height: 0;
	}

	.pickup-chip span {
		font-size: 10px;
		color: var(--hud-text-secondary);
	}

	.pickup-chip strong {
		font-size: 12px;
		color: var(--hud-text-strong);
	}

	.pickup-chip.flash {
		border-color: color-mix(
			in srgb,
			var(--hud-flash-accent, var(--hud-panel-border)) 36%,
			var(--hud-panel-border)
		);
		background: linear-gradient(
			180deg,
			color-mix(in srgb, var(--hud-flash-accent, #ffffff) 10%, #fff8ef),
			var(--hud-panel-bg)
		);
	}

	.pickup-chip.flash.weapon {
		--hud-flash-accent: var(--hud-weapon-accent);
	}

	.pickup-chip.flash.xp {
		--hud-flash-accent: var(--hud-exp-accent);
	}

	.pickup-chip.flash.heal {
		--hud-flash-accent: var(--hud-heal-accent);
	}

	.topbar {
		pointer-events: auto;
		position: absolute;
		top: 18px;
		left: 78px;
		right: 20px;
		display: flex;
		gap: 10px;
		flex-wrap: wrap;
		z-index: 31;
	}

	.pill {
		border: 1px solid var(--hud-panel-border);
		background: var(--hud-panel-bg);
		color: var(--hud-text-primary);
		border-radius: 14px;
		padding: 8px 10px;
		min-height: 50px;
		display: grid;
		align-content: center;
		gap: 4px;
		box-shadow: var(--hud-shadow);
	}

	.pill span {
		font-size: 11px;
		color: var(--hud-text-secondary);
	}

	.pill strong {
		font-size: 14px;
		color: var(--hud-text-strong);
	}

	.pill small {
		font-size: 11px;
		color: var(--hud-text-secondary);
		line-height: 1.45;
	}

	.shell-pill {
		min-width: 220px;
		max-width: min(48vw, 360px);
	}

	.hp-pill {
		min-width: 180px;
	}

	.bar {
		width: 100%;
		height: 8px;
		border-radius: 999px;
		background: rgba(55, 41, 28, 0.15);
		overflow: hidden;
	}

	.bar i {
		display: block;
		height: 100%;
		background: linear-gradient(90deg, #22c55e, #16a34a);
		border-radius: 999px;
	}

	.compact {
		min-width: 92px;
	}

	.source {
		min-width: 220px;
		max-width: min(44vw, 380px);
	}

	.source strong {
		line-height: 1.35;
	}

	.source.fallback {
		border-color: color-mix(in srgb, var(--hud-warning-accent) 34%, var(--hud-panel-border));
		background: linear-gradient(180deg, #fff8ee, var(--hud-panel-bg));
	}

	.guidance-panel {
		position: absolute;
		left: 18px;
		bottom: 18px;
		width: min(420px, calc(100vw - 180px));
		display: grid;
		gap: 10px;
		z-index: 31;
	}

	.guidance-card {
		border-radius: 18px;
		border: 1px solid var(--hud-panel-border);
		background: rgba(255, 250, 244, 0.96);
		box-shadow: var(--hud-shadow-strong);
		padding: 12px 14px;
		display: grid;
		gap: 6px;
	}

	.guidance-card h2,
	.guidance-card p {
		margin: 0;
	}

	.guidance-card h2 {
		font-size: 15px;
		color: var(--hud-text-strong);
	}

	.guidance-card p {
		font-size: 12px;
		line-height: 1.6;
		color: var(--hud-text-secondary);
	}

	.guidance-card.accent {
		border-color: color-mix(in srgb, var(--hud-weapon-accent) 34%, var(--hud-panel-border));
		background: linear-gradient(180deg, #fff8ee, rgba(255, 250, 244, 0.96));
	}

	.guidance-card.warning {
		border-color: color-mix(in srgb, var(--hud-warning-accent) 34%, var(--hud-panel-border));
		background: linear-gradient(180deg, #fff7f0, rgba(255, 250, 244, 0.96));
	}

	.right-actions {
		pointer-events: auto;
		position: absolute;
		right: 18px;
		bottom: 18px;
		display: grid;
		gap: 10px;
		z-index: 31;
	}

	.ability,
	.reward,
	.help {
		border-radius: 16px;
		border: 1px solid var(--hud-panel-border-strong);
		background: rgba(255, 250, 244, 0.97);
		color: var(--hud-text-primary);
		box-shadow: var(--hud-shadow-strong);
		width: 124px;
		min-height: 60px;
		display: grid;
		gap: 2px;
		align-content: center;
		text-align: center;
		cursor: pointer;
	}

	.help {
		background: rgba(255, 248, 239, 0.98);
	}

	.ability.ready {
		border-color: var(--hud-weapon-accent);
		background: linear-gradient(180deg, #fff4de, #ffefcf);
	}

	.ability span,
	.reward span,
	.help span {
		font-size: 12px;
		color: var(--hud-text-secondary);
	}

	.ability strong,
	.reward strong,
	.help strong {
		font-size: 18px;
		font-weight: 900;
		color: #4e3c2e;
	}

	.exit {
		pointer-events: auto;
		position: absolute;
		top: 20px;
		left: 20px;
		z-index: 30;
		width: 46px;
		height: 46px;
		border-radius: 14px;
		border: 1px solid #d9c7b3;
		background: rgba(255, 250, 244, 0.96);
		color: var(--hud-text-primary);
		box-shadow: var(--hud-shadow-strong);
		cursor: pointer;
		font-size: 18px;
		font-weight: 800;
	}

	@media (max-width: 900px) {
		.hud-status-strip {
			top: auto;
			left: 12px;
			right: 124px;
			bottom: 78px;
		}

		.topbar {
			top: 12px;
			left: 12px;
			right: 12px;
			gap: 8px;
		}

		.pill {
			min-height: 44px;
			border-radius: 12px;
			padding: 6px 8px;
		}

		.hp-pill {
			min-width: 150px;
			flex: 1 1 100%;
		}

		.shell-pill,
		.source {
			max-width: 100%;
		}

		.source {
			min-width: 140px;
			max-width: 70vw;
		}

		.kills-pill,
		.answers-pill {
			display: none;
		}

		.guidance-panel {
			left: 12px;
			bottom: 12px;
			width: min(360px, calc(100vw - 150px));
		}

		.right-actions {
			right: 12px;
			bottom: 12px;
			gap: 8px;
		}

		.ability,
		.reward,
		.help {
			width: 104px;
			min-height: 54px;
		}

		.exit {
			top: 12px;
			left: 12px;
			width: 42px;
			height: 42px;
		}
	}

	@media (max-width: 640px) {
		.guidance-panel {
			left: 12px;
			right: 12px;
			width: auto;
			bottom: 196px;
		}
	}
</style>
