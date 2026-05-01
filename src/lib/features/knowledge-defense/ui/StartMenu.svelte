<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { audioManager } from '../systems/audio-manager';

	type StartWeaponId = 'straight' | 'scatter' | 'laser' | 'missile' | 'karate';

	type WeaponOption = {
		id: StartWeaponId;
		name: string;
		glyph: string;
		detail: string;
		isSelectable: boolean;
	};

	export let selectedWeaponId: StartWeaponId = 'straight';
	export let wrongCount = 0;
	export let sourceLabel = '备用样例题源（Fallback）';
	export let sourceDetail = '';
	export let sourceIsFallback = true;

	const dispatch = createEventDispatcher<{
		start: void;
		settings: void;
		notebook: void;
		help: void;
		exitHome: void;
		weaponSelect: { weaponId: StartWeaponId };
	}>();

	const weaponOptions: WeaponOption[] = [
		{
			id: 'straight',
			name: '直线主武器',
			glyph: 'I',
			detail: '稳定单线输出，适合边走位边观察怪物前摇与资源线路。',
			isSelectable: true
		},
		{
			id: 'scatter',
			name: '散射主武器',
			glyph: 'V',
			detail: '扇面覆盖更宽，适合贴近清场与处理中近距包围。',
			isSelectable: true
		},
		{
			id: 'laser',
			name: '激光教鞭',
			glyph: '┃',
			detail: '持续压线的高温束流，适合拉扯中稳定维持火力。',
			isSelectable: true
		},
		{
			id: 'missile',
			name: '导弹发射器',
			glyph: '⟡',
			detail: '带爆发感的远程主武器，适合打断节奏和清理密集目标。',
			isSelectable: true
		},
		{
			id: 'karate',
			name: '空手道',
			glyph: 'K',
			detail: '近距离连续打击与击退，适合贴脸拆火与处理飞行物。',
			isSelectable: true
		}
	];

	$: currentWeapon = weaponOptions.find((weapon) => weapon.id === selectedWeaponId) ?? weaponOptions[0];
	$: heroDescription = sourceIsFallback && sourceDetail
		? '从暖启动题源进入，先定主武器，再确认右侧信息后直接开局。'
		: '把章节练习收束成更清晰的战前界面：先看说明，再定主武器，最后直接开始闯关。';

	function handleWeaponSelect(weapon: WeaponOption) {
		if (!weapon.isSelectable) return;
		audioManager.playClick();
		dispatch('weaponSelect', { weaponId: weapon.id });
	}
</script>

