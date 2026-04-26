<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let hp = 0;
  export let maxHp = 0;
  export let level = 1;
  export let kills = 0;
  export let correct = 0;
  export let wrong = 0;
  export let pendingRewards = 0;
  export let attackModeLabel = '直线发射';
  export let sourceLabel = '样例题源';
  export let abilityCooldownMs = 0;

  const dispatch = createEventDispatcher<{ exit: void; castAbility: void; openReward: void }>();

  function exit() {
    dispatch('exit');
  }

  function castAbility() {
    dispatch('castAbility');
  }

  function openReward() {
    dispatch('openReward');
  }

  $: hpRatio = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
  $: abilityReady = abilityCooldownMs <= 0;
  $: abilityText = abilityReady ? '可释放' : `${Math.ceil(abilityCooldownMs / 1000)}s`;
</script>

<div class="hud">
  <div class="topbar">
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
      <span>模式</span>
      <strong>{attackModeLabel}</strong>
    </div>

    <div class="pill source">
      <span>题源</span>
      <strong>{sourceLabel}</strong>
    </div>
  </div>

  <div class="right-actions">
    <button
      type="button"
      class={`ability ${abilityReady ? 'ready' : ''}`}
      aria-label="释放脉冲技能"
      on:click={castAbility}
    >
      <span>脉冲</span>
      <strong>{abilityText}</strong>
    </button>

    {#if pendingRewards > 0}
      <button type="button" class="reward" aria-label="打开奖励面板" on:click={openReward}>
        <span>奖励待领</span>
        <strong>×{pendingRewards}</strong>
      </button>
    {/if}
  </div>

  <button type="button" class="exit" aria-label="退出本局" on:click={exit}>
    ←
  </button>
</div>

<style>
  .hud {
    position: absolute;
    inset: 0;
    pointer-events: none;
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
    border: 1px solid #dac8b5;
    background: rgba(255, 250, 244, 0.95);
    color: #5d4936;
    border-radius: 14px;
    padding: 8px 10px;
    min-height: 50px;
    display: grid;
    align-content: center;
    gap: 4px;
    box-shadow: 0 8px 18px rgba(66, 48, 31, 0.12);
  }

  .pill span {
    font-size: 11px;
    color: #8b7767;
  }

  .pill strong {
    font-size: 14px;
    color: #4c3a2c;
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
    min-width: 200px;
    max-width: min(44vw, 340px);
  }

  .source strong {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
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
  .reward {
    border-radius: 16px;
    border: 1px solid #d7c3ae;
    background: rgba(255, 250, 244, 0.97);
    color: #5d4936;
    box-shadow: 0 10px 22px rgba(66, 48, 31, 0.14);
    width: 124px;
    min-height: 60px;
    display: grid;
    gap: 2px;
    align-content: center;
    text-align: center;
    cursor: pointer;
  }

  .ability.ready {
    border-color: #f59e0b;
    background: linear-gradient(180deg, #fff4de, #ffefcf);
  }

  .ability span,
  .reward span {
    font-size: 12px;
    color: #8b7767;
  }

  .ability strong,
  .reward strong {
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
    color: #5d4936;
    box-shadow: 0 10px 22px rgba(66, 48, 31, 0.14);
    cursor: pointer;
    font-size: 18px;
    font-weight: 800;
  }

  @media (max-width: 900px) {
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

    .source {
      min-width: 140px;
      max-width: 70vw;
    }

    .kills-pill,
    .answers-pill {
      display: none;
    }

    .right-actions {
      right: 12px;
      bottom: 12px;
      gap: 8px;
    }

    .ability,
    .reward {
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
</style>
