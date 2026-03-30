<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { AttackPreference } from '../core/types';
  import { audioManager } from '../systems/audio-manager';
  
  export let attackPreference: AttackPreference = 'straight';
  export let wrongCount = 0;

  const dispatch = createEventDispatcher<{
    start: void;
    settings: void;
    notebook: void;
    exitHome: void;
  }>();
</script>

<section class="start-page">
  <button class="icon-exit" type="button" aria-label="退出到首页" on:click={() => dispatch('exitHome')}>
    <span class="icon-shell">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M15 6L9 12L15 18" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </span>
  </button>

  <div class="bg-orb orb-a"></div>
  <div class="bg-orb orb-b"></div>
  <div class="grid-texture"></div>

  <div class="content">
    <div class="hero-copy">
      <div class="eyebrow">知识防御 · 启动界面</div>
      <h1>KNOWLEDGE<br />DEFENSE</h1>
      <div class="splash">Start &amp; Review!</div>
      <p class="subtitle">将启动、设置与错题复盘整合到同一个整页入口中，先准备，再开战。</p>

      <div class="status-row">
        <span class="status">当前攻击模式：{attackPreference === 'straight' ? '直线发射' : '散射'}</span>
        <span class="status">错题集：{wrongCount} 条</span>
      </div>
    </div>

    <div class="action-panel">
      <button type="button" class="main-btn primary" on:click={() => { audioManager.playClick(); dispatch('start');}}>开始闯关</button>
      <button type="button" class="main-btn" on:click={() => { audioManager.playClick(); dispatch('settings');}}>设置</button>
      <button type="button" class="main-btn" on:click={() => {audioManager.playClick(); dispatch('notebook');}}>错题集</button>
      <p class="tip">开始闯关会进入战场；设置用于切换攻击偏好；错题集可先做复盘，不会清空你当前已有功能数据。</p>
    </div>
  </div>
</section>