<section class="start-page">
	<button class="exit-button" type="button" aria-label="退出到首页" on:click={() => dispatch('exitHome')}>
		<span class="exit-shell">
			<svg viewBox="0 0 24 24" aria-hidden="true">
				<path d="M15 6L9 12L15 18" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" />
			</svg>
		</span>
	</button>

	<div class="orb orb-a"></div>
	<div class="orb orb-b"></div>
	<div class="orb orb-c"></div>
	<div class="grid"></div>

	<div class="content">
		<header class="hero-section">
			<div class="hero-text">
				<span class="eyebrow">Knowledge Defense · 知识防御</span>
				<h1>知识闯关</h1>
				<p class="hero-description">{heroDescription}</p>
			</div>

			<div class="hero-meta">
				<div class="meta-card source-card {sourceIsFallback ? 'fallback' : 'live'}">
					<span class="meta-tag">题源</span>
					<strong>{sourceLabel}</strong>
					{#if sourceDetail}
						<p>{sourceDetail}</p>
					{/if}
				</div>

				<div class="meta-stats">
					<div class="stat-pill">
						<span class="stat-label">错题</span>
						<span class="stat-value">{wrongCount}</span>
					</div>
					<div class="stat-pill">
						<span class="stat-label">主武器</span>
						<span class="stat-value">{currentWeapon.name}</span>
					</div>
				</div>
			</div>
		</header>

		<nav class="nav-rail" aria-label="启动页导航">
			<div class="rail-header">
				<span class="rail-kicker">Quick Desk</span>
				<strong>战前整理</strong>
			</div>

			<div class="rail-actions" role="group" aria-label="启动页动作">
				<button type="button" class="rail-btn" data-rail-item="settings" on:click={() => {
					audioManager.playClick();
					dispatch('settings');
				}}>
					<span class="rail-icon" aria-hidden="true">
						<svg viewBox="0 0 24 24">
							<path d="M12 3.5L13.8 6.2L17 6.7L17.5 10L20.5 12L17.5 14L17 17.3L13.8 17.8L12 20.5L10.2 17.8L7 17.3L6.5 14L3.5 12L6.5 10L7 6.7L10.2 6.2Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" />
							<circle cx="12" cy="12" r="2.8" fill="none" stroke="currentColor" stroke-width="1.8" />
						</svg>
					</span>
					<span class="rail-label">设置</span>
				</button>

				<button type="button" class="rail-btn" data-rail-item="notebook" on:click={() => {
					audioManager.playClick();
					dispatch('notebook');
				}}>
					<span class="rail-icon" aria-hidden="true">
						<svg viewBox="0 0 24 24">
							<path d="M7 4.5H17C17.8 4.5 18.5 5.2 18.5 6V18C18.5 18.8 17.8 19.5 17 19.5H7C6.2 19.5 5.5 18.8 5.5 18V6C5.5 5.2 6.2 4.5 7 4.5Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" />
							<path d="M8.5 8.5H15.5M8.5 12H15.5M8.5 15.5H13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
						</svg>
					</span>
					<span class="rail-label">错题集</span>
				</button>

				<button type="button" class="rail-btn" data-rail-item="help" on:click={() => {
					audioManager.playClick();
					dispatch('help');
				}}>
					<span class="rail-icon" aria-hidden="true">
						<svg viewBox="0 0 24 24">
							<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.8" />
							<path d="M9.8 9.5C10.1 8.4 11 7.7 12.2 7.7C13.6 7.7 14.6 8.6 14.6 9.8C14.6 11 13.7 11.5 12.8 12.1C12 12.6 11.5 13.1 11.5 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
							<circle cx="12" cy="16.8" r="1" fill="currentColor" />
						</svg>
					</span>
					<span class="rail-label">帮助</span>
				</button>
			</div>

			<div class="rail-badges">
				<span class="badge">{sourceIsFallback ? 'Fallback' : 'Chapter'}</span>
				<span class="badge">{wrongCount} wrong</span>
			</div>
		</nav>

		<main class="weapon-showcase" aria-label="主武器选择讲台">
			<div class="showcase-header">
				<div class="showcase-title">
					<span class="section-kicker">Main Weapon</span>
					<h2>选择主武器</h2>
				</div>
				<p class="showcase-hint">点击可用条目即可切换主武器；进入战斗时会沿用这里的当前选择。</p>
			</div>

			<div class="weapon-grid" aria-label="主武器列表" data-selected-weapon={selectedWeaponId}>
				{#each weaponOptions as weapon}
					<button
						type="button"
						class="weapon-card"
						class:active={selectedWeaponId === weapon.id}
						class:locked={!weapon.isSelectable}
						data-weapon-row={weapon.id}
						on:click={() => handleWeaponSelect(weapon)}
						disabled={!weapon.isSelectable}
						aria-pressed={selectedWeaponId === weapon.id}
						aria-label={`${weapon.name}${weapon.isSelectable ? '，点击选择' : '，暂未开放'}`}
					>
						<span class="weapon-glyph" aria-hidden="true">{weapon.glyph}</span>
						<span class="weapon-info">
							<strong>{weapon.name}</strong>
							<span class="weapon-detail">{weapon.detail}</span>
						</span>
						<span class="weapon-status" aria-hidden="true">
							{weapon.isSelectable ? (selectedWeaponId === weapon.id ? '已选' : '可选') : '展示'}
						</span>
					</button>
				{/each}
			</div>
		</main>

		<aside class="detail-panel" data-current-weapon={selectedWeaponId}>
			<div class="detail-card">
				<div class="detail-header">
					<span class="detail-glyph" aria-hidden="true">{currentWeapon.glyph}</span>
					<div class="detail-meta">
						<span class="detail-kicker">Selected Loadout</span>
						<h2>{currentWeapon.name}</h2>
						<div class="detail-tags">
							<span class="tag">主武器</span>
							<span class="tag">{sourceIsFallback ? 'Fallback' : 'Chapter'}</span>
						</div>
					</div>
				</div>

				<p class="detail-description">{currentWeapon.detail}</p>

				<div class="detail-footer">
					<div class="cta-info">
						<span class="cta-kicker">Ready to run</span>
						<p>确认后直接开局，保留当前题源与已有战前配置。</p>
					</div>
					<button type="button" class="start-button" data-start-cta="true" on:click={() => {
						audioManager.playClick();
						dispatch('start');
					}}>
						<span class="btn-text">开始闯关</span>
						<span class="btn-icon" aria-hidden="true">
							<svg viewBox="0 0 24 24">
								<path d="M5 3L19 12L5 21V3Z" fill="currentColor" />
							</svg>
						</span>
					</button>
				</div>
			</div>
		</aside>
	</div>
</section>

<style>
	.start-page {
		--page-bg: #fbf7f1;
		--panel-bg: rgba(255, 252, 247, 0.92);
		--panel-strong: rgba(255, 250, 244, 0.98);
		--panel-border: #e6d7c7;
		--panel-border-strong: #ddc6a6;
		--text-strong: #4f3a2a;
		--text-main: #5d4936;
		--text-soft: #7d6858;
		--accent: #f59e0b;
		--accent-strong: #ef8f00;
		--accent-glow: rgba(245, 158, 11, 0.35);
		--shadow-soft: 0 22px 42px rgba(88, 64, 42, 0.08);
		--shadow-card: 0 12px 28px rgba(88, 64, 42, 0.1);
		position: relative;
		min-height: 100dvh;
		width: 100%;
		overflow: hidden;
		background:
			radial-gradient(circle at 20% 15%, rgba(255, 255, 255, 0.95), rgba(255, 255, 255, 0) 35%),
			radial-gradient(circle at 75% 80%, rgba(255, 236, 208, 0.72), rgba(255, 236, 208, 0) 32%),
			radial-gradient(circle at 90% 20%, rgba(255, 214, 160, 0.48), rgba(255, 214, 160, 0) 28%),
			linear-gradient(180deg, var(--page-bg) 0%, #f7f0e7 56%, #f2e7da 100%);
		color: var(--text-main);
	}

	.grid {
		position: absolute;
		inset: 0;
		pointer-events: none;
		background-image:
			linear-gradient(rgba(138, 105, 73, 0.04) 1px, transparent 1px),
			linear-gradient(90deg, rgba(138, 105, 73, 0.04) 1px, transparent 1px);
		background-size: 32px 32px;
		mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.08));
	}

	.orb {
		position: absolute;
		border-radius: 999px;
		pointer-events: none;
		filter: blur(14px);
	}

	.orb-a {
		width: 580px;
		height: 580px;
		right: -60px;
		top: -120px;
		background: radial-gradient(circle, rgba(255, 214, 160, 0.52), rgba(255, 214, 160, 0));
	}

	.orb-b {
		width: 480px;
		height: 480px;
		left: -100px;
		bottom: -140px;
		background: radial-gradient(circle, rgba(255, 244, 220, 0.82), rgba(255, 244, 220, 0));
	}

	.orb-c {
		width: 320px;
		height: 320px;
		right: 30%;
		top: 40%;
		background: radial-gradient(circle, rgba(251, 191, 36, 0.28), rgba(251, 191, 36, 0));
	}

	.exit-button {
		position: absolute;
		left: 28px;
		top: 28px;
		z-index: 10;
		border: 0;
		background: transparent;
		padding: 0;
		cursor: pointer;
	}

	.exit-shell {
		width: 56px;
		height: 56px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: 18px;
		color: var(--text-main);
		background: var(--panel-strong);
		border: 1px solid var(--panel-border);
		box-shadow: var(--shadow-soft);
		transition: transform 0.18s ease, box-shadow 0.18s ease;
	}

	.exit-shell:hover {
		transform: translateY(-2px);
		box-shadow: 0 8px 20px rgba(88, 64, 42, 0.12);
	}

	.exit-shell svg {
		width: 26px;
		height: 26px;
	}

	.content {
		position: relative;
		z-index: 1;
		min-height: 100dvh;
		width: min(1780px, calc(100% - 64px));
		margin: 0 auto;
		display: grid;
		grid-template-columns: 220px minmax(0, 1fr) 380px;
		grid-template-areas:
			'rail header header'
			'rail weapon detail';
		gap: 28px;
		align-items: start;
		padding: 88px 0 40px;
		box-sizing: border-box;
	}

	.hero-section {
		grid-area: header;
		display: flex;
		justify-content: space-between;
		align-items: flex-end;
		gap: 32px;
		padding: 32px 36px;
		border-radius: 32px;
		border: 1px solid var(--panel-border);
		background: var(--panel-bg);
		box-shadow: var(--shadow-soft);
		backdrop-filter: blur(10px);
	}

	.hero-text {
		display: grid;
		gap: 16px;
		max-width: 680px;
	}

	.eyebrow,
	.meta-tag,
	.section-kicker,
	.rail-kicker,
	.detail-kicker,
	.cta-kicker {
		display: inline-flex;
		align-items: center;
		width: fit-content;
		padding: 8px 14px;
		border-radius: 999px;
		font-size: 11px;
		font-weight: 800;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		background: #fff1d7;
		color: #a26514;
	}

	.hero-text h1 {
		font-size: clamp(52px, 5.5vw, 88px);
		line-height: 0.92;
		font-weight: 900;
		letter-spacing: -0.06em;
		color: var(--text-strong);
		margin: 0;
	}

	.hero-description {
		font-size: 16px;
		line-height: 1.75;
		color: var(--text-soft);
		max-width: 52ch;
		margin: 0;
	}

	.hero-meta {
		display: grid;
		gap: 16px;
		min-width: 280px;
	}

	.meta-card {
		padding: 20px;
		border-radius: 24px;
		border: 1px solid var(--panel-border);
		background: var(--panel-strong);
		box-shadow: var(--shadow-soft);
		display: grid;
		gap: 10px;
	}

	.meta-card.source-card {
		background: linear-gradient(180deg, rgba(255, 248, 235, 0.98), rgba(255, 251, 245, 0.98));
	}

	.meta-card strong {
		font-size: 18px;
		line-height: 1.15;
		color: var(--text-strong);
	}

	.meta-card p {
		font-size: 13px;
		line-height: 1.6;
		color: var(--text-soft);
		margin: 0;
	}

	.meta-stats {
		display: flex;
		gap: 12px;
	}

	.stat-pill {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 12px 18px;
		border-radius: 999px;
		border: 1px solid #e5d1af;
		background: #fff8ea;
	}

	.stat-label {
		font-size: 11px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: #8b632f;
	}

	.stat-value {
		font-size: 16px;
		font-weight: 900;
		color: var(--text-strong);
	}

	.nav-rail {
		grid-area: rail;
		display: grid;
		grid-template-rows: auto 1fr auto;
		gap: 24px;
		padding: 24px 18px;
		border-radius: 28px;
		border: 1px solid var(--panel-border);
		background: var(--panel-bg);
		box-shadow: var(--shadow-soft);
		backdrop-filter: blur(10px);
		position: sticky;
		top: 28px;
	}

	.rail-header {
		display: grid;
		gap: 8px;
	}

	.rail-kicker {
		font-size: 10px;
		padding: 6px 12px;
	}

	.rail-header strong {
		font-size: 20px;
		line-height: 1.1;
		font-weight: 900;
		color: var(--text-strong);
	}

	.rail-actions {
		display: grid;
		gap: 10px;
	}

	.rail-btn {
		display: grid;
		grid-template-columns: 44px 1fr;
		gap: 12px;
		align-items: center;
		padding: 14px 16px;
		border-radius: 20px;
		border: 1px solid transparent;
		background: rgba(255, 253, 248, 0.9);
		color: var(--text-main);
		text-align: left;
		cursor: pointer;
		transition: all 0.18s ease;
		font-size: 15px;
		font-weight: 700;
	}

	.rail-btn:hover {
		border-color: var(--panel-border-strong);
		background: linear-gradient(180deg, #fff6e2, #fffaf2);
		transform: translateX(2px);
		box-shadow: var(--shadow-card);
	}

	.rail-btn:focus-visible {
		outline: 2px solid rgba(245, 158, 11, 0.45);
		outline-offset: 2px;
	}

	.rail-icon {
		width: 44px;
		height: 44px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: 16px;
		border: 1px solid #ebd2a8;
		background: linear-gradient(180deg, rgba(255, 247, 231, 0.98), rgba(255, 239, 214, 0.88));
		color: #996019;
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.86);
	}

	.rail-icon svg {
		width: 20px;
		height: 20px;
	}

	.rail-label {
		font-size: 15px;
		font-weight: 700;
		color: var(--text-strong);
	}

	.rail-badges {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.badge {
		display: inline-flex;
		align-items: center;
		padding: 7px 12px;
		border-radius: 999px;
		border: 1px solid #e5d1af;
		background: #fff8ea;
		color: #8b632f;
		font-size: 11px;
		font-weight: 800;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.weapon-showcase {
		grid-area: weapon;
		display: grid;
		gap: 24px;
		padding: 28px;
		border-radius: 32px;
		border: 1px solid var(--panel-border);
		background: var(--panel-bg);
		box-shadow: var(--shadow-soft);
		backdrop-filter: blur(10px);
	}

	.showcase-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-end;
		gap: 20px;
	}

	.showcase-title {
		display: grid;
		gap: 10px;
	}

	.section-kicker {
		font-size: 12px;
	}

	.showcase-title h2 {
		font-size: clamp(32px, 3.5vw, 48px);
		line-height: 1;
		font-weight: 900;
		color: var(--text-strong);
		margin: 0;
	}

	.showcase-hint {
		font-size: 14px;
		line-height: 1.6;
		color: var(--text-soft);
		max-width: 36ch;
		margin: 0;
	}

	.weapon-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 16px;
		padding: 16px;
		border-radius: 28px;
		background: var(--panel-strong);
	}

	.weapon-card {
		position: relative;
		display: grid;
		grid-template-columns: 72px minmax(0, 1fr) auto;
		gap: 18px;
		align-items: center;
		min-height: 120px;
		padding: 18px 22px 18px 18px;
		border: 2px solid transparent;
		border-radius: 24px;
		background: rgba(255, 253, 248, 0.88);
		color: var(--text-main);
		text-align: left;
		cursor: pointer;
		transition: all 0.2s ease;
		font-family: inherit;
		font-size: inherit;
	}

	.weapon-card:not(:disabled):hover {
		transform: translateY(-3px);
		border-color: var(--panel-border-strong);
		background: linear-gradient(180deg, #fff6e2, #fffaf2);
		box-shadow: 0 20px 36px rgba(88, 64, 42, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.72);
	}

	.weapon-card:not(:disabled):active {
		transform: translateY(-1px);
	}

	.weapon-card.active {
		border-color: var(--accent);
		background: linear-gradient(180deg, #fff0d2, #fff8eb);
		box-shadow: 0 18px 34px rgba(88, 64, 42, 0.14), inset 0 0 0 1px rgba(235, 194, 125, 0.55), 0 0 0 3px var(--accent-glow);
	}

	.weapon-card.locked {
		opacity: 0.65;
		cursor: default;
	}

	.weapon-card:focus-visible {
		outline: 2px solid rgba(245, 158, 11, 0.45);
		outline-offset: 2px;
	}

	.weapon-glyph {
		width: 72px;
		height: 72px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: 20px;
		border: 1px solid #ebd2a8;
		background: linear-gradient(180deg, rgba(255, 247, 231, 0.98), rgba(255, 239, 214, 0.88));
		color: #996019;
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.86);
		font-size: 28px;
		font-weight: 900;
	}

	.weapon-info {
		display: grid;
		gap: 8px;
		min-width: 0;
	}

	.weapon-info strong {
		font-size: 22px;
		line-height: 1.1;
		font-weight: 900;
		color: var(--text-strong);
	}

	.weapon-detail {
		font-size: 14px;
		line-height: 1.65;
		color: var(--text-soft);
	}

	.weapon-status {
		justify-self: end;
		align-self: start;
		padding: 8px 14px;
		border-radius: 999px;
		border: 1px solid rgba(224, 188, 135, 0.95);
		background: #fff7ea;
		color: #94641d;
		font-size: 11px;
		font-weight: 800;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.detail-panel {
		grid-area: detail;
		display: grid;
	}

	.detail-card {
		display: grid;
		grid-template-rows: auto 1fr auto;
		gap: 28px;
		padding: 32px 28px;
		border-radius: 32px;
		border: 1px solid var(--panel-border);
		background:
			radial-gradient(circle at top right, rgba(251, 191, 36, 0.18), rgba(251, 191, 36, 0) 38%),
			var(--panel-strong);
		box-shadow: var(--shadow-soft);
		backdrop-filter: blur(10px);
	}

	.detail-header {
		display: grid;
		grid-template-columns: 88px minmax(0, 1fr);
		gap: 20px;
		align-items: start;
	}

	.detail-glyph {
		width: 88px;
		height: 88px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: 26px;
		border: 1px solid #ebd2a8;
		background: linear-gradient(180deg, rgba(255, 247, 231, 0.98), rgba(255, 239, 214, 0.88));
		color: #996019;
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.86);
		font-size: 36px;
		font-weight: 900;
	}

	.detail-meta {
		display: grid;
		gap: 12px;
	}

	.detail-kicker {
		font-size: 11px;
		padding: 6px 12px;
	}

	.detail-meta h2 {
		font-size: clamp(36px, 3.5vw, 52px);
		line-height: 1;
		font-weight: 900;
		color: var(--text-strong);
		margin: 0;
	}

	.detail-tags {
		display: flex;
		gap: 10px;
		flex-wrap: wrap;
	}

	.tag {
		display: inline-flex;
		align-items: center;
		padding: 8px 14px;
		border-radius: 999px;
		border: 1px solid #e5d1af;
		background: #fff8ea;
		color: #8b632f;
		font-size: 12px;
		font-weight: 800;
	}

	.detail-description {
		font-size: 16px;
		line-height: 1.85;
		color: var(--text-soft);
		max-width: 32ch;
		margin: 0;
	}

	.detail-footer {
		display: grid;
		gap: 20px;
		padding-top: 24px;
		border-top: 1px solid rgba(224, 205, 184, 0.72);
	}

	.cta-info {
		display: grid;
		gap: 8px;
	}

	.cta-kicker {
		font-size: 11px;
		padding: 6px 12px;
	}

	.cta-info p {
		font-size: 14px;
		line-height: 1.6;
		color: var(--text-soft);
		margin: 0;
	}

	.start-button {
		display: grid;
		grid-template-columns: 1fr 52px;
		align-items: center;
		gap: 16px;
		width: 100%;
		min-height: 82px;
		padding: 0 28px;
		border-radius: 26px;
		border: 2px solid #d88e14;
		background: linear-gradient(180deg, #f8ba38 0%, var(--accent-strong) 100%);
		color: #fff;
		font-size: 24px;
		font-weight: 900;
		letter-spacing: 0.03em;
		cursor: pointer;
		box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.68), 0 16px 32px rgba(80, 58, 36, 0.16);
		transition: all 0.2s ease;
		font-family: inherit;
	}

	.start-button:hover {
		transform: translateY(-2px);
		filter: brightness(1.05);
		box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.68), 0 20px 40px rgba(80, 58, 36, 0.2);
	}

	.start-button:active {
		transform: translateY(0);
	}

	.start-button:focus-visible {
		outline: 2px solid rgba(245, 158, 11, 0.45);
		outline-offset: 2px;
	}

	.btn-text {
		text-align: left;
	}

	.btn-icon {
		width: 52px;
		height: 52px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: 16px;
		background: rgba(255, 255, 255, 0.28);
	}

	.btn-icon svg {
		width: 24px;
		height: 24px;
	}

	@media (max-width: 1400px) {
		.content {
			grid-template-columns: 200px minmax(0, 1fr) 340px;
			gap: 24px;
			width: calc(100% - 48px);
		}

		.weapon-card {
			grid-template-columns: 64px minmax(0, 1fr) auto;
			min-height: 110px;
		}

		.weapon-glyph {
			width: 64px;
			height: 64px;
			font-size: 24px;
		}
	}

	@media (max-width: 1180px) {
		.content {
			grid-template-columns: 1fr;
			grid-template-areas:
				'header'
				'rail'
				'weapon'
				'detail';
			gap: 20px;
			width: calc(100% - 40px);
			padding: 80px 0 32px;
		}

		.hero-section {
			flex-direction: column;
			align-items: start;
		}

		.hero-meta {
			width: 100%;
		}

		.meta-stats {
			flex-wrap: wrap;
		}

		.nav-rail {
			position: static;
			grid-template-rows: auto;
			grid-template-columns: auto 1fr auto;
			align-items: center;
		}

		.rail-header {
			display: none;
		}

		.rail-actions {
			grid-template-columns: repeat(3, 1fr);
		}

		.rail-btn {
			grid-template-columns: 1fr;
			justify-items: center;
			text-align: center;
			padding: 16px 12px;
		}

		.rail-icon {
			width: 48px;
			height: 48px;
		}

		.weapon-grid {
			grid-template-columns: 1fr;
		}

		.weapon-card {
			grid-template-columns: 72px minmax(0, 1fr) auto;
		}

		.detail-card {
			grid-template-rows: auto auto auto;
		}

		.start-button {
			min-height: 72px;
			font-size: 22px;
		}
	}

	@media (max-width: 720px) {
		.exit-button {
			top: 18px;
			left: 18px;
		}

		.exit-shell {
			width: 48px;
			height: 48px;
			border-radius: 16px;
		}

		.exit-shell svg {
			width: 22px;
			height: 22px;
		}

		.content {
			width: calc(100% - 24px);
			padding: 72px 0 24px;
			gap: 16px;
		}

		.hero-section,
		.weapon-showcase,
		.detail-card {
			padding: 20px 18px;
			border-radius: 24px;
		}

		.hero-text h1 {
			font-size: clamp(42px, 12vw, 64px);
		}

		.nav-rail {
			padding: 18px 14px;
			border-radius: 24px;
		}

		.rail-actions {
			grid-template-columns: 1fr;
		}

		.rail-btn {
			grid-template-columns: 44px 1fr;
			justify-items: start;
			text-align: left;
		}

		.weapon-card {
			grid-template-columns: 56px minmax(0, 1fr);
			gap: 14px;
			min-height: 96px;
			padding: 16px 18px;
		}

		.weapon-glyph {
			width: 56px;
			height: 56px;
			font-size: 22px;
		}

		.weapon-status {
			display: none;
		}

		.detail-header {
			grid-template-columns: 72px minmax(0, 1fr);
			gap: 16px;
		}

		.detail-glyph {
			width: 72px;
			height: 72px;
			font-size: 30px;
			border-radius: 22px;
		}

		.detail-meta h2 {
			font-size: clamp(30px, 9vw, 42px);
		}

		.detail-description {
			max-width: none;
		}

		.start-button {
			grid-template-columns: 1fr 48px;
			min-height: 66px;
			font-size: 20px;
			border-radius: 22px;
		}

		.btn-icon {
			width: 48px;
			height: 48px;
		}
	}
</style>
