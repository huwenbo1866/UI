<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { audioManager } from '../systems/audio-manager';

	type StartWeaponId = 'straight' | 'scatter' | 'laser' | 'missile' | 'karate';
	type WeaponOption = {
		id: StartWeaponId;
		name: string;
		compatName: string;
		detail: string;
		isSelectable: boolean;
		icon: 'bullet' | 'scatter' | 'laser' | 'rocket' | 'fist';
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
			name: '直线射击',
			compatName: '直线主武器',
			detail: '打怪嘛...就是得一步一个脚印',
			isSelectable: true,
			icon: 'bullet'
		},
		{
			id: 'scatter',
			name: '散射',
			compatName: '散射主武器',
			detail: '大范围打击...嘿嘿',
			isSelectable: true,
			icon: 'scatter'
		},
		{
			id: 'laser',
			name: '激光',
			compatName: '激光教鞭',
			detail: '哼，躲在后面就打不着你了是吧？',
			isSelectable: true,
			icon: 'laser'
		},
		{
			id: 'missile',
			name: '导弹发射器',
			compatName: '导弹发射器',
			detail: '时代变了，不用再手动瞄准了',
			isSelectable: true,
			icon: 'rocket'
		},
		{
			id: 'karate',
			name: '空手道',
			compatName: '空手道',
			detail: '真正的打击感源于最朴素的方式...看我一个“啊哒”',
			isSelectable: true,
			icon: 'fist'
		}
	];

	$: currentWeapon = weaponOptions.find((weapon) => weapon.id === selectedWeaponId) ?? weaponOptions[0];

	function playClick() {
		audioManager.playClick();
	}

	function handleWeaponSelect(weapon: WeaponOption) {
		if (!weapon.isSelectable) return;
		playClick();
		dispatch('weaponSelect', { weaponId: weapon.id });
	}
</script>

