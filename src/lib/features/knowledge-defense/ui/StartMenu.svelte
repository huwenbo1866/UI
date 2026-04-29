<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { audioManager } from '../systems/audio-manager';

  const dispatch = createEventDispatcher<{
    start: void;
    settings: void;
    notebook: void;
    help: void;
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
    <div class="hero-stage">
      <div class="hero-sheet">
        <h1 class="hero-title" aria-label="Knowledge Defence / 知识闯关">
          <span class="hero-title-en">Knowledge Defence</span>
          <span class="hero-title-slash" aria-hidden="true">/</span>
          <span class="hero-title-zh">知识闯关</span>
        </h1>
      </div>
    </div>

    <div class="action-panel">
      <button type="button" class="main-btn primary" on:click={() => { audioManager.playClick(); dispatch('start');}}>开始闯关</button>
      <button type="button" class="main-btn" on:click={() => { audioManager.playClick(); dispatch('settings');}}>设置</button>
      <button type="button" class="main-btn" on:click={() => {audioManager.playClick(); dispatch('notebook');}}>错题集</button>
      <button type="button" class="main-btn secondary-btn" on:click={() => {audioManager.playClick(); dispatch('help');}}>帮助 / 图例</button>
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
    grid-template-columns: minmax(0, 1fr) minmax(360px, 520px);
    align-items: center;
    gap: 40px;
    padding: 88px 0 48px;
    box-sizing: border-box;
  }

  .hero-stage {
    position: relative;
    min-height: 520px;
    display: flex;
    align-items: center;
    justify-content: flex-start;
  }

  .hero-sheet {
    position: relative;
    width: min(100%, 760px);
    padding: 56px 60px 48px 56px;
    border-radius: 42px;
    background:
      linear-gradient(145deg, rgba(255, 253, 248, 0.94), rgba(255, 247, 237, 0.72)),
      rgba(255, 251, 246, 0.82);
    border: 1px solid rgba(219, 196, 171, 0.82);
    box-shadow:
      0 30px 60px rgba(88, 64, 42, 0.1),
      inset 0 1px 0 rgba(255, 255, 255, 0.72);
    backdrop-filter: blur(7px);
    overflow: hidden;
  }

  .hero-sheet::before {
    content: '';
    position: absolute;
    inset: 18px 18px auto auto;
    width: 148px;
    height: 148px;
    border-radius: 999px;
    background: radial-gradient(circle, rgba(251, 191, 36, 0.26), rgba(251, 191, 36, 0));
    pointer-events: none;
  }

  .hero-sheet::after {
    content: '';
    position: absolute;
    left: 56px;
    right: 56px;
    bottom: 28px;
    height: 1px;
    background: linear-gradient(90deg, rgba(201, 154, 79, 0), rgba(201, 154, 79, 0.68), rgba(201, 154, 79, 0));
    pointer-events: none;
  }

  .hero-title {
    position: relative;
    z-index: 1;
    margin: 0;
    display: grid;
    gap: 10px;
  }

  .hero-title-en,
  .hero-title-slash,
  .hero-title-zh {
    display: block;
  }

  .hero-title-en {
    max-width: 8ch;
    font-size: clamp(56px, 8vw, 112px);
    line-height: 0.9;
    letter-spacing: -0.06em;
    font-weight: 900;
    color: #4f3a2a;
    text-shadow: 0 12px 28px rgba(118, 85, 54, 0.12);
  }

  .hero-title-slash {
    font-size: clamp(28px, 3.2vw, 44px);
    line-height: 1;
    color: #c78a33;
    font-weight: 500;
    transform: translateX(4px);
  }

  .hero-title-zh {
    font-size: clamp(34px, 4.5vw, 58px);
    line-height: 1.04;
    letter-spacing: 0.18em;
    font-weight: 800;
    color: #8b5b24;
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

  .main-btn.secondary-btn {
    min-height: 62px;
    font-size: 18px;
    background: rgba(255, 248, 239, 0.98);
  }

  .main-btn:hover {
    transform: translateY(-1px);
  }

	@media (max-width: 980px) {
    .content {
      width: calc(100% - 32px);
      grid-template-columns: 1fr;
      gap: 24px;
      padding: 84px 0 28px;
    }

    .hero-stage {
      min-height: 0;
      justify-content: center;
    }

    .hero-sheet {
      width: min(100%, 720px);
      padding: 42px 34px 36px;
    }

    .hero-sheet::after {
      left: 34px;
      right: 34px;
      bottom: 22px;
    }

    .hero-title {
      text-align: center;
      justify-items: center;
    }

    .hero-title-en {
      max-width: none;
    }

    .hero-title-slash {
      transform: none;
    }

    .action-panel {
      padding: 18px;
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

    .hero-sheet {
      padding: 34px 20px 30px;
      border-radius: 28px;
    }

    .hero-sheet::before {
      width: 108px;
      height: 108px;
      inset: 12px 12px auto auto;
    }

    .hero-sheet::after {
      left: 20px;
      right: 20px;
      bottom: 18px;
    }

    .hero-title {
      gap: 8px;
    }

    .hero-title-en {
      font-size: clamp(44px, 14vw, 64px);
    }

    .hero-title-slash {
      font-size: 24px;
    }

    .hero-title-zh {
      font-size: clamp(26px, 8vw, 34px);
      letter-spacing: 0.12em;
    }

    .main-btn {
      min-height: 58px;
      font-size: 18px;
    }

	}
</style>