<style>
  .start-page {
    position: relative;
    min-height: 100dvh;
    width: 100%;
    overflow: hidden;
    background:
      radial-gradient(circle at 18% 18%, rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0) 34%),
      radial-gradient(circle at 82% 78%, rgba(255, 236, 208, 0.92), rgba(255, 236, 208, 0) 28%),
      linear-gradient(180deg, #fbf8f3 0%, #f5eee5 50%, #f2e8dc 100%);
    color: #5d4936;
  }

  .grid-texture {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background-image:
      linear-gradient(rgba(138, 105, 73, 0.05) 1px, transparent 1px),
      linear-gradient(90deg, rgba(138, 105, 73, 0.05) 1px, transparent 1px);
    background-size: 28px 28px;
    mask-image: linear-gradient(180deg, rgba(0,0,0,0.5), rgba(0,0,0,0.12));
  }

  .bg-orb {
    position: absolute;
    border-radius: 999px;
    pointer-events: none;
    filter: blur(10px);
  }

  .orb-a {
    width: 520px;
    height: 520px;
    right: -60px;
    top: -80px;
    background: radial-gradient(circle, rgba(255, 214, 160, 0.55), rgba(255, 214, 160, 0));
  }

  .orb-b {
    width: 420px;
    height: 420px;
    left: -80px;
    bottom: -100px;
    background: radial-gradient(circle, rgba(255, 244, 220, 0.85), rgba(255, 244, 220, 0));
  }

  .icon-exit {
    position: absolute;
    left: 22px;
    top: 22px;
    z-index: 3;
    border: 0;
    background: transparent;
    padding: 0;
    cursor: pointer;
  }

  .icon-shell {
    width: 54px;
    height: 54px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 18px;
    color: #5d4936;
    background: rgba(255, 250, 244, 0.96);
    border: 1px solid #d9c7b3;
    box-shadow: 0 10px 22px rgba(66, 48, 31, 0.14);
  }

  .icon-shell svg {
    width: 24px;
    height: 24px;
  }

  .content {
    position: relative;
    z-index: 1;
    min-height: 100dvh;
    width: min(1400px, calc(100% - 64px));
    margin: 0 auto;
    display: grid;
    grid-template-columns: minmax(0, 1.15fr) minmax(360px, 520px);
    align-items: center;
    gap: 40px;
    padding: 88px 0 48px;
    box-sizing: border-box;
  }

  .hero-copy {
    position: relative;
    padding: 12px 0;
  }

  .eyebrow {
    display: inline-flex;
    padding: 8px 14px;
    border-radius: 999px;
    background: #f7eddc;
    color: #8b5e3c;
    font-weight: 800;
    font-size: 14px;
  }

  h1 {
    position: relative;
    margin: 18px 0 0;
    font-size: clamp(72px, 10vw, 140px);
    line-height: 0.9;
    letter-spacing: 1px;
    color: #fffdf9;
    -webkit-text-stroke: 6px #5c4736;
    text-shadow: 0 10px 22px rgba(73, 55, 35, 0.12);
    font-weight: 900;
  }

  .splash {
    position: absolute;
    right: 5%;
    top: 28px;
    transform: rotate(-12deg);
    color: #eab308;
    font-size: clamp(24px, 2.4vw, 38px);
    font-weight: 900;
    text-shadow: 0 3px 0 rgba(119, 75, 10, 0.16);
  }

  .subtitle {
    width: min(680px, 100%);
    margin: 18px 0 0;
    color: #6b5644;
    font-size: clamp(16px, 2vw, 24px);
    line-height: 1.8;
    font-weight: 700;
  }

  .status-row {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    margin-top: 24px;
  }

  .status {
    background: rgba(255, 250, 244, 0.94);
    border: 1px solid #e2d3c2;
    border-radius: 999px;
    padding: 10px 14px;
    color: #6d5847;
    font-size: 14px;
    font-weight: 700;
  }

  .action-panel {
    background: rgba(255, 251, 246, 0.82);
    border: 1px solid #e3d5c7;
    border-radius: 28px;
    padding: 26px;
    box-shadow: 0 18px 42px rgba(88, 64, 42, 0.1);
    backdrop-filter: blur(8px);
  }

  .main-btn {
    width: 100%;
    min-height: 78px;
    border-radius: 18px;
    border: 1px solid #cfb89d;
    background: rgba(245, 239, 229, 0.98);
    color: #5c4736;
    font-size: 24px;
    font-weight: 900;
    letter-spacing: 0.5px;
    cursor: pointer;
    box-shadow: inset 0 2px 0 rgba(255,255,255,0.68), 0 8px 18px rgba(80, 58, 36, 0.08);
  }

  .main-btn + .main-btn {
    margin-top: 12px;
  }

  .main-btn.primary {
    border-color: #f59e0b;
    color: #fff;
    background: linear-gradient(180deg, #fbbf24 0%, #f59e0b 100%);
  }

  .main-btn:hover {
    transform: translateY(-1px);
  }

  .tip {
    margin: 18px 0 0;
    color: #7b6756;
    font-size: 14px;
    line-height: 1.85;
  }

  @media (max-width: 980px) {
    .content {
      width: calc(100% - 32px);
      grid-template-columns: 1fr;
      gap: 24px;
      padding: 84px 0 28px;
    }

    .action-panel {
      padding: 18px;
    }

    h1 {
      -webkit-text-stroke: 4px #5c4736;
    }

    .splash {
      position: static;
      transform: rotate(-8deg);
      margin-top: 10px;
      display: inline-block;
    }

    .main-btn {
      min-height: 68px;
      font-size: 20px;
    }
  }

  @media (max-width: 560px) {
    .icon-exit {
      top: 14px;
      left: 14px;
    }

    .icon-shell {
      width: 46px;
      height: 46px;
      border-radius: 14px;
    }

    .content {
      width: calc(100% - 20px);
      padding: 72px 0 18px;
      gap: 16px;
    }

    .subtitle {
      line-height: 1.65;
      font-size: 16px;
    }

    .main-btn {
      min-height: 58px;
      font-size: 18px;
    }

    .tip {
      font-size: 13px;
      line-height: 1.6;
    }
  }
</style>
