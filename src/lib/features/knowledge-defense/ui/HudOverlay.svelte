<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import type { ActionSlotKey, ActiveBuffIndicator } from '../core/types';

	export let pendingRewards = 0;
	export let rewardRerollsRemaining = 0;
	export let activeBuffs: ActiveBuffIndicator[] = [];

	export let equippedWeaponTitle = '主武器';
	export let actionSlots: Record<
		ActionSlotKey,
		{ title: string; hint: string; level: number; maxLevel: number } | null
	>;
	export let actionCooldownMs: Record<ActionSlotKey, number>;

	const dispatch = createEventDispatcher<{
		exit: void;
		castAction: { key: ActionSlotKey };
	}>();

	function cast(key: ActionSlotKey) {
		dispatch('castAction', { key });
	}

	$: rewardBadge = pendingRewards > 0 ? `${pendingRewards}` : '';
</script>

<div class="hud" aria-label="战斗 HUD">
	{#if activeBuffs.length > 0}
		<div class="buff-strip" aria-label="当前增益">
			{#each activeBuffs as buff (buff.id)}
				<div class={`buff-chip ${buff.tone}`} title={`${buff.label} · ${buff.detail}`}
					><strong>{buff.label}</strong><small>{buff.detail}</small></div
				>
			{/each}
		</div>
	{/if}

	<div class="action-bar" aria-label="底部技能栏">
		<div class="slot weapon" aria-label={`主武器：${equippedWeaponTitle}`}>
			<div class="slot-icon weapon" aria-hidden="true">Ⅰ</div>
			<div class="slot-copy">
				<span>主武器</span>
				<strong>{equippedWeaponTitle}</strong>
			</div>
		</div>

		{#each (['H', 'J', 'K', 'L'] as const) as key (key)}
			{@const def = actionSlots[key]}
			{@const cooldown = actionCooldownMs[key]}
			<button
				type="button"
				class={`slot action ${def ? 'owned' : 'empty'} ${cooldown <= 0 ? 'ready' : 'cooling'}`}
				aria-label={def ? `${key}：${def.title}` : `${key}：空槽`}
				on:click={() => cast(key)}
				disabled={!def}
			>
				<div class="slot-icon action" aria-hidden="true">
					<span class="keycap">{key}</span>
					{#if def}
						<span class="level">Lv.{def.level}</span>
					{/if}
				</div>
				<div class="slot-copy">
					<span>{def ? def.title : '空槽'}</span>
					<strong>
						{#if def}
							{cooldown <= 0 ? '就绪' : `${Math.ceil(cooldown / 1000)}s`}
						{:else}
							未获得
						{/if}
					</strong>
					<small>{def ? def.hint : '升级奖励可解锁并挂入槽位'}</small>
				</div>
				{#if def && cooldown > 0}
					<div class="cooldown-mask" aria-hidden="true"></div>
				{/if}
			</button>
		{/each}

		<button type="button" class="slot menu" aria-label="退出/暂停" on:click={() => dispatch('exit')}>
			<div class="slot-icon menu" aria-hidden="true">≡</div>
			<div class="slot-copy">
				<span>菜单</span>
				<strong>Esc</strong>
				<small>退出确认 / 帮助 / 面板关闭</small>
			</div>
		</button>

		{#if pendingRewards > 0}
			<div class="reward-toast" aria-label="有奖励待领">
				<strong>奖励待领</strong>
				<span>空格打开 · 重随机会 {rewardRerollsRemaining}</span>
				{#if rewardBadge}
					<div class="reward-badge">{rewardBadge}</div>
				{/if}
			</div>
		{/if}
	</div>
</div>

<style>
	.hud {
		position: absolute;
		inset: 0;
		pointer-events: none;
		--panel-bg: rgba(255, 250, 244, 0.96);
		--panel-border: #dccbb7;
		--text: #5b4837;
		--text-soft: #7b6756;
		--shadow: 0 10px 22px rgba(66, 48, 31, 0.14);
	}

	.buff-strip {
		pointer-events: none;
		position: absolute;
		left: 50%;
		bottom: 98px;
		transform: translateX(-50%);
		width: min(980px, calc(100% - 28px));
		display: flex;
		justify-content: center;
		flex-wrap: wrap;
		gap: 8px;
		z-index: 40;
	}

	.buff-chip {
		display: grid;
		gap: 2px;
		padding: 8px 10px;
		border-radius: 16px;
		border: 1px solid var(--panel-border);
		background: var(--panel-bg);
		box-shadow: var(--shadow);
		min-width: 112px;
	}

	.buff-chip strong {
		font-size: 12px;
		color: var(--text);
		line-height: 1.1;
	}

	.buff-chip small {
		font-size: 10px;
		color: var(--text-soft);
		line-height: 1.2;
	}

	.action-bar {
		pointer-events: auto;
		position: absolute;
		left: 50%;
		bottom: 14px;
		transform: translateX(-50%);
		width: min(1020px, calc(100% - 20px));
		display: grid;
		grid-template-columns: minmax(160px, 1.05fr) repeat(4, minmax(160px, 1fr)) minmax(160px, 1fr);
		gap: 10px;
		align-items: stretch;
		z-index: 45;
	}

	.slot {
		position: relative;
		display: grid;
		grid-template-columns: 44px minmax(0, 1fr);
		gap: 10px;
		align-items: center;
		padding: 10px 12px;
		border-radius: 18px;
		border: 1px solid var(--panel-border);
		background: var(--panel-bg);
		box-shadow: var(--shadow);
		color: var(--text);
		min-height: 68px;
		overflow: hidden;
	}

	button.slot {
		cursor: pointer;
	}

	button.slot:disabled {
		cursor: default;
		opacity: 0.72;
	}

	.slot-icon {
		width: 44px;
		height: 44px;
		border-radius: 16px;
		display: grid;
		place-items: center;
		font-weight: 900;
		color: #8b5b24;
		background: rgba(255, 241, 215, 0.92);
		border: 1px solid rgba(237, 205, 154, 0.92);
	}

	.slot-icon.action {
		position: relative;
	}

	.keycap {
		position: absolute;
		left: 8px;
		top: 7px;
		font-size: 12px;
		letter-spacing: 0.06em;
	}

	.level {
		position: absolute;
		right: 8px;
		bottom: 7px;
		font-size: 11px;
		color: #7b5b34;
	}

	.slot-copy {
		display: grid;
		gap: 2px;
		min-width: 0;
	}

	.slot-copy span,
	.slot-copy small {
		color: var(--text-soft);
		font-size: 11px;
		line-height: 1.2;
	}

	.slot-copy strong {
		color: var(--text);
		font-size: 16px;
		line-height: 1.1;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.cooldown-mask {
		position: absolute;
		inset: 0;
		background: linear-gradient(180deg, rgba(255, 250, 244, 0.05), rgba(255, 250, 244, 0.62));
		pointer-events: none;
	}

	.reward-toast {
		position: absolute;
		right: 10px;
		bottom: calc(100% + 10px);
		padding: 10px 12px;
		border-radius: 18px;
		border: 1px solid rgba(245, 158, 11, 0.34);
		background: rgba(255, 248, 237, 0.98);
		box-shadow: var(--shadow);
		display: grid;
		gap: 3px;
		color: var(--text);
		min-width: 220px;
	}

	.reward-toast strong {
		font-size: 12px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: #9a5c0e;
	}

	.reward-toast span {
		font-size: 12px;
		color: var(--text-soft);
	}

	.reward-badge {
		position: absolute;
		right: 10px;
		top: 10px;
		min-width: 22px;
		height: 22px;
		padding: 0 6px;
		border-radius: 999px;
		display: grid;
		place-items: center;
		background: #f59e0b;
		color: #fff;
		font-weight: 900;
		font-size: 12px;
		box-shadow: 0 10px 20px rgba(245, 158, 11, 0.26);
	}

	@media (max-width: 980px) {
		.action-bar {
			grid-template-columns: 1fr;
		}
		.reward-toast {
			position: static;
		}
	}
</style>
