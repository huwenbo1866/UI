<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { get } from 'svelte/store';
  import { PLAYFIELD_MIN_HEIGHT } from '../config/constants';
  import type { QuestionPack, RewardChoice, WrongNotebookStats } from '../core/types';
  import { samplePack } from '../data/sample-pack';
  import { createInitialGameState } from '../state/game-store';
  import { audioManager } from '../systems/audio-manager';
  import {
    createInputState,
    attachKeyboard,
    updateTouchDirectionFromClientPoint,
    clearTouchDirection
  } from '../adapters/input-adapter';
  import {
    wrongNotebookStore,
    loadWrongNotebook,
    buildWrongNotebookStats,
    recordWrongNotebookEntry,
    markWrongNotebookCorrect,
    clearWrongNotebook
  } from '../adapters/wrong-question-adapter';
  import { updatePlayer } from '../systems/player-system';
  import { maybeSpawnMonster, updateMonsters } from '../systems/monster-system';
  import { tickAutoAttack, tickAttackSequences } from '../systems/auto-attack-system';
  import { updateProjectiles } from '../systems/projectile-system';
  import { applyRewardByKind } from '../systems/progression-system';
  import { addDrone, updateDrones } from '../systems/drone-system';
  import { openRewardPanel, closeRewardPanel } from '../systems/reward-system';
  import GameCanvas from './GameCanvas.svelte';
  import HudOverlay from './HudOverlay.svelte';
  import RewardPanel from './RewardPanel.svelte';
  import PrepPanel from './PrepPanel.svelte';
  import SettingsPanel from './SettingsPanel.svelte';
  import StartMenu from './StartMenu.svelte';
  import ExitConfirmPanel from './ExitConfirmPanel.svelte';

  export let pack: QuestionPack = samplePack;

  let hostEl: HTMLDivElement;
  let frameHandle = 0;
  let lastFrameTs = 0;
  let teardownKeyboard = () => {};
  let detachGlobalHandler = () => {};

  let state = createInitialGameState(pack, 1200, 820);
  let wrongNotebook = get(wrongNotebookStore);
  let rewardPanelOpenedFromPending = false;
  let showExitConfirm = false;

  // 非阻塞的错题分析统计（默认本地回退值，AI 只在打开面板时才异步执行）
  let wrongNotebookStats: WrongNotebookStats = {
    total: 0,
    repeated: 0,
    typeEntries: [],
    advice: ['加载中...']
  };

  const input = createInputState();

  const unsubscribeWrongNotebook = wrongNotebookStore.subscribe((items) => {
    wrongNotebook = items;
  });

  function resizeArena() {
    if (!hostEl) return;
    const rect = hostEl.getBoundingClientRect();
    const nextWidth = rect.width || 1200;
    const nextHeight = Math.max(PLAYFIELD_MIN_HEIGHT, rect.height || 820);
    state.width = nextWidth;
    state.height = nextHeight;
    state.player.x = Math.min(Math.max(state.player.x, state.player.radius), state.width - state.player.radius);
    state.player.y = Math.min(Math.max(state.player.y, state.player.radius), state.height - state.player.radius);
    state = { ...state };
  }

  function closeTransientPanels() {
    state.ui.showSettingsPanel = false;
    state.ui.showPrepPanel = false;
    if (state.ui.showRewardPanel) {
      closeRewardPanelKeepingPending();
    }
  }

  function resetRun(keepStartMenu = true) {
    const attackPreference = state.settings.attackPreference;
    state = createInitialGameState(pack, state.width, state.height, attackPreference);
    state.ui.showStartMenu = keepStartMenu;
    state.runtime.running = !keepStartMenu;
    rewardPanelOpenedFromPending = false;
    showExitConfirm = false;
  }

  $: {
    const isInPanel = state.ui.showRewardPanel || showExitConfirm;
    if (!isInPanel) {
      audioManager.playBGM();        // StartMenu 或战斗区 → 播放
    } else {
      audioManager.pauseBGM();       // RewardPanel 或 ExitConfirmPanel → 暂停
    }
  }

  function startRun() {
    resetRun(false);
    state.ui.showStartMenu = false;
    state.runtime.running = true;
    state = { ...state };
    requestAnimationFrame(() => resizeArena());
  }

  function exitToStartMenu() {
    state.runtime.running = false;
    state.ui.showRewardPanel = false;
    state.ui.showSettingsPanel = false;
    state.ui.showPrepPanel = false;
    state.ui.showStartMenu = true;
    closeRewardPanel(state);
    rewardPanelOpenedFromPending = false;
    showExitConfirm = false;
    clearTouchDirection(input);
    state = { ...state };
  }

  async function exitToAppHome() {
    showExitConfirm = false;
    closeTransientPanels();
    await goto('/');
  }

  function openSettings() {
    if (showExitConfirm) return;
    state.ui.showSettingsPanel = true;
    state.ui.showPrepPanel = false;
    state = { ...state };
  }

  function closeSettings() {
    state.ui.showSettingsPanel = false;
    state = { ...state };
  }

  // ========== 非阻塞核心：只有真正打开错题集时才异步调用 AI ==========
  async function openPrepPanel() {
    if (showExitConfirm) return;
    state.ui.showPrepPanel = true;
    state.ui.showSettingsPanel = false;
    state = { ...state };

    // 异步 + 完全错误隔离，绝不阻塞任何面板
    try {
      const stats = await buildWrongNotebookStats(wrongNotebook);
      wrongNotebookStats = stats;
    } catch (err) {
      console.warn('AI 分析失败，已自动回退本地逻辑', err);
      wrongNotebookStats = {
        total: wrongNotebook.length,
        repeated: wrongNotebook.filter(i => i.wrong_count >= 2).length,
        typeEntries: [],
        advice: ['AI 分析暂时不可用，使用本地统计']
      };
    }
  }

  function closePrepPanel() {
    state.ui.showPrepPanel = false;
    state = { ...state };
  }

  async function clearPrepPanel() {
    await clearWrongNotebook(pack.id).catch(() => undefined);
  }

  function changeAttackPreference(value: 'straight' | 'scatter') {
    state.settings.attackPreference = value;
    state.buffs.queuedWeaponBuff = null;
    state.buffs.queuedWeaponBuffUses = 0;
    state = { ...state };
  }

  function tryOpenRewardPanel() {
    if (showExitConfirm || state.progress.pendingLevelUps <= 0 || state.ui.showRewardPanel) return;
    state.progress.pendingLevelUps -= 1;
    openRewardPanel(state);
    rewardPanelOpenedFromPending = true;
    audioManager.pauseBGM();
    state = { ...state };
  }

  function closeRewardPanelKeepingPending() {
    if (rewardPanelOpenedFromPending) {
      state.progress.pendingLevelUps += 1;
      rewardPanelOpenedFromPending = false;
    }
    closeRewardPanel(state);
    audioManager.playBGM();
    state = { ...state };
  }

  function handlePlayerActivate() {
    if (showExitConfirm || state.ui.showStartMenu || state.ui.showSettingsPanel || state.ui.showPrepPanel) return;
    if (state.progress.pendingLevelUps > 0) {
      tryOpenRewardPanel();
    }
  }

  function openExitConfirm() {
    if (state.ui.showStartMenu || showExitConfirm || state.player.hp <= 0) return;
    showExitConfirm = true;
    audioManager.pauseBGM();
  }

  function closeExitConfirm() {
    showExitConfirm = false;
    audioManager.playBGM();
  }

  function handleSurfaceTouchStart(event: TouchEvent) {
    if (!hostEl || showExitConfirm || state.ui.showStartMenu || state.ui.showSettingsPanel || state.ui.showPrepPanel || state.ui.showRewardPanel) return;
    const touch = event.touches[0];
    if (!touch) return;
    updateTouchDirectionFromClientPoint(
      input,
      hostEl.getBoundingClientRect(),
      state.player.x,
      state.player.y,
      touch.clientX,
      touch.clientY
    );
  }

  function handleSurfaceTouchMove(event: TouchEvent) {
    if (!hostEl || showExitConfirm || state.ui.showStartMenu || state.ui.showSettingsPanel || state.ui.showPrepPanel || state.ui.showRewardPanel) return;
    const touch = event.touches[0];
    if (!touch) return;
    updateTouchDirectionFromClientPoint(
      input,
      hostEl.getBoundingClientRect(),
      state.player.x,
      state.player.y,
      touch.clientX,
      touch.clientY
    );
  }

  function handleSurfaceTouchEnd() {
    clearTouchDirection(input);
  }

  async function handleRewardAnswer(event: CustomEvent<{ choice: RewardChoice; selected: string }>) {
    const { choice, selected } = event.detail;
    const isCorrect = selected === choice.question.answer;

    if (isCorrect) {
      state.battle.correct += 1;
      state.ui.rewardFeedback = `答对了：${choice.question.explanation}`;
      state.ui.rewardFeedbackKind = 'success';
      await markWrongNotebookCorrect(pack.id, choice.question.id).catch(() => undefined);

      if (choice.rewardKind === 'drone') {
        addDrone(state);
      }
      applyRewardByKind(state, choice.rewardKind);
      rewardPanelOpenedFromPending = false;
    } else {
      state.battle.wrong += 1;
      state.ui.rewardFeedback = `答错了。正确答案：${choice.question.answer}`;
      state.ui.rewardFeedbackKind = 'error';
      await recordWrongNotebookEntry(pack.id, choice.question, selected).catch(() => undefined);
      closeRewardPanel(state);
      rewardPanelOpenedFromPending = false;
    }

    state = { ...state };
  }

  function gameLoop(ts: number) {
    if (!lastFrameTs) lastFrameTs = ts;
    const rawDtMs = Math.min(40, ts - lastFrameTs);
    lastFrameTs = ts;

    const shouldSimulate =
      state.runtime.running &&
      state.player.hp > 0 &&
      !showExitConfirm &&
      !state.ui.showStartMenu &&
      !state.ui.showSettingsPanel &&
      !state.ui.showPrepPanel &&
      !state.ui.showRewardPanel;

    if (shouldSimulate) {
      const dtMs = rawDtMs * state.runtime.timeScale;
      const dtSeconds = dtMs / 1000;

      maybeSpawnMonster(state, dtMs);
      updatePlayer(state, input, dtSeconds, dtMs);
      updateMonsters(state, dtSeconds);
      tickAutoAttack(state, dtMs);
      tickAttackSequences(state, dtMs);
      updateProjectiles(state, dtSeconds);
      updateDrones(state, dtSeconds, dtMs);
      state = { ...state };
    }

    frameHandle = requestAnimationFrame(gameLoop);
  }

  onMount(() => {
    teardownKeyboard = attachKeyboard(input);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        event.preventDefault();
        handlePlayerActivate();
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();

        if (showExitConfirm) {
          closeExitConfirm();
          return;
        }

        if (state.ui.showSettingsPanel) {
          closeSettings();
          return;
        }

        if (state.ui.showPrepPanel) {
          closePrepPanel();
          return;
        }

        if (state.ui.showRewardPanel) {
          closeRewardPanelKeepingPending();
          return;
        }

        if (state.ui.showStartMenu) {
          void exitToAppHome();
          return;
        }

        openExitConfirm();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    detachGlobalHandler = () => window.removeEventListener('keydown', onKeyDown);

    void loadWrongNotebook(pack.id).catch(() => undefined);
    resizeArena();
    const onResize = () => resizeArena();
    window.addEventListener('resize', onResize);
    frameHandle = requestAnimationFrame(gameLoop);

    return () => {
      window.removeEventListener('resize', onResize);
    };
  });

  onDestroy(() => {
    teardownKeyboard();
    detachGlobalHandler();
    unsubscribeWrongNotebook();
    if (frameHandle) cancelAnimationFrame(frameHandle);
  });
