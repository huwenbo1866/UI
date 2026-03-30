<script lang="ts">
  import type {
    DroneState,
    DamageTextState,
    GameProgressState,
    LaserEffectState,
    MonsterState,
    PlayerState,
    ProjectileState
  } from '../core/types';

  export let width = 1200;
  export let height = 820;
  export let player: PlayerState;
  export let progress: GameProgressState;
  export let monsters: MonsterState[] = [];
  export let projectiles: ProjectileState[] = [];
  export let drones: DroneState[] = [];
  export let lasers: LaserEffectState[] = [];
  export let damageTexts: DamageTextState[] = [];
  export let pendingLevelUps = 0;
  export let onTouchStartPoint: ((event: TouchEvent) => void) | undefined;
  export let onTouchMovePoint: ((event: TouchEvent) => void) | undefined;
  export let onTouchEndPoint: (() => void) | undefined;
  export let onPlayerActivate: (() => void) | undefined;

  $: previousLevelTotal = progress.level <= 1 ? 0 : 10 * (2 ** (progress.level - 2) - 1);
  $: nextLevelTotal = progress.nextLevelTotalExp;
  $: levelProgress =
    nextLevelTotal > previousLevelTotal
      ? ((progress.exp - previousLevelTotal) / (nextLevelTotal - previousLevelTotal)) * 100
      : 0;
</script>

<div
  class="arena"
  style={`--arena-height:${height}px;`}
  on:touchstart|passive={onTouchStartPoint}
  on:touchmove|passive={onTouchMovePoint}
  on:touchend|passive={onTouchEndPoint}
  on:touchcancel|passive={onTouchEndPoint}
