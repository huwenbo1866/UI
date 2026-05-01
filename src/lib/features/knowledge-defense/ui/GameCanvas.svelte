<script lang="ts">
	import { onMount } from 'svelte';
	import {
		BATTLEFIELD_DROP_EXPIRING_TTL_MS,
		KD_ASSET_PATHS,
		KD_DRONE_TUNING,
		MONSTER_ATTACK_WINDUP_MS,
		MONSTER_DASH_TELEGRAPH_MS,
		MONSTER_THROW_TELEGRAPH_MS
	} from '../config/constants';
	import type {
		BattlefieldDropState,
		DamageTextState,
		DroneState,
		GameProgressState,
		LaserEffectState,
		MonsterSkillKind,
		MonsterState,
		PlayerState,
		ProjectileState
	} from '../core/types';
	import { getBattlefieldDropDefinition } from '../systems/battlefield-drop-system';
	import {
		getMonsterAnimationOffset,
		getMonsterVisualState,
		resolveMonsterSpriteFrame
	} from './monster-sprites';

	export let width = 1200;
	export let height = 820;
	export let player: PlayerState;
	export let progress: GameProgressState;
	export let monsters: MonsterState[] = [];
	export let drones: DroneState[] = [];
	export let battlefieldDrops: BattlefieldDropState[] = [];
	export let projectiles: ProjectileState[] = [];

	export let lasers: LaserEffectState[] = [];
	export let damageTexts: DamageTextState[] = [];
	export let pendingLevelUps = 0;
	export let abilityPulseFxMs = 0;
	export let abilityDashFxMs = 0;
	export let abilityKarateFxMs = 0;
	export let dashRemainingMs = 0;
	export let dashDirectionX = 0;
	export let dashDirectionY = 1;
	export let karateDirectionX = 0;
	export let karateDirectionY = 1;
	export let karateRangeMultiplier = 1;
	export let animationTimeMs: number | undefined = undefined;
	export let onTouchStartPoint: ((event: TouchEvent) => void) | undefined;
	export let onTouchMovePoint: ((event: TouchEvent) => void) | undefined;
	export let onTouchEndPoint: (() => void) | undefined;
	export let onPlayerActivate: (() => void) | undefined;

	let liveAnimationTimeMs = 0;

	onMount(() => {
		if (animationTimeMs !== undefined) {
			return;
		}

		let frameHandle = 0;

		const tick = (timestamp: number) => {
			liveAnimationTimeMs = timestamp;
			frameHandle = window.requestAnimationFrame(tick);
		};

		frameHandle = window.requestAnimationFrame(tick);

		return () => {
			window.cancelAnimationFrame(frameHandle);
		};
	});


	$: playerTilt = Math.max(-14, Math.min(14, player.moveDirX * 14));
	$: playerFaceScale = player.moving ? 1.05 : 1;
	$: pulseOpacity = Math.max(0, Math.min(1, abilityPulseFxMs / 320));
	$: dashOpacity = Math.max(0, Math.min(1, abilityDashFxMs / 180));
	$: karateOpacity = Math.max(0, Math.min(1, abilityKarateFxMs / 180));
	$: dashAngle = Math.atan2(dashDirectionY, dashDirectionX || 0.0001);
	$: karateAngle = Math.atan2(karateDirectionY, karateDirectionX || 0.0001);
	$: karateFxOffset = 34 * Math.max(1, karateRangeMultiplier);
	$: karateFxScale = Math.max(1, karateRangeMultiplier);
	$: effectiveAnimationTimeMs = animationTimeMs ?? liveAnimationTimeMs;
	$: renderedDrops = sortByYIfNeeded(battlefieldDrops).map((drop) => ({
		drop,
		definition: getBattlefieldDropDefinition(drop.kind),
		expiring: drop.ttlMs <= BATTLEFIELD_DROP_EXPIRING_TTL_MS
	}));
	$: renderedMonsters = sortByYIfNeeded(monsters).map((monster) => {
		const visualState = getMonsterVisualState(monster);
		const attackKind = getMonsterSkillKind(monster);

		return {
			monster,
			attackKind,
			telegraphLabel: getMonsterTelegraphLabel(attackKind),
			visualState,
			spritePath: resolveMonsterSpriteFrame({
				difficulty: monster.difficulty,
				visualState,
				elapsedMs: effectiveAnimationTimeMs,
				animationOffsetMs: getMonsterAnimationOffset(monster.id)
			})
		};
	});
	$: renderedDrones = sortByYIfNeeded(drones);


	function sortByYIfNeeded<T extends { y: number }>(items: T[]) {
		if (items.length <= 1) {
			return items;
		}

		return [...items].sort((a, b) => a.y - b.y);
	}

	function getMonsterSkillKind(monster: MonsterState): MonsterSkillKind {
		if (monster.skill?.kind) {
			return monster.skill.kind;
		}

		if (monster.difficulty === 'medium') {
			return 'dash';
		}

		if (monster.difficulty === 'hard') {
			return 'throw';
		}

		return 'melee';
	}

	function getMonsterTelegraphDurationMs(monster: MonsterState) {
		const attackKind = getMonsterSkillKind(monster);

		if (attackKind === 'dash') {
			return MONSTER_DASH_TELEGRAPH_MS;
		}

		if (attackKind === 'throw') {
			return MONSTER_THROW_TELEGRAPH_MS;
		}

		return MONSTER_ATTACK_WINDUP_MS;
	}

	function getMonsterTelegraphLabel(attackKind: MonsterSkillKind) {
		if (attackKind === 'dash') {
			return '冲刺';
		}

		if (attackKind === 'throw') {
			return '投掷';
		}

		return '扑击';
	}

	function getMonsterTelegraphProgress(monster: MonsterState) {
		if (monster.attackState !== 'telegraph') {
			return 0;
		}

		const durationMs = getMonsterTelegraphDurationMs(monster);

		return Math.max(
			0,
			Math.min(1, (durationMs - monster.attackWindupMs) / durationMs)
		);
	}