</script>

<div class="page-shell">
  {#if state.ui.showStartMenu}
    <div class="start-shell">
      <StartMenu
        attackPreference={state.settings.attackPreference}
        wrongCount={wrongNotebook.length}
        on:start={startRun}
        on:settings={openSettings}
        on:notebook={openPrepPanel}
        on:exitHome={exitToAppHome}
      />
    </div>
  {:else}
    <div class="arena-shell" bind:this={hostEl}>
      <GameCanvas
        width={state.width}
        height={state.height}
        player={state.player}
        progress={state.progress}
        monsters={state.monsters}
        projectiles={state.projectiles}
        drones={state.drones}
        lasers={state.lasers}
        pendingLevelUps={state.progress.pendingLevelUps}
        onTouchStartPoint={handleSurfaceTouchStart}
        onTouchMovePoint={handleSurfaceTouchMove}
        onTouchEndPoint={handleSurfaceTouchEnd}
        onPlayerActivate={handlePlayerActivate}
      />

      <HudOverlay on:exit={openExitConfirm} />

      {#if state.ui.showRewardPanel}
        <RewardPanel
          choices={state.ui.rewardChoices}
          feedback={state.ui.rewardFeedback}
          feedbackKind={state.ui.rewardFeedbackKind}
          on:answer={handleRewardAnswer}
          on:close={closeRewardPanelKeepingPending}
        />
      {/if}

      {#if state.player.hp <= 0}
        <div class="game-over">
          <div class="game-over-card">
            <h2>本局结束</h2>
            <p>你被怪物突破防线了。保留下来的错题已经进入错题集，可以先复盘再开一局。</p>
            <div class="stats-grid">
              <div><span>等级</span><strong>Lv.{state.progress.level}</strong></div>
              <div><span>击杀</span><strong>{state.battle.kills}</strong></div>
              <div><span>答对</span><strong>{state.battle.correct}</strong></div>
              <div><span>答错</span><strong>{state.battle.wrong}</strong></div>
            </div>
            <div class="actions">
              <button type="button" on:click={startRun}>重新开始</button>
              <button type="button" class="secondary" on:click={exitToStartMenu}>返回启动页</button>
            </div>
          </div>
        </div>
      {/if}
    </div>
  {/if}

  <PrepPanel
    visible={state.ui.showPrepPanel}
    items={wrongNotebook}
    stats={wrongNotebookStats}
    onClose={closePrepPanel}
    onClear={clearPrepPanel}
  />

  <SettingsPanel
    visible={state.ui.showSettingsPanel}
    attackPreference={state.settings.attackPreference}
    on:close={closeSettings}
    on:changePreference={(event) => changeAttackPreference(event.detail.value)}
  />

  <ExitConfirmPanel
    visible={showExitConfirm}
    title="确认退出本局？"
    description="退出后将返回启动页，本局战斗会暂停并中断。你可以稍后从启动页重新开始。"
    confirmText="确定"
    cancelText="继续游戏"
    on:confirm={exitToStartMenu}
    on:cancel={closeExitConfirm}
  />
</div>

<style>
  .page-shell {
    position: relative;
    width: 100%;
    min-height: 100vh;
    box-sizing: border-box;
    background: linear-gradient(180deg, #faf7f3 0%, #f4eee7 100%);
    overflow: hidden;
  }

  .start-shell {
    min-height: 100vh;
  }

  .arena-shell {
    position: relative;
    width: min(100%, 1600px);
    min-height: 100vh;
    margin: 0 auto;
    padding: 16px;
    box-sizing: border-box;
  }

  .game-over {
    position: absolute;
    inset: 16px;
    display: grid;
    place-items: center;
    background: rgba(39, 28, 19, 0.38);
    backdrop-filter: blur(4px);
    z-index: 170;
    border-radius: 28px;
  }

  .game-over-card {
    width: min(560px, calc(100vw - 40px));
    background: #fffaf4;
    border: 1px solid #e6d7c7;
    border-radius: 28px;
    padding: 24px;
    box-shadow: 0 24px 60px rgba(54, 41, 30, 0.18);
  }

  .game-over-card h2 {
    margin: 0 0 10px;
    font-size: 30px;
    color: #5b4837;
  }

  .game-over-card p {
    margin: 0;
    color: #7b6756;
    line-height: 1.7;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    margin-top: 18px;
  }

  .stats-grid > div {
    border-radius: 18px;
    padding: 14px;
    background: #fffdf9;
    border: 1px solid #ecdccb;
  }

  .stats-grid span {
    display: block;
    color: #8b7767;
    font-size: 12px;
    margin-bottom: 6px;
  }

  .stats-grid strong {
    font-size: 24px;
    color: #4e3c2e;
  }

  .actions {
    margin-top: 18px;
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
  }

  .actions button {
    border: 1px solid #b69b7c;
    background: #fff4e6;
    color: #5a4736;
    border-radius: 16px;
    padding: 12px 16px;
    font-weight: 700;
    cursor: pointer;
  }

  .actions .secondary {
    background: #fff;
  }

  @media (max-width: 900px) {
    .arena-shell {
      padding: 10px;
    }

    .game-over {
      inset: 10px;
    }
  }
</style>