>
  <div class="rings ring-1"></div>
  <div class="rings ring-2"></div>
  <div class="rings ring-3"></div>
  <div class="rings ring-4"></div>

  {#each lasers as laser (laser.id)}
    <div
      class="laser"
      style={`left:${laser.from.x}px; top:${laser.from.y}px; width:${Math.hypot(laser.to.x - laser.from.x, laser.to.y - laser.from.y)}px; transform:translate(-50%,-50%) rotate(${Math.atan2(laser.to.y - laser.from.y, laser.to.x - laser.from.x)}rad);`}
    ></div>
  {/each}

  {#each monsters as monster (monster.id)}
    <div
      class={`monster ${monster.difficulty} ${monster.hurtFlashMs > 0 ? "hurt" : ""} ${monster.attackWindupMs > 0 ? "attacking" : ""}`}
      style={`left:${monster.x}px; top:${monster.y}px; width:${monster.radius * 2}px; height:${monster.radius * 2}px;`}
    >
      <div class="monster-hp-bar">
        <span style={`width:${(monster.hp / monster.maxHp) * 100}%`}></span>
      </div>
      <div class="monster-face"></div>
      {#if monster.attackWindupMs > 0}
        <div class="monster-attack-ring"></div>
      {/if}
    </div>
  {/each}

  {#each drones as drone (drone.id)}
    <div class="drone" style={`left:${drone.x}px; top:${drone.y}px;`}>
      <div class="drone-face"></div>
    </div>
  {/each}

  {#each damageTexts as damage (damage.id)}
    <div class="damage-text" style={`left:${damage.x}px; top:${damage.y}px; color:${damage.color};`}>- {damage.value}</div>
  {/each}

  {#each projectiles as projectile (projectile.id)}
    <div
      class="projectile"
      style={`left:${projectile.x}px; top:${projectile.y}px; background:${projectile.color ?? '#f59e0b'};`}
    ></div>
  {/each}

  <button
    type="button"
    class={`player ${player.hurtFlashMs > 0 ? "hurt" : ""}`}
    style={`left:${player.x}px; top:${player.y}px; width:${player.radius * 2}px; height:${player.radius * 2}px;`}
    on:click|stopPropagation={onPlayerActivate}
    on:touchstart|stopPropagation={onPlayerActivate}
  >
    <div class="player-bars">
      <div class="player-level">Lv.{progress.level}</div>
      <div class="player-exp-bar"><span style={`width:${Math.max(0, Math.min(100, levelProgress))}%`}></span></div>
      <div class="player-hp-bar"><span style={`width:${(player.hp / player.maxHp) * 100}%`}></span></div>
    </div>
    {#if pendingLevelUps > 0}
      <div class="reward-ready">!{pendingLevelUps > 1 ? `×${pendingLevelUps}` : ''}</div>
    {/if}
    <div class="player-avatar"></div>
  </button>
</div>

<style>
  .arena { position: relative; width: 100%; min-height: var(--arena-height); height: var(--arena-height); overflow: hidden; border-radius: 0; background:
      radial-gradient(circle at 15% 18%, rgba(83, 69, 56, 0.12) 0 6%, transparent 6.2%),
      radial-gradient(circle at 70% 24%, rgba(83, 69, 56, 0.12) 0 7%, transparent 7.2%),
      radial-gradient(circle at 85% 68%, rgba(83, 69, 56, 0.12) 0 5.6%, transparent 5.9%),
      radial-gradient(circle at 28% 82%, rgba(83, 69, 56, 0.12) 0 6.4%, transparent 6.7%), #ede5dc;
    border: 0; box-shadow: inset 0 1px 0 rgba(255,255,255,0.6); }
  .rings { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); border: 1px solid rgba(31, 41, 55, 0.18); border-radius: 999px; pointer-events: none; }
  .ring-1 { width: clamp(150px, 24vw, 190px); height: clamp(150px, 24vw, 190px); }
  .ring-2 { width: clamp(310px, 54vw, 420px); height: clamp(310px, 54vw, 420px); }
  .ring-3 { width: clamp(480px, 78vw, 650px); height: clamp(480px, 78vw, 650px); }
  .ring-4 { width: clamp(620px, 106vw, 900px); height: clamp(620px, 106vw, 900px); }
  .player,.monster,.projectile,.drone,.laser { position: absolute; transform: translate(-50%, -50%); }
  .player { border: none; padding: 0; background: transparent; box-shadow: none; display: flex; align-items: center; justify-content: center; cursor: pointer; width: 68px; height: 68px; }
  .player.hurt .player-avatar,.monster.hurt .monster-face { filter: saturate(1.6) brightness(1.1) drop-shadow(0 0 8px rgba(255, 60, 60, 0.8)); }
  .damage-text { position: absolute; transform: translate(-50%, -50%); font-size: 18px; font-weight: 800; text-shadow: 0 0 10px rgba(255, 90, 90, 0.45); pointer-events: none; z-index: 32; }
  .player-avatar { width: 100%; height: 100%; background-image: url('/knowledge-defense/player.png'); background-size: contain; background-position: center; background-repeat: no-repeat; }
  .monster { border: none; background: transparent; box-shadow: none; display: flex; align-items: center; justify-content: center; overflow: visible; width: 54px; height: 54px; }
  .monster-face { width: 100%; height: 100%; background-size: contain; background-position: center; background-repeat: no-repeat; }
  .monster.easy .monster-face { background-image: url('/knowledge-defense/monster-easy.png'); }
  .monster.medium .monster-face { background-image: url('/knowledge-defense/monster-medium.png'); }
  .monster.hard .monster-face { background-image: url('/knowledge-defense/monster-hard.png'); }
  .monster.attacking .monster-face { filter: saturate(1.4) brightness(1.05) drop-shadow(0 0 10px rgba(248, 113, 113, 0.8)); }
  .monster-attack-ring { position: absolute; left: 50%; top: 50%; width: 74px; height: 74px; border-radius: 999px; border: 2px solid rgba(248, 113, 113, 0.9); transform: translate(-50%, -50%); animation: monsterWindup 320ms ease-out infinite; pointer-events: none; }
  .drone { width: 34px; height: 34px; background: transparent; border: none; box-shadow: none; display: flex; align-items: center; justify-content: center; overflow: visible; }
  .drone-face { width: 100%; height: 100%; background-image: url('/knowledge-defense/drone.png'); background-size: contain; background-position: center; background-repeat: no-repeat; }
  .player-bars { position: absolute; left: 50%; top: -42px; transform: translateX(-50%); width: 90px; display: grid; gap: 4px; }
  .player-level { color: #5a4736; font-size: 11px; text-align: center; font-weight: 700; text-shadow: 0 1px 0 rgba(255,255,255,0.7); }
  .player-exp-bar,.player-hp-bar,.monster-hp-bar { height: 8px; border-radius: 999px; background: rgba(0, 0, 0, 0.14); overflow: hidden; box-shadow: inset 0 1px 2px rgba(0,0,0,0.08); }
  .monster-hp-bar { position: absolute; left: 50%; top: -14px; transform: translateX(-50%); width: 74px; }
  .player-exp-bar span,.player-hp-bar span,.monster-hp-bar span { display: block; height: 100%; border-radius: 999px; }
  .player-exp-bar span { background: linear-gradient(90deg, #f59e0b, #f97316); }
  .player-hp-bar span,.monster-hp-bar span { background: linear-gradient(90deg, #34d399, #22c55e); }
  .reward-ready { position: absolute; right: -6px; top: -8px; min-width: 24px; height: 24px; padding: 0 6px; border-radius: 999px; background: #ef4444; color: #fff; font-size: 12px; font-weight: 800; display: flex; align-items: center; justify-content: center; box-shadow: 0 8px 16px rgba(239, 68, 68, 0.35); }
  .projectile { width: 12px; height: 12px; border-radius: 999px; box-shadow: 0 0 10px rgba(255,255,255,0.5); }
  .laser { height: 3px; background: linear-gradient(90deg, rgba(96,165,250,0.15), rgba(96,165,250,0.95), rgba(96,165,250,0.15)); transform-origin: left center; pointer-events: none; border-radius: 999px; box-shadow: 0 0 10px rgba(96,165,250,0.7); }
  @keyframes monsterWindup { from { transform: translate(-50%, -50%) scale(0.82); opacity: 0.95; } to { transform: translate(-50%, -50%) scale(1.12); opacity: 0.15; } }
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