</script>

<div
	class="arena"
	role="application"
	aria-label="Knowledge Defense / 知识防御 战场"
	style={`--arena-width:${width}px; --arena-height:${height}px;`}
	on:touchstart|passive={onTouchStartPoint}
	on:touchmove|passive={onTouchMovePoint}
	on:touchend|passive={onTouchEndPoint}
	on:touchcancel|passive={onTouchEndPoint}
>
	<div class="rings ring-1"></div>
	<div class="rings ring-2"></div>
	<div class="rings ring-3"></div>
	<div class="rings ring-4"></div>

	{#if abilityPulseFxMs > 0}
		<div
			class="ability-pulse"
			style={`left:${player.x}px; top:${player.y}px; opacity:${pulseOpacity};`}
		></div>
	{/if}

	{#if abilityDashFxMs > 0}
		<div
			class="ability-dash-streak"
			style={`left:${player.x}px; top:${player.y}px; opacity:${dashOpacity}; --dash-angle:${dashAngle}rad;`}
		></div>
		<div
			class="ability-dash-bars"
			style={`left:${player.x}px; top:${player.y}px; opacity:${dashOpacity}; --dash-angle:${dashAngle}rad;`}
		>
			<span></span><span></span><span></span>
		</div>
	{/if}

	{#if abilityKarateFxMs > 0}
		<div
			class="ability-karate"
			style={`left:${player.x + karateDirectionX * karateFxOffset}px; top:${player.y + karateDirectionY * karateFxOffset}px; opacity:${karateOpacity}; --karate-angle:${karateAngle}rad; --karate-scale:${karateFxScale};`}
		></div>
	{/if}

	{#each renderedDrops as renderedDrop (renderedDrop.drop.id)}
		<div
			class={`battlefield-drop ${renderedDrop.drop.kind} ${renderedDrop.expiring ? 'expiring' : ''}`}
			style={`left:${renderedDrop.drop.x}px; top:${renderedDrop.drop.y}px; width:${renderedDrop.drop.radius * 2}px; height:${renderedDrop.drop.radius * 2}px; z-index:${18 + Math.round(renderedDrop.drop.y / 12)};`}
		>
			<div class="entity-shadow drop-shadow"></div>
			<div class="drop-core" aria-hidden="true">{renderedDrop.definition.arenaGlyph}</div>
			<div class="drop-label">{renderedDrop.definition.shortLabel}</div>
		</div>
	{/each}

	{#each lasers as laser (laser.id)}
		<div
			class="laser"
			style={`left:${laser.from.x}px; top:${laser.from.y}px; width:${Math.hypot(laser.to.x - laser.from.x, laser.to.y - laser.from.y)}px; transform:translateY(-50%) rotate(${Math.atan2(laser.to.y - laser.from.y, laser.to.x - laser.from.x)}rad); --laser-width-multiplier:${laser.widthMultiplier || 1}; opacity:${Math.max(0, Math.min(1, laser.ttlMs / 160))};`}
		></div>
	{/each}

	{#each renderedDrones as drone (drone.id)}
		<div
			class="drone"
			style={`left:${drone.x}px; top:${drone.y}px; width:${KD_DRONE_TUNING.spriteSize}px; height:${KD_DRONE_TUNING.spriteSize}px; z-index:${26 + Math.round(drone.y / 12)};`}
		>
			<div class="entity-shadow drone-shadow"></div>
			<img
				class="drone-face"
				src={KD_ASSET_PATHS.droneSprite}
				alt=""
				aria-hidden="true"
				draggable="false"
			/>
		</div>
	{/each}

	{#each renderedMonsters as renderedMonster (renderedMonster.monster.id)}
		<div
			class={`monster ${renderedMonster.monster.difficulty} attack-${renderedMonster.attackKind} ${renderedMonster.monster.hurtFlashMs > 0 ? 'hurt' : ''} ${renderedMonster.monster.attackState === 'telegraph' ? 'telegraphing' : ''} ${renderedMonster.monster.attackState === 'active' && renderedMonster.attackKind === 'dash' ? 'dashing' : ''} ${renderedMonster.monster.attackState === 'recovery' ? 'recovering' : ''}`}
			data-attack-kind={renderedMonster.attackKind}
			data-visual-state={renderedMonster.visualState}
			style={`left:${renderedMonster.monster.x}px; top:${renderedMonster.monster.y}px; width:${renderedMonster.monster.radius * 2}px; height:${renderedMonster.monster.radius * 2}px; z-index:${30 + Math.round(renderedMonster.monster.y / 10)}; --monster-tilt:${Math.max(-8, Math.min(8, renderedMonster.monster.moveDirX * 8))}deg; --monster-telegraph-progress:${getMonsterTelegraphProgress(renderedMonster.monster)};`}
		>
			<div class="entity-shadow monster-shadow"></div>
			{#if renderedMonster.monster.attackState === 'active' && renderedMonster.attackKind === 'dash'}
				<div class="monster-dash-trail"></div>
			{/if}
			{#if renderedMonster.monster.attackState === 'telegraph'}
				<div class={`monster-skill-tag ${renderedMonster.attackKind}`}>
					{renderedMonster.telegraphLabel}
				</div>
				<div class="monster-telegraph-aura"></div>
				<div class="monster-attack-flare"></div>
			{/if}
			<div class="monster-hp-bar">
				<span style={`width:${(renderedMonster.monster.hp / renderedMonster.monster.maxHp) * 100}%`}
				></span>
			</div>
			<img
				class="monster-face"
				src={renderedMonster.spritePath}
				alt=""
				aria-hidden="true"
				draggable="false"
				data-sprite-path={renderedMonster.spritePath}
			/>
			{#if renderedMonster.monster.attackState === 'telegraph'}
				<div class="monster-attack-ring"></div>
			{/if}
		</div>
	{/each}

	{#each damageTexts as damage (damage.id)}
		<div
			class="damage-text"
			style={`left:${damage.x}px; top:${damage.y}px; color:${damage.color};`}
		>
			- {damage.value}
		</div>
	{/each}

	{#each projectiles as projectile (projectile.id)}
		<div
			class={`projectile ${(projectile.owner ?? 'player') === 'monster' ? 'hostile' : 'friendly'}`}
			data-owner={projectile.owner ?? 'player'}
			data-kind={projectile.kind ?? 'bullet'}
			style={`left:${projectile.x}px; top:${projectile.y}px; background:${projectile.color ?? '#f59e0b'}; --projectile-angle:${Math.atan2(projectile.vy, projectile.vx || 0.0001)}rad;`}
		></div>
	{/each}

	<button
		type="button"
		class={`player ${player.hurtFlashMs > 0 ? 'hurt' : ''} ${dashRemainingMs > 0 ? 'dashing' : ''}`}
		style={`left:${player.x}px; top:${player.y}px; width:${player.radius * 2}px; height:${player.radius * 2}px;`}
		on:click|stopPropagation={onPlayerActivate}
		on:touchstart|stopPropagation={onPlayerActivate}
	>
		<div class="entity-shadow player-shadow"></div>
		<div class="player-bars">
			<div class="player-hp-bar">
				<span style={`width:${(player.hp / player.maxHp) * 100}%`}></span>
				<small class="hp-text">{Math.max(0, Math.round(player.hp))}/{player.maxHp}</small>
			</div>
		</div>
		{#if pendingLevelUps > 0}
			<div class="reward-ready">!{pendingLevelUps > 1 ? `×${pendingLevelUps}` : ''}</div>
		{/if}
		<div
			class={`player-avatar ${player.moving ? 'moving' : 'idle'}`}
			style={`--tilt:${playerTilt}deg; --face-scale:${playerFaceScale};`}
		></div>
	</button>
</div>

<style>
	.arena {
		position: relative;
		width: min(100%, var(--arena-width));
		min-height: var(--arena-height);
		height: var(--arena-height);
		overflow: hidden;
		border-radius: 0;
		--monster-telegraph-accent: rgba(191, 78, 54, 0.82);
		--monster-telegraph-glow: rgba(255, 234, 214, 0.68);
		--monster-telegraph-shadow: rgba(117, 67, 46, 0.18);
		--monster-telegraph-ring: rgba(255, 244, 230, 0.35);
		--arena-drop-shell: rgba(255, 251, 245, 0.98);
		--arena-drop-border: rgba(219, 204, 184, 0.96);
		--arena-drop-label-bg: rgba(255, 250, 244, 0.94);
		--arena-drop-label-text: #5b4837;
		--arena-drop-weapon: #f59e0b;
		--arena-drop-xp: #3b82f6;
		--arena-drop-heal: #22c55e;
		background:
			radial-gradient(circle at 15% 18%, rgba(83, 69, 56, 0.12) 0 6%, transparent 6.2%),
			radial-gradient(circle at 70% 24%, rgba(83, 69, 56, 0.12) 0 7%, transparent 7.2%),
			radial-gradient(circle at 85% 68%, rgba(83, 69, 56, 0.12) 0 5.6%, transparent 5.9%),
			radial-gradient(circle at 28% 82%, rgba(83, 69, 56, 0.12) 0 6.4%, transparent 6.7%), #ede5dc;
		border: 0;
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.6);
	}
	.rings {
		position: absolute;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		border: 1px solid rgba(31, 41, 55, 0.18);
		border-radius: 999px;
		pointer-events: none;
	}
	.ring-1 {
		width: clamp(150px, 24vw, 190px);
		height: clamp(150px, 24vw, 190px);
	}
	.ring-2 {
		width: clamp(310px, 54vw, 420px);
		height: clamp(310px, 54vw, 420px);
	}
	.ring-3 {
		width: clamp(480px, 78vw, 650px);
		height: clamp(480px, 78vw, 650px);
	}
	.ring-4 {
		width: clamp(620px, 106vw, 900px);
		height: clamp(620px, 106vw, 900px);
	}
	.player,
	.monster,
	.drone,
	.battlefield-drop,
	.projectile,
	.laser {
		position: absolute;
		transform: translate(-50%, -50%);
	}
	.ability-pulse {
		position: absolute;
		width: 24px;
		height: 24px;
		border-radius: 999px;
		transform: translate(-50%, -50%);
		border: 2px solid rgba(248, 186, 51, 0.95);
		box-shadow: 0 0 0 0 rgba(248, 186, 51, 0.6);
		animation: abilityPulseExpand 320ms ease-out forwards;
		pointer-events: none;
		z-index: 26;
	}
	.ability-dash-streak,
	.ability-dash-bars,
	.ability-karate {
		position: absolute;
		transform: translate(-50%, -50%);
		pointer-events: none;
	}
	.ability-dash-streak {
		width: 116px;
		height: 34px;
		border-radius: 999px;
		transform: translate(-50%, -50%) rotate(var(--dash-angle, 0rad));
		background: linear-gradient(90deg, rgba(255, 247, 196, 0), rgba(252, 211, 77, 0.92), rgba(255, 247, 196, 0));
		filter: blur(4px);
		z-index: 27;
	}
	.ability-dash-bars {
		display: grid;
		gap: 6px;
		z-index: 28;
		transform: translate(-50%, -50%) rotate(var(--dash-angle, 0rad));
	}
	.ability-dash-bars span {
		display: block;
		width: 72px;
		height: 4px;
		border-radius: 999px;
		background: linear-gradient(90deg, rgba(255, 255, 255, 0), rgba(255, 245, 157, 0.94), rgba(255, 255, 255, 0));
		box-shadow: 0 0 12px rgba(250, 204, 21, 0.42);
	}
	.ability-dash-bars span:nth-child(2) {
		width: 92px;
	}
	.ability-karate {
		width: calc(98px * var(--karate-scale, 1));
		height: calc(98px * var(--karate-scale, 1));
		border-radius: 999px;
		transform: translate(-50%, -50%) rotate(var(--karate-angle, 0rad));
		background: conic-gradient(from 190deg, rgba(255, 255, 255, 0), rgba(248, 250, 252, 0.98), rgba(251, 191, 36, 0.74), rgba(255, 255, 255, 0));
		mask-image: radial-gradient(circle, transparent 0 44%, rgba(0, 0, 0, 0.94) 60%, transparent 78%);
		filter: drop-shadow(0 0 12px rgba(251, 191, 36, 0.38));
		z-index: 28;
	}
	.player {
		border: none;
		padding: 0;
		background: transparent;
		box-shadow: none;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		width: 68px;
		height: 68px;
	}
	.entity-shadow {
		position: absolute;
		left: 50%;
		bottom: 2px;
		transform: translateX(-50%);
		border-radius: 999px;
		pointer-events: none;
		filter: blur(2px);
		opacity: 0.34;
		background: radial-gradient(circle, rgba(51, 39, 29, 0.42), rgba(51, 39, 29, 0));
	}
	.player-shadow {
		width: 46px;
		height: 12px;
	}
	.monster-shadow {
		width: 34px;
		height: 10px;
	}
	.drop-shadow {
		width: 28px;
		height: 9px;
		opacity: 0.28;
	}
	.drone-shadow {
		width: 22px;
		height: 8px;
		opacity: 0.26;
	}
	.drone-face {
		width: 100%;
		height: 100%;
		display: block;
		object-fit: contain;
		pointer-events: none;
		user-select: none;
	}
	.player.hurt .player-avatar,
	.monster.hurt .monster-face {
		filter: saturate(1.6) brightness(1.1) drop-shadow(0 0 8px rgba(255, 60, 60, 0.8));
	}
	.player.dashing .player-avatar {
		filter: saturate(1.12) brightness(1.08) drop-shadow(0 0 12px rgba(252, 211, 77, 0.72));
	}
	.damage-text {
		position: absolute;
		transform: translate(-50%, -50%);
		font-size: 18px;
		font-weight: 800;
		text-shadow: 0 0 10px rgba(255, 90, 90, 0.45);
		pointer-events: none;
		z-index: 32;
	}
	.player-avatar {
		width: 100%;
		height: 100%;
		background-image: url(${KD_ASSET_PATHS.playerSprite});
		background-size: contain;
		background-position: center;
		background-repeat: no-repeat;
		transform: rotate(var(--tilt, 0deg)) scale(var(--face-scale, 1));
		animation: playerIdleBob 980ms ease-in-out infinite;
	}

	.player-avatar.moving {
		animation: playerRunBob 420ms ease-in-out infinite;
	}

	.player-avatar.idle {
		animation: playerIdleBob 980ms ease-in-out infinite;
	}
	.monster {
		border: none;
		background: transparent;
		box-shadow: none;
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: visible;
		width: 54px;
		height: 54px;
	}
	.monster-face {
		width: 100%;
		height: 100%;
		display: block;
		object-fit: contain;
		pointer-events: none;
		user-select: none;
		transform: rotate(var(--monster-tilt, 0deg)) scale(1);
		animation: monsterPresence 620ms ease-in-out infinite;
	}
	.monster.telegraphing .monster-face {
		filter: saturate(1.35) brightness(1.04) drop-shadow(0 0 10px rgba(191, 78, 54, 0.32));
		animation: monsterTelegraphPresence 320ms ease-in-out infinite;
	}
	.monster[data-attack-kind='dash'] {
		--monster-telegraph-accent: rgba(180, 83, 9, 0.88);
		--monster-telegraph-glow: rgba(255, 236, 188, 0.72);
		--monster-telegraph-shadow: rgba(146, 64, 14, 0.24);
		--monster-telegraph-ring: rgba(251, 191, 36, 0.28);
	}
	.monster[data-attack-kind='throw'] {
		--monster-telegraph-accent: rgba(153, 27, 27, 0.88);
		--monster-telegraph-glow: rgba(254, 226, 226, 0.68);
		--monster-telegraph-shadow: rgba(127, 29, 29, 0.22);
		--monster-telegraph-ring: rgba(248, 113, 113, 0.24);
	}
	.monster.dashing .monster-face {
		filter: saturate(1.18) brightness(1.02) drop-shadow(0 0 12px rgba(217, 119, 6, 0.34));
		animation: monsterDashBurst 140ms linear infinite;
	}
	.monster.recovering .monster-face {
		opacity: 0.92;
		filter: saturate(0.88);
	}
	.monster-skill-tag {
		position: absolute;
		left: 50%;
		top: -30px;
		transform: translateX(-50%);
		padding: 4px 8px;
		border-radius: 999px;
		font-size: 10px;
		font-weight: 800;
		line-height: 1;
		letter-spacing: 0.06em;
		white-space: nowrap;
		color: #fff7ed;
		box-shadow: 0 8px 16px rgba(66, 48, 31, 0.18);
		pointer-events: none;
	}
	.monster-skill-tag.dash {
		background: linear-gradient(135deg, rgba(245, 158, 11, 0.94), rgba(180, 83, 9, 0.96));
	}
	.monster-skill-tag.throw {
		background: linear-gradient(135deg, rgba(220, 38, 38, 0.94), rgba(127, 29, 29, 0.96));
	}
	.monster-skill-tag.melee {
		background: linear-gradient(135deg, rgba(194, 65, 12, 0.9), rgba(120, 53, 15, 0.94));
	}
	.monster-dash-trail {
		position: absolute;
		left: 50%;
		top: 50%;
		width: calc(100% + 30px);
		height: calc(100% - 10px);
		border-radius: 999px;
		transform: translate(-58%, -50%) rotate(var(--monster-tilt, 0deg));
		background: linear-gradient(
			90deg,
			rgba(245, 158, 11, 0),
			rgba(245, 158, 11, 0.18),
			rgba(245, 158, 11, 0.62),
			rgba(245, 158, 11, 0)
		);
		filter: blur(4px);
		opacity: 0.78;
		pointer-events: none;
	}
	.monster-telegraph-aura {
		position: absolute;
		left: 50%;
		top: 50%;
		width: 68px;
		height: 68px;
		border-radius: 999px;
		transform: translate(-50%, -50%);
		background:
			radial-gradient(
				circle,
				var(--monster-telegraph-glow) 0 22%,
				rgba(245, 158, 11, 0.26) 50%,
				rgba(245, 158, 11, 0) 78%
			),
			radial-gradient(circle, rgba(190, 74, 52, 0.26), rgba(190, 74, 52, 0));
		box-shadow:
			0 0 0 1px rgba(190, 74, 52, 0.12),
			0 10px 22px var(--monster-telegraph-shadow);
		opacity: calc(0.32 + var(--monster-telegraph-progress, 0) * 0.48);
		animation: monsterTelegraphAura 320ms ease-out infinite;
		pointer-events: none;
	}
	.monster-attack-flare {
		position: absolute;
		left: 50%;
		top: 50%;
		width: 82px;
		height: 82px;
		border-radius: 999px;
		transform: translate(-50%, -50%) rotate(calc(var(--monster-telegraph-progress, 0) * 28deg));
		background: conic-gradient(
			from 180deg,
			rgba(191, 78, 54, 0) 0deg,
			rgba(191, 78, 54, 0.14) 56deg,
			rgba(245, 158, 11, 0.42) 108deg,
			rgba(191, 78, 54, 0.08) 164deg,
			rgba(191, 78, 54, 0) 360deg
		);
		mask-image: radial-gradient(
			circle,
			transparent 0 40%,
			rgba(0, 0, 0, 0.94) 62%,
			transparent 80%
		);
		opacity: calc(0.18 + var(--monster-telegraph-progress, 0) * 0.42);
		pointer-events: none;
	}
	.monster-attack-ring {
		position: absolute;
		left: 50%;
		top: 50%;
		width: calc(68px + var(--monster-telegraph-progress, 0) * 10px);
		height: calc(68px + var(--monster-telegraph-progress, 0) * 10px);
		border-radius: 999px;
		border: 2px solid var(--monster-telegraph-accent);
		box-shadow: 0 0 0 4px var(--monster-telegraph-ring);
		transform: translate(-50%, -50%);
		animation: monsterWindup 320ms ease-out infinite;
		pointer-events: none;
	}
	.player-bars {
		position: absolute;
		left: 50%;
		top: -42px;
		transform: translateX(-50%);
		width: 90px;
		display: grid;
		gap: 4px;
	}
	.player-hp-bar,
	.monster-hp-bar {
		height: 8px;
		border-radius: 999px;
		background: rgba(0, 0, 0, 0.14);
		overflow: hidden;
		box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.08);
	}
	.monster-hp-bar {
		position: absolute;
		left: 50%;
		top: -14px;
		transform: translateX(-50%);
		width: 74px;
	}
	.player-hp-bar span,
	.monster-hp-bar span {
		display: block;
		height: 100%;
		border-radius: 999px;
	}
	.hp-text {
		position: absolute;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		font-size: 10px;
		font-weight: 800;
		color: rgba(255, 255, 255, 0.92);
		text-shadow: 0 2px 6px rgba(39, 28, 19, 0.35);
		pointer-events: none;
	}
	.player-hp-bar span,
	.monster-hp-bar span {
		background: linear-gradient(90deg, #34d399, #22c55e);
	}

	.player-hp-bar {
		position: relative;
	}
	.reward-ready {
		position: absolute;
		right: -6px;
		top: -8px;
		min-width: 24px;
		height: 24px;
		padding: 0 6px;
		border-radius: 999px;
		background: #ef4444;
		color: #fff;
		font-size: 12px;
		font-weight: 800;
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: 0 8px 16px rgba(239, 68, 68, 0.35);
	}
	.battlefield-drop {
		--drop-accent: var(--arena-drop-weapon);
		overflow: visible;
		pointer-events: none;
	}
	.battlefield-drop.weapon {
		--drop-accent: var(--arena-drop-weapon);
	}
	.battlefield-drop.xp {
		--drop-accent: var(--arena-drop-xp);
	}
	.battlefield-drop.heal {
		--drop-accent: var(--arena-drop-heal);
	}
	.battlefield-drop.expiring .drop-core,
	.battlefield-drop.expiring .drop-label {
		animation-duration: 420ms;
	}
	.drop-core {
		width: 100%;
		height: 100%;
		border-radius: 999px;
		border: 1px solid var(--arena-drop-border);
		background:
			radial-gradient(circle at 30% 28%, rgba(255, 255, 255, 0.94), rgba(255, 255, 255, 0) 44%),
			linear-gradient(
				180deg,
				color-mix(in srgb, var(--drop-accent) 16%, var(--arena-drop-shell)),
				var(--arena-drop-shell)
			);
		color: var(--drop-accent);
		display: grid;
		place-items: center;
		font-size: 18px;
		font-weight: 900;
		box-shadow:
			0 10px 18px color-mix(in srgb, var(--drop-accent) 26%, transparent),
			inset 0 1px 0 rgba(255, 255, 255, 0.76);
		animation: dropBob 1.05s ease-in-out infinite;
	}
	.drop-label {
		position: absolute;
		left: 50%;
		top: calc(100% + 6px);
		transform: translateX(-50%);
		padding: 4px 8px;
		border-radius: 999px;
		border: 1px solid var(--arena-drop-border);
		background: var(--arena-drop-label-bg);
		color: var(--arena-drop-label-text);
		font-size: 11px;
		font-weight: 700;
		line-height: 1;
		white-space: nowrap;
		box-shadow: 0 6px 14px rgba(66, 48, 31, 0.12);
		animation: dropLabelPulse 1.05s ease-in-out infinite;
	}
	.projectile {
		width: 12px;
		height: 12px;
		border-radius: 999px;
		box-shadow: 0 0 10px rgba(255, 255, 255, 0.5);
	}
	.projectile.friendly {
		transform: translate(-50%, -50%) rotate(var(--projectile-angle, 0rad));
		box-shadow: 0 0 10px rgba(255, 255, 255, 0.5);
	}
	.projectile.friendly[data-kind='missile'] {
		width: 24px;
		height: 12px;
		border-radius: 999px 40% 40% 999px;
		box-shadow:
			0 0 0 1px rgba(255, 247, 237, 0.48),
			0 0 14px rgba(251, 146, 60, 0.5);
	}
	.projectile.friendly[data-kind='missile']::after {
		content: '';
		position: absolute;
		right: -6px;
		top: 50%;
		width: 12px;
		height: 6px;
		border-radius: 999px;
		background: linear-gradient(90deg, rgba(255, 237, 213, 0.95), rgba(251, 146, 60, 0));
		transform: translateY(-50%);
		filter: blur(1px);
	}
	.projectile.hostile {
		width: 14px;
		height: 14px;
		border-radius: 4px;
		transform: translate(-50%, -50%) rotate(45deg);
		box-shadow:
			0 0 0 2px rgba(255, 236, 236, 0.5),
			0 0 14px rgba(127, 29, 29, 0.46);
	}
	.laser {
		height: 3px;
		background: linear-gradient(
			90deg,
			rgba(96, 165, 250, 0.15),
			rgba(96, 165, 250, 0.95),
			rgba(96, 165, 250, 0.15)
		);
		transform-origin: left center;
		pointer-events: none;
		border-radius: 999px;
		box-shadow: 0 0 10px rgba(96, 165, 250, 0.7);
	}
	@keyframes monsterWindup {
		from {
			transform: translate(-50%, -50%) scale(0.82);
			opacity: 0.95;
		}
		to {
			transform: translate(-50%, -50%) scale(1.12);
			opacity: 0.15;
		}
	}

	@keyframes dropBob {
		0%,
		100% {
			transform: translateY(0px) scale(1);
		}
		50% {
			transform: translateY(-3px) scale(1.03);
		}
	}

	@keyframes dropLabelPulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.76;
		}
	}

	@keyframes monsterTelegraphAura {
		from {
			transform: translate(-50%, -50%) scale(0.92);
			opacity: 0.9;
		}
		to {
			transform: translate(-50%, -50%) scale(1.08);
			opacity: 0.34;
		}
	}

	@keyframes playerIdleBob {
		0%,
		100% {
			transform: rotate(var(--tilt, 0deg)) scale(var(--face-scale, 1)) translateY(0px);
		}
		50% {
			transform: rotate(var(--tilt, 0deg)) scale(calc(var(--face-scale, 1) * 1.02)) translateY(-2px);
		}
	}

	@keyframes playerRunBob {
		0%,
		100% {
			transform: rotate(var(--tilt, 0deg)) scale(var(--face-scale, 1)) translateY(0px);
		}
		25% {
			transform: rotate(calc(var(--tilt, 0deg) - 2deg)) scale(calc(var(--face-scale, 1) * 1.04))
				translateY(-2px);
		}
		75% {
			transform: rotate(calc(var(--tilt, 0deg) + 2deg)) scale(calc(var(--face-scale, 1) * 1.04))
				translateY(1px);
		}
	}


	@keyframes monsterPresence {
		0%,
		100% {
			transform: rotate(var(--monster-tilt, 0deg)) scale(1) translateY(0px);
		}
		50% {
			transform: rotate(calc(var(--monster-tilt, 0deg) * 1.1)) scale(1.04) translateY(-1.5px);
		}
	}

	@keyframes monsterTelegraphPresence {
		0%,
		100% {
			transform: rotate(var(--monster-tilt, 0deg)) scale(1.02) translateY(0px);
		}
		50% {
			transform: rotate(calc(var(--monster-tilt, 0deg) * 0.8)) scale(1.08) translateY(-2px);
		}
	}

	@keyframes monsterDashBurst {
		0%,
		100% {
			transform: rotate(var(--monster-tilt, 0deg)) scale(1.08) translateY(0px);
		}
		50% {
			transform: rotate(calc(var(--monster-tilt, 0deg) * 0.7)) scale(1.15) translateY(-1px);
		}
	}

	@keyframes abilityPulseExpand {
		from {
			width: 28px;
			height: 28px;
			opacity: 0.98;
			box-shadow: 0 0 0 0 rgba(248, 186, 51, 0.6);
		}
		to {
			width: 340px;
			height: 340px;
			opacity: 0.06;
			box-shadow: 0 0 0 40px rgba(248, 186, 51, 0);
		}
	}
	@media (max-width: 900px) {
		.arena {
			border-radius: 18px;
			margin: 8px;
			width: calc(100% - 16px);
			min-height: calc(100dvh - 16px);
			height: calc(100dvh - 16px);
			border: 1px solid #d8cbbd;
		}
	}
</style>