<section class="start-page">
	<button class="exit-button" type="button" aria-label="退出到首页" on:click={() => dispatch('exitHome')}>
		<svg viewBox="0 0 24 24" aria-hidden="true">
			<path d="M15.5 4.5L8 12l7.5 7.5" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" />
		</svg>
	</button>

	<div class="dot-pattern" aria-hidden="true"></div>
	<div class="edge-pattern" aria-hidden="true"></div>
	<span class="sr-only">Knowledge Defense {sourceLabel} {sourceDetail} {sourceIsFallback ? 'Fallback' : 'Chapter'} 错题 {wrongCount}</span>

	<div class="layout-shell">
		<header class="title-block" aria-label="Knowledge-Defence">
			<h1 class="brand-title">Knowledge-Defence</h1>
			<div class="title-ornament" aria-hidden="true">
				<span class="spark left"></span>
				<span class="line short"></span>
				<span class="line long"></span>
				<span class="spark right"></span>
			</div>
		</header>

		<div class="start-grid">
			<aside class="intro-column panel-divider-left">
				<section class="intro-copy">
					<h2>知识闯关</h2>
					<div class="section-accent" aria-hidden="true"></div>
					<p>把章节、系统观知识点练练成知识关课界，在学习、所向能化，最后从盒而积累成果果度挑战。</p>
				</section>

				<nav class="menu-card" aria-label="启动页导航">
					<button
						class="menu-row active"
						type="button"
						on:click={() => {
							playClick();
							dispatch('start');
						}}
					>
						<span class="menu-icon crossed" aria-hidden="true">
							<svg viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12M8.7 5.8l-2-2M15.3 5.8l2-2M8.7 18.2l-2 2M15.3 18.2l2 2" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" /></svg>
						</span>
						<span>新游戏</span>
					</button>

					<button
						class="menu-row"
						type="button"
						data-rail-item="settings"
						on:click={() => {
							playClick();
							dispatch('settings');
						}}
					>
						<span class="menu-icon" aria-hidden="true">
							<svg viewBox="0 0 24 24"><path d="M12 3.4l1.6 2.4 2.8.5.5 2.8 2.4 1.6-2.4 1.6-.5 2.8-2.8.5L12 20.6l-1.6-2.4-2.8-.5-.5-2.8-2.4-1.6 2.4-1.6.5-2.8 2.8-.5L12 3.4Z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.9"/></svg>
						</span>
						<span>设置</span>
					</button>

					<button
						class="menu-row"
						type="button"
						data-rail-item="notebook"
						on:click={() => {
							playClick();
							dispatch('notebook');
						}}
					>
						<span class="menu-icon" aria-hidden="true">
							<svg viewBox="0 0 24 24"><rect x="5.5" y="4.5" width="13" height="15" rx="2.2" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M8.5 8.5h7M8.5 12h7M8.5 15.5h5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
						</span>
						<span>错题集</span>
					</button>

					<button
						class="menu-row"
						type="button"
						data-rail-item="help"
						on:click={() => {
							playClick();
							dispatch('help');
						}}
					>
						<span class="menu-icon" aria-hidden="true">
							<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.2" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M9.6 9.4c.35-1.15 1.25-1.9 2.55-1.9 1.45 0 2.55.92 2.55 2.24 0 1.14-.72 1.72-1.6 2.25-.9.55-1.35 1.08-1.35 2.15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><circle cx="12" cy="17" r="1" fill="currentColor"/></svg>
						</span>
						<span>帮助 / 图例</span>
					</button>
				</nav>
			</aside>

			<main class="weapon-column panel-divider-center" aria-label="选择主武器">
				<div class="section-header">
					<h2>选择主武器：</h2>
					<div class="mini-line" aria-hidden="true"></div>
				</div>
				<div class="weapon-list" data-selected-weapon={selectedWeaponId}>
					{#each weaponOptions as weapon}
						<button
							type="button"
							class="weapon-row"
							class:active={selectedWeaponId === weapon.id}
							data-weapon-row={weapon.id}
							on:click={() => handleWeaponSelect(weapon)}
							disabled={!weapon.isSelectable}
							aria-pressed={selectedWeaponId === weapon.id}
							aria-label={`${weapon.compatName}，${weapon.name}${weapon.isSelectable ? '，点击选择' : '，暂未开放'}`}
						>
							<span class="weapon-icon" aria-hidden="true">
								{#if weapon.icon === 'bullet'}
									<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M25 20l21-8c3.7-1.4 6.8 1.7 5.4 5.4L43.5 38 25 20Z" fill="currentColor"/><path d="M15 28l14-5M9 38l20-8M18 47l17-13" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><circle cx="44" cy="18" r="3.2" fill="#fff4dd"/></svg>
								{:else if weapon.icon === 'scatter'}
									<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M20 47L42 17" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round"/><path d="M12 38l16-9M31 52l6-18M45 43l-3-16" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><circle cx="45" cy="15" r="5" fill="currentColor"/><circle cx="10" cy="39" r="3" fill="currentColor"/><circle cx="31" cy="53" r="3" fill="currentColor"/><circle cx="47" cy="44" r="3" fill="currentColor"/></svg>
								{:else if weapon.icon === 'laser'}
									<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="10" fill="currentColor"/><path d="M32 6v12M32 46v12M6 32h12M46 32h12M13.5 13.5l8.5 8.5M42 42l8.5 8.5M50.5 13.5L42 22M22 42l-8.5 8.5" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>
								{:else if weapon.icon === 'rocket'}
									<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M38 10c7 2 12 7 14 14L39 37l-12-12L38 10Z" fill="currentColor"/><path d="M26 27l-12 2 7 7M37 38l-2 12-7-7" fill="currentColor" opacity=".88"/><path d="M19 45l-7 7M25 48l-4 8M16 39l-8 4" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><circle cx="42" cy="20" r="3.5" fill="#fff4dd"/></svg>
								{:else}
									<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M19 30V17a5 5 0 0 1 10 0v10-12a5 5 0 0 1 10 0v12-9a5 5 0 0 1 10 0v16l2-4a5 5 0 0 1 8 5l-8 17H27L16 42a7 7 0 0 1 3-12Z" fill="currentColor"/></svg>
								{/if}
							</span>
							<span class="weapon-label">{weapon.name}</span>
						</button>
					{/each}
				</div>
			</main>

			<aside class="detail-column panel-divider-right" data-current-weapon={selectedWeaponId}>
				<div class="detail-top">
					<span class="detail-icon" aria-hidden="true">
						{#if currentWeapon.icon === 'bullet'}
							<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M25 20l21-8c3.7-1.4 6.8 1.7 5.4 5.4L43.5 38 25 20Z" fill="currentColor"/><path d="M15 28l14-5M9 38l20-8M18 47l17-13" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><circle cx="44" cy="18" r="3.2" fill="#fff4dd"/></svg>
						{:else if currentWeapon.icon === 'scatter'}
							<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M20 47L42 17" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round"/><path d="M12 38l16-9M31 52l6-18M45 43l-3-16" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><circle cx="45" cy="15" r="5" fill="currentColor"/><circle cx="10" cy="39" r="3" fill="currentColor"/><circle cx="31" cy="53" r="3" fill="currentColor"/><circle cx="47" cy="44" r="3" fill="currentColor"/></svg>
						{:else if currentWeapon.icon === 'laser'}
							<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="10" fill="currentColor"/><path d="M32 6v12M32 46v12M6 32h12M46 32h12M13.5 13.5l8.5 8.5M42 42l8.5 8.5M50.5 13.5L42 22M22 42l-8.5 8.5" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>
						{:else if currentWeapon.icon === 'rocket'}
							<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M38 10c7 2 12 7 14 14L39 37l-12-12L38 10Z" fill="currentColor"/><path d="M26 27l-12 2 7 7M37 38l-2 12-7-7" fill="currentColor" opacity=".88"/><path d="M19 45l-7 7M25 48l-4 8M16 39l-8 4" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><circle cx="42" cy="20" r="3.5" fill="#fff4dd"/></svg>
						{:else}
							<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M19 30V17a5 5 0 0 1 10 0v10-12a5 5 0 0 1 10 0v12-9a5 5 0 0 1 10 0v16l2-4a5 5 0 0 1 8 5l-8 17H27L16 42a7 7 0 0 1 3-12Z" fill="currentColor"/></svg>
						{/if}
					</span>
					<div class="detail-text">
						<h2>{currentWeapon.name}</h2>
						<div class="tags">
							<span>功能</span>
							<span>主要</span>
							{#if selectedWeaponId === currentWeapon.id}<span class="sr-only">已选</span>{/if}
						</div>
						<p>{currentWeapon.detail}</p>
						<span class="sr-only">{currentWeapon.compatName}</span>
					</div>
				</div>

				<button
					type="button"
					class="start-button"
					data-start-cta="true"
					on:click={() => {
						playClick();
						dispatch('start');
					}}
				>
					开始闯关
				</button>
			</aside>
		</div>
	</div>
</section>

<style>
	.start-page {
		--bg: #f7f1e6;
		--bg-2: #fbf7ef;
		--bg-3: #f5ecdf;
		--ink: #1c1a18;
		--muted: #3b372f;
		--orange: #df7d10;
		--orange-strong: #cb6908;
		--orange-deep: #995312;
		--soft-panel: rgba(255, 251, 244, 0.76);
		--soft-panel-2: rgba(255, 247, 237, 0.92);
		--line: rgba(207, 165, 114, 0.42);
		position: relative;
		min-height: 100dvh;
		width: 100%;
		overflow: hidden;
		background:
			radial-gradient(circle at 10% 14%, rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0) 28%),
			radial-gradient(circle at 84% 12%, rgba(255, 240, 220, 0.82), rgba(255, 240, 220, 0) 28%),
			linear-gradient(115deg, var(--bg) 0%, var(--bg-2) 50%, #f8efe1 100%);
		color: var(--ink);
		font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
	}

	.start-page::before {
		content: '';
		position: absolute;
		inset: 0;
		pointer-events: none;
		background-image: radial-gradient(circle, rgba(196, 129, 56, 0.07) 0 1.05px, transparent 1.3px);
		background-size: 14px 14px;
		opacity: 0.22;
	}

	.dot-pattern,
	.edge-pattern {
		position: absolute;
		pointer-events: none;
	}

	.dot-pattern {
		right: -22px;
		top: -8px;
		width: 430px;
		height: 190px;
		background-image: radial-gradient(circle, rgba(228, 143, 44, 0.62) 1.4px, transparent 1.9px);
		background-size: 14px 14px;
		mask-image: linear-gradient(180deg, rgba(0,0,0,1), rgba(0,0,0,0.15));
		opacity: 0.78;
	}

	.edge-pattern {
		right: -8px;
		top: 150px;
		bottom: 24px;
		width: 240px;
		background-image: radial-gradient(circle, rgba(222, 139, 33, 0.3) 1.1px, transparent 1.7px);
		background-size: 15px 15px;
		mask-image: linear-gradient(90deg, transparent 0, rgba(0,0,0,0.3) 20%, rgba(0,0,0,1) 58%);
		opacity: 0.6;
	}

	.layout-shell {
		position: relative;
		z-index: 1;
		width: min(1730px, calc(100vw - 48px));
		min-height: 100dvh;
		margin: 0 auto;
		padding: 40px 0 34px;
		box-sizing: border-box;
	}

	.exit-button {
		position: absolute;
		left: 22px;
		top: 30px;
		z-index: 5;
		width: 62px;
		height: 62px;
		border: 1px solid rgba(214, 165, 104, 0.42);
		border-radius: 14px;
		background: linear-gradient(180deg, rgba(251, 245, 235, 0.95), rgba(247, 235, 218, 0.92));
		color: var(--orange);
		box-shadow: 0 10px 18px rgba(131, 93, 54, 0.1), inset 0 1px 0 rgba(255,255,255,0.92);
		cursor: pointer;
		transition: transform 0.16s ease, box-shadow 0.16s ease;
	}

	.exit-button:hover {
		transform: translateY(-1px);
		box-shadow: 0 14px 22px rgba(131, 93, 54, 0.14), inset 0 1px 0 rgba(255,255,255,0.96);
	}

	.exit-button svg {
		width: 34px;
		height: 34px;
	}

	.title-block {
		padding-left: 126px;
	}

	.brand-title {
		margin: 0;
		font-family: Georgia, 'Times New Roman', serif;
		font-size: clamp(72px, 6.3vw, 116px);
		line-height: 0.92;
		font-weight: 700;
		letter-spacing: 0.01em;
		white-space: nowrap;
		color: transparent;
		background: linear-gradient(180deg, #f5d9ae 0%, #f7e7c8 32%, #fffaf2 54%, #f3d3a0 100%);
		background-clip: text;
		-webkit-background-clip: text;
		-webkit-text-stroke: 1.8px #d97a16;
		text-shadow:
			0 1px 0 rgba(255, 255, 255, 0.98),
			0 0 0.01px rgba(217, 122, 22, 0.6),
			2px 3px 0 rgba(202, 116, 29, 0.14),
			0 16px 32px rgba(145, 96, 45, 0.09);
	}

	.title-ornament {
		display: flex;
		align-items: center;
		gap: 14px;
		margin-top: 10px;
		padding-left: 4px;
	}

	.title-ornament .line {
		height: 1.5px;
		background: linear-gradient(90deg, rgba(221, 177, 115, 0.18), rgba(221, 177, 115, 0.58), rgba(221, 177, 115, 0.2));
		border-radius: 999px;
	}

	.title-ornament .line.short {
		width: 410px;
	}

	.title-ornament .line.long {
		width: 630px;
	}

	.title-ornament .spark {
		position: relative;
		width: 12px;
		height: 12px;
		flex: 0 0 auto;
	}

	.title-ornament .spark::before,
	.title-ornament .spark::after {
		content: '';
		position: absolute;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		border-radius: 999px;
		background: #e1af67;
	}

	.title-ornament .spark::before {
		width: 12px;
		height: 2px;
	}

	.title-ornament .spark::after {
		width: 2px;
		height: 12px;
	}

	.start-grid {
		display: grid;
		grid-template-columns: 410px 510px minmax(430px, 1fr);
		gap: 42px;
		align-items: stretch;
		margin-top: 44px;
		padding: 0 52px 0 60px;
	}

	.intro-column,
	.weapon-column,
	.detail-column {
		position: relative;
		min-height: 610px;
	}

	.panel-divider-center::before,
	.panel-divider-right::before {
		content: '';
		position: absolute;
		left: -22px;
		top: 22px;
		bottom: 12px;
		width: 1px;
		background: linear-gradient(180deg, rgba(216, 183, 143, 0), rgba(216, 183, 143, 0.75) 12%, rgba(216, 183, 143, 0.75) 86%, rgba(216, 183, 143, 0));
	}

	.intro-column {
		padding: 38px 6px 0 0;
	}

	.weapon-column {
		padding: 40px 0 0 22px;
		transform: translateY(50px);
	}

	.detail-column {
		padding: 72px 0 0 30px;
		display: grid;
		grid-template-rows: auto 1fr;
	}

	.intro-copy h2 {
		margin: 0;
		font-size: 54px;
		font-weight: 900;
		letter-spacing: -0.04em;
		color: var(--orange-strong);
	}

	.section-accent {
		position: relative;
		width: 194px;
		height: 18px;
		margin: 6px 0 22px;
	}

	.section-accent::before {
		content: '';
		position: absolute;
		left: 16px;
		top: 8px;
		width: 176px;
		height: 1.5px;
		background: linear-gradient(90deg, rgba(226, 171, 107, 0.15), rgba(226, 171, 107, 0.65), rgba(226, 171, 107, 0.22));
	}

	.section-accent::after {
		content: '✦';
		position: absolute;
		left: 0;
		top: -2px;
		font-size: 15px;
		color: rgba(226, 171, 107, 0.95);
	}

	.intro-copy p {
		margin: 0;
		max-width: 330px;
		font-size: 22px;
		line-height: 1.58;
		font-weight: 600;
		color: #26231f;
	}

	.menu-card {
		width: 360px;
		margin-top: 36px;
		border: 1px solid rgba(223, 181, 125, 0.52);
		border-radius: 16px;
		overflow: hidden;
		background: linear-gradient(180deg, rgba(255, 250, 243, 0.84), rgba(255, 248, 238, 0.7));
		box-shadow: 0 16px 38px rgba(132, 93, 47, 0.08);
		backdrop-filter: blur(4px);
	}

	.menu-row {
		position: relative;
		width: 100%;
		height: 82px;
		display: grid;
		grid-template-columns: 70px 1fr;
		align-items: center;
		border: 0;
		border-bottom: 1px solid rgba(229, 188, 133, 0.38);
		background: transparent;
		color: #24211c;
		font: inherit;
		font-size: 26px;
		font-weight: 800;
		text-align: left;
		cursor: pointer;
		transition: background 0.14s ease, transform 0.14s ease;
	}

	.menu-row:last-child {
		border-bottom: 0;
	}

	.menu-row.active {
		background: linear-gradient(90deg, rgba(255, 217, 163, 0.72), rgba(255, 236, 207, 0.88));
		color: var(--orange-strong);
	}

	.menu-row:not(.active)::after {
		content: '';
		position: absolute;
		right: 24px;
		bottom: 0;
		width: 8px;
		height: 8px;
		background: rgba(222, 175, 112, 0.66);
		clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%);
	}

	.menu-row:hover {
		background: linear-gradient(90deg, rgba(255, 224, 183, 0.56), rgba(255, 247, 234, 0.92));
	}

	.menu-icon {
		justify-self: center;
		width: 34px;
		height: 34px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		color: var(--orange);
	}

	.menu-icon svg {
		width: 100%;
		height: 100%;
	}

	.section-header h2 {
		margin: 0;
		font-size: 40px;
		font-weight: 600;
		letter-spacing: -0.03em;
		color: #23211f;
	}

	.mini-line {
		position: relative;
		width: 430px;
		height: 20px;
		margin: 6px 0 18px;
	}

	.mini-line::before {
		content: '';
		position: absolute;
		left: 16px;
		right: 14px;
		top: 9px;
		height: 1.4px;
		background: linear-gradient(90deg, rgba(221, 173, 111, 0.18), rgba(221, 173, 111, 0.72), rgba(221, 173, 111, 0.16));
	}

	.mini-line::after {
		content: '';
		position: absolute;
		left: 0;
		top: 4px;
		width: 10px;
		height: 10px;
		background: #ddb16d;
		clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%);
		box-shadow: 412px 0 0 #ddb16d;
	}

	.weapon-list {
		display: grid;
		gap: 10px;
		width: 430px;
	}

	.weapon-row {
		position: relative;
		width: 100%;
		height: 84px;
		display: grid;
		grid-template-columns: 78px 1fr;
		align-items: center;
		border: 1px solid rgba(229, 188, 133, 0.45);
		border-radius: 14px;
		background: linear-gradient(180deg, rgba(255, 252, 247, 0.84), rgba(255, 247, 237, 0.72));
		box-shadow: inset 0 1px 0 rgba(255,255,255,0.92), 0 8px 18px rgba(145, 108, 66, 0.04);
		color: #1e1b18;
		font: inherit;
		font-size: 27px;
		font-weight: 500;
		text-align: left;
		cursor: pointer;
		transition: transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease;
	}

	.weapon-row:hover {
		transform: translateY(-1px);
		box-shadow: inset 0 1px 0 rgba(255,255,255,0.92), 0 12px 24px rgba(145, 108, 66, 0.08);
	}

	.weapon-row.active {
		border-color: rgba(232, 144, 34, 0.82);
		background: linear-gradient(90deg, rgba(255, 236, 203, 0.98) 0%, rgba(255, 230, 184, 0.96) 78%, rgba(255, 230, 184, 0.2) 78%);
		box-shadow: inset 0 0 0 1px rgba(238, 148, 36, 0.24), 0 14px 28px rgba(191, 130, 67, 0.12);
		clip-path: polygon(0 0, calc(100% - 34px) 0, 100% 50%, calc(100% - 34px) 100%, 0 100%);
	}

	.weapon-row.active::before {
		content: '';
		position: absolute;
		inset: 3px;
		border: 1px solid rgba(255, 195, 112, 0.9);
		clip-path: polygon(0 0, calc(100% - 34px) 0, 100% 50%, calc(100% - 34px) 100%, 0 100%);
		pointer-events: none;
	}

	.weapon-label {
		position: relative;
		z-index: 1;
	}

	.weapon-icon,
	.detail-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border: 1px solid rgba(225, 167, 95, 0.38);
		border-radius: 13px;
		background: linear-gradient(135deg, rgba(255, 251, 243, 0.98), rgba(252, 237, 208, 0.92));
		color: var(--orange);
		box-shadow: inset 0 1px 0 rgba(255,255,255,0.96);
	}

	.weapon-icon {
		width: 60px;
		height: 60px;
		margin-left: 8px;
	}

	.weapon-icon :global(svg),
	.detail-icon :global(svg) {
		width: 48px;
		height: 48px;
	}

	.detail-top {
		display: grid;
		grid-template-columns: 114px 1fr;
		gap: 28px;
		align-items: start;
	}

	.detail-icon {
		width: 88px;
		height: 88px;
	}

	.detail-text h2 {
		margin: 8px 0 18px;
		font-size: 52px;
		line-height: 1.04;
		font-weight: 900;
		letter-spacing: -0.04em;
		color: #231b14;
	}

	.tags {
		display: flex;
		gap: 14px;
		margin-bottom: 18px;
	}

	.tags span:not(.sr-only) {
		display: inline-flex;
		align-items: center;
		height: 40px;
		padding: 0 20px;
		border-radius: 999px;
		border: 1px solid rgba(221, 176, 116, 0.44);
		background: linear-gradient(180deg, rgba(255, 248, 235, 0.92), rgba(255, 235, 203, 0.84));
		box-shadow: 0 8px 16px rgba(141, 103, 59, 0.05), inset 0 1px 0 rgba(255,255,255,0.96);
		color: var(--orange-strong);
		font-size: 19px;
		font-weight: 700;
	}

	.detail-text p {
		margin: 0;
		max-width: 520px;
		font-size: 19px;
		line-height: 1.78;
		font-weight: 700;
		color: #36312c;
	}

	.start-button {
		position: relative;
		align-self: end;
		justify-self: start;
		width: min(400px, 84%);
		height: 106px;
		margin: 0 0 8px 200px;
		border: 1px solid rgba(206, 112, 18, 0.96);
		border-radius: 14px;
		background: linear-gradient(180deg, #ffad1c 0%, #f7900a 100%);
		box-shadow: 0 16px 24px rgba(77, 51, 20, 0.2), inset 0 1px 0 rgba(255,255,255,0.4);
		color: #fffaf1;
		font: inherit;
		font-size: 33px;
		font-weight: 900;
		letter-spacing: 0.03em;
		cursor: pointer;
		transition: transform 0.16s ease, filter 0.16s ease;
	}

	.start-button::before {
		content: '';
		position: absolute;
		inset: 6px;
		border: 1px solid rgba(255, 199, 111, 0.7);
		border-radius: 10px;
		pointer-events: none;
	}

	.start-button:hover {
		transform: translateY(-1px);
		filter: brightness(1.03);
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	@media (max-width: 1320px) {
		.title-block {
			padding-left: 96px;
		}

		.brand-title {
			font-size: clamp(60px, 6vw, 94px);
		}

		.title-ornament .line.short {
			width: 280px;
		}

		.title-ornament .line.long {
			width: 360px;
		}

		.start-grid {
			grid-template-columns: 360px 450px minmax(340px, 1fr);
			gap: 32px;
		}

		.menu-card,
		.weapon-list,
		.mini-line {
			width: 100%;
		}

		.weapon-row {
			font-size: 23px;
		}

		.detail-text h2 {
			font-size: 42px;
		}
	}

	@media (max-width: 1180px) {
		.start-page {
			overflow: auto;
		}

		.layout-shell {
			width: min(900px, calc(100vw - 28px));
			padding: 82px 0 30px;
		}

		.exit-button {
			left: 12px;
			top: 12px;
			width: 54px;
			height: 54px;
		}

		.exit-button svg {
			width: 30px;
			height: 30px;
		}

		.title-block {
			padding-left: 0;
		}

		.brand-title {
			white-space: normal;
			font-size: clamp(52px, 9vw, 82px);
			-webkit-text-stroke-width: 1.3px;
		}

		.title-ornament .line.short,
		.title-ornament .line.long {
			width: 100%;
		}

		.start-grid {
			grid-template-columns: 1fr;
			gap: 26px;
			padding: 0;
		}

		.panel-divider-center::before,
		.panel-divider-right::before {
			display: none;
		}

		.intro-column,
		.weapon-column,
		.detail-column {
			min-height: auto;
			padding: 0;
		}

		.intro-copy p,
		.menu-card,
		.weapon-list,
		.mini-line {
			max-width: none;
			width: 100%;
		}

		.detail-column {
			gap: 26px;
		}

		.start-button {
			justify-self: stretch;
			width: 100%;
			margin: 0;
		}
	}

	@media (max-width: 640px) {
		.layout-shell {
			width: calc(100vw - 20px);
		}

		.brand-title {
			font-size: clamp(38px, 12vw, 56px);
		}

		.title-ornament {
			gap: 8px;
		}

		.intro-copy h2 {
			font-size: 28px;
		}

		.intro-copy p,
		.detail-text p {
			font-size: 17px;
		}

		.menu-row {
			height: 70px;
			font-size: 22px;
		}

		.weapon-row {
			height: 74px;
			grid-template-columns: 70px 1fr;
			font-size: 22px;
		}

		.weapon-row.active {
			clip-path: none;
			border-radius: 14px;
		}

		.weapon-row.active::before {
			clip-path: none;
			border-radius: 11px;
		}

		.weapon-icon,
		.detail-icon {
			width: 56px;
			height: 56px;
		}

		.weapon-icon :global(svg),
		.detail-icon :global(svg) {
			width: 42px;
			height: 42px;
		}

		.detail-top {
			grid-template-columns: 74px 1fr;
			gap: 16px;
		}

		.detail-text h2 {
			font-size: 34px;
		}

		.tags span:not(.sr-only) {
			height: 34px;
			padding: 0 14px;
			font-size: 16px;
		}

		.start-button {
			height: 78px;
			font-size: 28px;
		}
	}
</style>
