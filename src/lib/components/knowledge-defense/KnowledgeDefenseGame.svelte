<script lang="ts">
  import { createEventDispatcher, onDestroy, onMount } from 'svelte';
import { goto } from '$app/navigation';
import { user } from '$lib/stores';
import {
  wrongQuestions,
  wrongQuestionsLoading,
  refreshWrongQuestions,
  recordWrongQuestionEntry
} from '$lib/stores/knowledge-defense';
import type { WrongQuestionSourceType } from '$lib/apis/knowledge-defense';
  import type { Difficulty, FinishStats, Monster, Projectile, Question, QuestionPack } from './types';
  import { samplePack } from './samplePack';

  export let pack: QuestionPack = samplePack;
  export let autoStart = false;
  export let maxAlive = 5;
  export let playerSprite = '/knowledge-defense/player.png';
  export let monsterSprites: Record<Difficulty, string> = {
    easy: '/knowledge-defense/monster-easy.png',
    medium: '/knowledge-defense/monster-medium.png',
    hard: '/knowledge-defense/monster-hard.png'
  };

  export let sourceType: WrongQuestionSourceType = 'pack';
  export let sourceId: string | null = null;
  export let fileId: string | null = null;
  export let chapter: string | null = null;


  const dispatch = createEventDispatcher<{ finish: FinishStats }>();

  const PLAYER_MAX_HP = 300;
  const BASE_SPEED: Record<Difficulty, number> = { easy: 24, medium: 31, hard: 38 };
  const TOTAL_MONSTERS = 20;
  const ANSWER_MOVE_RATIO: Record<Difficulty, number> = { easy: 2 / 3, medium: 3 / 4, hard: 4 / 5 };
  const MONSTER_HP: Record<Difficulty, number> = { easy: 100, medium: 100, hard: 200 };
  const MONSTER_RADIUS: Record<Difficulty, number> = { easy: 26, medium: 30, hard: 34 };
  const BURST_DAMAGE = [30, 30, 40];
  const BURST_OFFSETS = [-0.24, 0, 0.24];

  let wrapEl: HTMLDivElement;
  let canvasEl: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D | null = null;
  let width = 960;
  let height = 680;
  let raf = 0;
  let lastTs = 0;

  let running = false;
  let paused = false;
  let gameOver = false;
  let victory = false;
  let showStartScreen = true;
  let showPrepModal = false;

  let playerHp = PLAYER_MAX_HP;
  const playerRadius = 36;
  const player = { x: width / 2, y: height / 2 };
  let burstPhase = 0;

  let kills = 0;
  let correct = 0;
  let wrong = 0;
  let wrongNotebookLoadKey = '';

  let activeMonsters: Monster[] = [];
  let pendingMonsters: Monster[] = [];
  let projectiles: Projectile[] = [];

  let selectedMonsterId: string | null = null;
  let modalOpen = false;
  let modalQuestion: Question | null = null;
  let selectedMonsterLabel = '';

  let toast = '点击怪物答题，答对后会发射 3 枚“。”散射弹。';
  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  let flashUntil = 0;
  let damagePopups: { id: string; x: number; y: number; text: string; color: string; life: number }[] = [];
  let pendingShotTimers: ReturnType<typeof setTimeout>[] = [];

  let playerImage: HTMLImageElement | null = null;
  let monsterImages: Record<Difficulty, HTMLImageElement | null> = {
    easy: null,
    medium: null,
    hard: null
  };

  function preloadImages() {
    playerImage = new Image();
    playerImage.src = playerSprite;
    monsterImages = {
      easy: new Image(),
      medium: new Image(),
      hard: new Image()
    };
    monsterImages.easy!.src = monsterSprites.easy;
    monsterImages.medium!.src = monsterSprites.medium;
    monsterImages.hard!.src = monsterSprites.hard;
  }

  function resizeCanvas() {
    if (!wrapEl || !canvasEl || !ctx) return;
    const rect = wrapEl.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    width = rect.width;
    height = Math.max(640, rect.height);
    canvasEl.width = rect.width * dpr;
    canvasEl.height = height * dpr;
    canvasEl.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    player.x = width / 2;
    player.y = height / 2;
  }

  function uid(prefix = 'id') {
    return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
  }

  function clamp(v: number, min: number, max: number) {
    return Math.max(min, Math.min(max, v));
  }

  function distance(ax: number, ay: number, bx: number, by: number) {
    return Math.hypot(ax - bx, ay - by);
  }

  function shuffle<T>(arr: T[]) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function groupedQuestions() {
    const groups: Record<Difficulty, Question[]> = { easy: [], medium: [], hard: [] };
    for (const q of pack.questions) groups[q.difficulty].push(q);
    return groups;
  }

  function showToast(message: string) {
    toast = message;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast = '点击怪物答题，答对后会发射 3 枚“。”散射弹。';
    }, 2600);
  }

  function resetInternalState({ keepStartScreen = false } = {}) {
    for (const timer of pendingShotTimers) clearTimeout(timer);
    pendingShotTimers = [];
    activeMonsters = [];
    pendingMonsters = [];
    projectiles = [];
    damagePopups = [];
    selectedMonsterId = null;
    modalOpen = false;
    modalQuestion = null;
    selectedMonsterLabel = '';
    running = false;
    paused = false;
    gameOver = false;
    victory = false;
    playerHp = PLAYER_MAX_HP;
    kills = 0;
    correct = 0;
    wrong = 0;
    burstPhase = 0;
    flashUntil = 0;
    lastTs = 0;
    showStartScreen = keepStartScreen;
    showPrepModal = false;
  }

  function returnToStartScreen() {
    resetInternalState({ keepStartScreen: true });
    refreshWrongQuestions({ source_type: sourceType, source_id: sourceId ?? pack.id }).catch(() => {});
    showToast('已返回启动页，可在备战区查看错题。');
  }

  function openPrepZone() {
    showPrepModal = true;
  }

  function closePrepZone() {
    showPrepModal = false;
  }

  function formatWrongTime(value: number) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString('zh-CN', { hour12: false });
  }

  async function goHome() {
    await goto('/');
  }

  async function handleGlobalExit() {
    if (showStartScreen) {
      await goHome();
      return;
    }
    if (gameOver || paused) {
      returnToStartScreen();
      return;
    }
    if (modalOpen) closeQuestion();
    paused = true;
    running = false;
    showToast('已暂停');
  }

  function createMonster(difficulty: Difficulty, seed: number): Monster {
    const side = Math.floor(Math.random() * 4);
    const padding = 48;
    let x = 0;
    let y = 0;
    if (side === 0) {
      x = Math.random() * width;
      y = -padding;
    } else if (side === 1) {
      x = width + padding;
      y = Math.random() * height;
    } else if (side === 2) {
      x = Math.random() * width;
      y = height + padding;
    } else {
      x = -padding;
      y = Math.random() * height;
    }
    return {
      id: uid('monster'),
      difficulty,
      x,
      y,
      radius: MONSTER_RADIUS[difficulty],
      hp: MONSTER_HP[difficulty],
      maxHp: MONSTER_HP[difficulty],
      speed: BASE_SPEED[difficulty] + seed * 1.5,
      sprite: monsterSprites[difficulty],
      usedQuestionIds: []
    };
  }

  function buildMonsterQueue() {
    const monsters: Monster[] = [];
    const difficulties: Difficulty[] = [
      'easy', 'easy', 'easy', 'easy', 'easy', 'easy', 'easy', 'easy',
      'medium', 'medium', 'medium', 'medium', 'medium', 'medium', 'medium',
      'hard', 'hard', 'hard', 'hard', 'hard'
    ];
    difficulties.slice(0, TOTAL_MONSTERS).forEach((difficulty, index) => {
      monsters.push(createMonster(difficulty, index));
    });
    return shuffle(monsters);
  }

  function spawnUntilCap() {
    while (running && !gameOver && activeMonsters.length < maxAlive && pendingMonsters.length > 0) {
      const next = pendingMonsters.shift();
      if (next) activeMonsters = [...activeMonsters, next];
    }
    pendingMonsters = [...pendingMonsters];
  }

  function startGame() {
    resetInternalState();
    pendingMonsters = buildMonsterQueue();
    running = true;
    paused = false;
    showStartScreen = false;
    showPrepModal = false;
    showToast('战斗开始！点击怪物答题，答对后会发射 3 枚“。”散射弹。');
    spawnUntilCap();
  }

  function togglePause() {
    if (gameOver || showStartScreen || modalOpen) return;
    paused = !paused;
    running = !paused;
    showToast(paused ? '已暂停' : '继续战斗');
  }

  function getMonsterLabel(monster: Monster) {
    if (monster.difficulty === 'easy') return '简单怪';
    if (monster.difficulty === 'medium') return '中等怪';
    return '困难怪';
  }

  function questionsForDifficulty(difficulty: Difficulty) {
    return groupedQuestions()[difficulty];
  }

  function getNextQuestion(monster: Monster): Question {
    const all = questionsForDifficulty(monster.difficulty);
    let candidates = all.filter((q) => !monster.usedQuestionIds.includes(q.id));
    if (candidates.length === 0) {
      monster.usedQuestionIds = [];
      candidates = all;
    }
    const next = candidates[Math.floor(Math.random() * candidates.length)] ?? all[0];
    monster.usedQuestionIds = [...monster.usedQuestionIds, next.id];
    monster.activeQuestionId = next.id;
    return next;
  }

  function openQuestion(monster: Monster) {
    if (!running || gameOver || paused) return;
    selectedMonsterId = monster.id;
    modalQuestion = getNextQuestion(monster);
    selectedMonsterLabel = `${getMonsterLabel(monster)} · ${monster.hp}/${monster.maxHp} HP`;
    modalOpen = true;
  }

  function closeQuestion() {
    modalOpen = false;
    modalQuestion = null;
    selectedMonsterId = null;
    selectedMonsterLabel = '';
  }

  function spawnDamagePopup(x: number, y: number, text: string, color: string) {
    damagePopups = [...damagePopups, { id: uid('popup'), x, y, text, color, life: 0.8 }];
  }

  function punishPlayer(amount: number, reason: string) {
    playerHp = clamp(playerHp - amount, 0, PLAYER_MAX_HP);
    flashUntil = performance.now() + 260;
    spawnDamagePopup(player.x, player.y - 18, `-${amount}`, '#ff6b6b');
    showToast(reason);
    if (playerHp <= 0) finishGame(false);
  }

  function healPlayer(amount: number) {
    if (playerHp <= 0) return;
    const nextHp = clamp(playerHp + amount, 0, PLAYER_MAX_HP);
    const delta = nextHp - playerHp;
    playerHp = nextHp;
    if (delta > 0) {
      spawnDamagePopup(player.x, player.y - 42, `+${delta}`, '#7ee787');
      showToast(`净化成功，玩家恢复 ${delta} HP`);
    }
  }

  async function recordWrongQuestion(question: Question, selectedAnswer: string) {
    try {
      await recordWrongQuestionEntry({
        source_type: sourceType,
        source_id: sourceId ?? pack.id,
        file_id: fileId,
        chapter,
        question_id: question.id,
        question: question.prompt,
        options: question.options,
        correct_answer: question.answer,
        explanation: question.explanation,
        last_user_answer: selectedAnswer
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '错题保存失败';
      showToast(message);
    }
  }

  function finishGame(win: boolean) {
    if (gameOver) return;
    running = false;
    paused = false;
    gameOver = true;
    victory = win;
    closeQuestion();
    dispatch('finish', {
      result: win ? 'win' : 'lose',
      kills,
      correct,
      wrong,
      remainingHp: playerHp
    });
    showToast(win ? '闯关成功！' : '守卫失败，生命归零。');
  }

  function removeMonster(monsterId: string) {
    const target = activeMonsters.find((m) => m.id === monsterId);
    activeMonsters = activeMonsters.filter((m) => m.id !== monsterId);
    if (target) {
      kills += 1;
      spawnDamagePopup(target.x, target.y - 10, '净化!', '#66cdaa');
      healPlayer(10);
    }
    if (selectedMonsterId === monsterId) closeQuestion();
    spawnUntilCap();
    if (pendingMonsters.length === 0 && activeMonsters.length === 0) finishGame(true);
  }

  function fireBurst(monster: Monster) {
    const baseAngle = Math.atan2(monster.y - player.y, monster.x - player.x) + burstPhase;
    burstPhase += 0.12;
    BURST_DAMAGE.forEach((damage, index) => {
      const timer = setTimeout(() => {
        const angle = baseAngle + BURST_OFFSETS[index];
        const speed = 390;
        projectiles = [
          ...projectiles,
          {
            id: uid('dot'),
            x: player.x,
            y: player.y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            radius: 10,
            damage,
            lifeMs: 1600,
            hitMonsterIds: []
          }
        ];
      }, index * 120);
      pendingShotTimers.push(timer);
    });
  }

  async function submitAnswer(answer: string) {
    if (!modalQuestion || !selectedMonsterId) return;
    const monster = activeMonsters.find((m) => m.id === selectedMonsterId);
    if (!monster) {
      closeQuestion();
      return;
    }
    if (answer === modalQuestion.answer) {
      correct += 1;
      showToast('回答正确！已发射 3 枚“。”散射弹。');
      fireBurst(monster);
    } else {
      wrong += 1;
      await recordWrongQuestion(modalQuestion, answer);
      punishPlayer(20, `回答错误：${modalQuestion.answer}。玩家 -20 HP`);
    }
    closeQuestion();
  }

  function updateProjectiles(dt: number) {
    const next: Projectile[] = [];
    for (const dot of projectiles) {
      dot.x += dot.vx * dt;
      dot.y += dot.vy * dt;
      dot.lifeMs -= dt * 1000;
      if (dot.lifeMs <= 0) continue;
      if (dot.x < -50 || dot.x > width + 50 || dot.y < -50 || dot.y > height + 50) continue;

      for (const monster of activeMonsters) {
        if (monster.isDead) continue;
        if (dot.hitMonsterIds.includes(monster.id)) continue;
        const dist = distance(dot.x, dot.y, monster.x, monster.y);
        if (dist <= dot.radius + monster.radius) {
          monster.hp = clamp(monster.hp - dot.damage, 0, monster.maxHp);
          dot.hitMonsterIds = [...dot.hitMonsterIds, monster.id];
          spawnDamagePopup(monster.x, monster.y - 8, `-${dot.damage}`, '#ffd166');
          if (monster.hp <= 0) {
            monster.isDead = true;
            removeMonster(monster.id);
          }
        }
      }

      next.push(dot);
    }
    projectiles = next;
  }

  function updateDamagePopups(dt: number) {
    damagePopups = damagePopups
      .map((item) => ({ ...item, y: item.y - 26 * dt, life: item.life - dt }))
      .filter((item) => item.life > 0);
  }

  function updateMonsters(dt: number) {
    const ratioMode = modalOpen ? ANSWER_MOVE_RATIO : { easy: 1, medium: 1, hard: 1 };
    const survivors: Monster[] = [];
    for (const monster of activeMonsters) {
      const dx = player.x - monster.x;
      const dy = player.y - monster.y;
      const dist = Math.max(1, Math.hypot(dx, dy));
      const ratio = ratioMode[monster.difficulty];
      monster.x += (dx / dist) * monster.speed * ratio * dt;
      monster.y += (dy / dist) * monster.speed * ratio * dt;

      if (dist <= playerRadius + monster.radius) {
        spawnDamagePopup(monster.x, monster.y - 8, '爆炸', '#ff8a65');
        if (selectedMonsterId === monster.id) closeQuestion();
        punishPlayer(30, `${getMonsterLabel(monster)}触碰玩家，玩家 -30 HP`);
        continue;
      }
      survivors.push(monster);
    }
    activeMonsters = survivors;
    spawnUntilCap();
    if (pendingMonsters.length === 0 && activeMonsters.length === 0 && running) finishGame(true);
  }

  function drawBackground() {
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#e6e0d5');
    gradient.addColorStop(1, '#b6b0a6');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    for (let i = 0; i < 28; i += 1) {
      const x = (i * 173) % (width + 140) - 60;
      const y = ((i * 127) % (height + 140)) - 70;
      ctx.beginPath();
      ctx.arc(x, y, 40 + (i % 4) * 10, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 5; i += 1) {
      ctx.beginPath();
      ctx.arc(player.x, player.y, 110 + i * 92, 0.2 * i, Math.PI * (1.22 + 0.06 * i));
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawHpBar(x: number, y: number, w: number, h: number, value: number, max: number, color: string, bg = 'rgba(0,0,0,.25)') {
    if (!ctx) return;
    ctx.save();
    ctx.fillStyle = bg;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, (value / max) * w, h);
    ctx.strokeStyle = 'rgba(255,255,255,.2)';
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
  }

  function drawPlayer() {
    if (!ctx) return;
    const flashing = performance.now() < flashUntil;
    ctx.save();
    ctx.shadowColor = flashing ? 'rgba(255, 99, 99, .55)' : 'rgba(255, 217, 131, .42)';
    ctx.shadowBlur = flashing ? 34 : 22;
    ctx.beginPath();
    ctx.arc(player.x, player.y, playerRadius + 20, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,.92)';
    ctx.fill();
    ctx.restore();

    if (playerImage && playerImage.complete && playerImage.naturalWidth > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(player.x, player.y, playerRadius + 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(playerImage, player.x - 48, player.y - 48, 96, 96);
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.arc(player.x, player.y, playerRadius, 0, Math.PI * 2);
      ctx.fillStyle = '#ffe0b2';
      ctx.fill();
    }

    drawHpBar(player.x - 56, player.y - playerRadius - 34, 112, 10, playerHp, PLAYER_MAX_HP, '#f05d5e', 'rgba(255,255,255,.26)');
  }

  function drawMonster(monster: Monster) {
    if (!ctx) return;
    const img = monsterImages[monster.difficulty];
    const size = monster.radius * 2.35;
    if (img && img.complete && img.naturalWidth > 0) {
      ctx.drawImage(img, monster.x - size / 2, monster.y - size / 2, size, size);
    } else {
      ctx.beginPath();
      ctx.fillStyle = monster.difficulty === 'easy' ? '#5b8cff' : monster.difficulty === 'medium' ? '#58b56c' : '#ef6a6a';
      ctx.arc(monster.x, monster.y, monster.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    if (selectedMonsterId === monster.id) {
      ctx.save();
      ctx.strokeStyle = '#f6d365';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(monster.x, monster.y, monster.radius + 9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    drawHpBar(
      monster.x - 34,
      monster.y - monster.radius - 18,
      68,
      7,
      monster.hp,
      monster.maxHp,
      monster.difficulty === 'hard' ? '#ff7b7b' : '#67c587'
    );
  }

  function drawProjectiles() {
    if (!ctx) return;
    ctx.save();
    ctx.font = '28px Microsoft YaHei, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const dot of projectiles) {
      ctx.fillStyle = '#151515';
      ctx.fillText('。', dot.x, dot.y);
    }
    ctx.restore();
  }

  function drawDamagePopups() {
    if (!ctx) return;
    ctx.save();
    ctx.font = 'bold 18px Microsoft YaHei, sans-serif';
    ctx.textAlign = 'center';
    for (const popup of damagePopups) {
      ctx.globalAlpha = clamp(popup.life / 0.8, 0, 1);
      ctx.fillStyle = popup.color;
      ctx.fillText(popup.text, popup.x, popup.y);
    }
    ctx.restore();
  }

  function drawScene() {
    drawBackground();
    drawPlayer();
    for (const monster of activeMonsters) drawMonster(monster);
    drawProjectiles();
    drawDamagePopups();
  }

  function loop(ts: number) {
    if (!ctx) return;
    if (!lastTs) lastTs = ts;
    const dt = Math.min((ts - lastTs) / 1000, 0.04);
    lastTs = ts;

    if (running && !gameOver && !paused) {
      updateMonsters(dt);
      updateProjectiles(dt);
      updateDamagePopups(dt);
    } else {
      updateDamagePopups(dt);
    }
    drawScene();
    raf = requestAnimationFrame(loop);
  }

  function onCanvasClick(event: MouseEvent) {
    if (!running || gameOver || paused) return;
    const rect = canvasEl.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    for (let i = activeMonsters.length - 1; i >= 0; i -= 1) {
      const monster = activeMonsters[i];
      if (distance(x, y, monster.x, monster.y) <= monster.radius + 8) {
        openQuestion(monster);
        return;
      }
    }
  }

  $: {
    const nextKey = `${sourceType}:${sourceId ?? pack.id}:${$user?.id ?? 'anonymous'}`;
    if (typeof window !== 'undefined' && nextKey !== wrongNotebookLoadKey) {
      wrongNotebookLoadKey = nextKey;
      refreshWrongQuestions({ source_type: sourceType, source_id: sourceId ?? pack.id }).catch(() => {});
    }
  }

  onMount(() => {
    ctx = canvasEl.getContext('2d');
    preloadImages();
    resizeCanvas();
    const onResize = () => resizeCanvas();
    window.addEventListener('resize', onResize);
    raf = requestAnimationFrame(loop);
    const loadKey = `${sourceType}:${sourceId ?? pack.id}:${$user?.id ?? 'anonymous'}`;
    wrongNotebookLoadKey = loadKey;
    refreshWrongQuestions({ source_type: sourceType, source_id: sourceId ?? pack.id }).catch((error) => {
      const message = error instanceof Error ? error.message : '错题本加载失败';
      showToast(message);
    });
    if (autoStart) startGame();

    return () => {
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(raf);
      if (toastTimer) clearTimeout(toastTimer);
      for (const timer of pendingShotTimers) clearTimeout(timer);
    };
  });

  onDestroy(() => {
    cancelAnimationFrame(raf);
    if (toastTimer) clearTimeout(toastTimer);
    for (const timer of pendingShotTimers) clearTimeout(timer);
  });
</script>

<div class="kd-shell">
  <div class="kd-board" bind:this={wrapEl}>
    <canvas bind:this={canvasEl} on:click={onCanvasClick}></canvas>
    <button class="global-exit-btn" on:click={handleGlobalExit} aria-label="退出" title="退出">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h5" />
        <path d="M13 12H7" />
        <path d="M10 9l3 3-3 3" />
        <path d="M20 4v16" />
      </svg>
    </button>

    <div class="toast">{toast}</div>

    {#if showStartScreen}
      <div class="start-screen">
        <div class="start-hero">
          <div class="start-logo">知识闯关</div>
          <div class="start-subtitle">Knowledge Defense</div>
        </div>

        <div class="start-actions">
          <button class="start-btn primary" on:click={openPrepZone}>备战区{$wrongQuestions.length > 0 ? `（${$wrongQuestions.length}）` : ''}</button>
          <button class="start-btn primary" on:click={startGame}>开始闯关</button>
        </div>
      </div>
    {/if}

    {#if showPrepModal}
      <div class="prep-modal-mask">
        <div class="prep-modal-card">
          <div class="prep-header">
            <div>
              <h3>备战区 · 错题回看</h3>
              <p>这里只保留答错过的题，含正确答案与解析，方便你开局前快速复习。</p>
            </div>
            <span class="prep-count">{$wrongQuestions.length} 题</span>
          </div>

          {#if $wrongQuestionsLoading}
            <div class="prep-empty">正在读取错题本…</div>
          {:else if $wrongQuestions.length === 0}
            <div class="prep-empty">当前还没有错题，先开始一局，答错的题会自动收纳到这里。</div>
          {:else}
            <div class="prep-list">
              {#each $wrongQuestions as item}
                <article class="prep-card">
                  <div class="prep-card-top">
                    <span class="prep-tag">错题</span>
                    <span class="prep-times">错了 {item.wrong_count} 次</span>
                  </div>
                  <h4>{item.question}</h4>
                  <div class="prep-line"><strong>你当时选了：</strong>{item.last_user_answer}</div>
                  <div class="prep-line"><strong>正确答案：</strong>{item.correct_answer}</div>
                  <div class="prep-line"><strong>解析：</strong>{item.explanation}</div>
                  <div class="prep-line meta"><strong>最近答错：</strong>{formatWrongTime(item.last_wrong_at)}</div>
                </article>
              {/each}
            </div>
          {/if}

          <div class="result-actions">
            <button class="start-btn primary" on:click={closePrepZone}>关闭备战区</button>
          </div>
        </div>
      </div>
    {/if}

    {#if paused && !gameOver}
      <div class="pause-mask">
        <div class="pause-card">
          <div class="pause-title">已暂停</div>
          <div class="result-actions centered">
            <button class="start-btn primary" on:click={togglePause}>继续闯关</button>
            <button class="start-btn ghost" on:click={returnToStartScreen}>返回首页</button>
          </div>
        </div>
      </div>
    {/if}

    {#if gameOver}
      <div class="result-mask">
        <div class="result-card">
          <h2>{victory ? '闯关成功！' : '守卫失败'}</h2>
          <p>{victory ? '你已经清空了当前波次的全部怪物。' : '玩家生命值已归零。'}</p>
          <div class="result-actions">
            <button class="start-btn ghost" on:click={returnToStartScreen}>返回启动页</button>
            <button class="start-btn primary" on:click={startGame}>再来一局</button>
          </div>
        </div>
      </div>
    {/if}
  </div>

  {#if modalOpen && modalQuestion}
    <div class="modal-backdrop">
      <div class="modal-card">
        <div class="modal-meta">
          <span class="tag">{selectedMonsterLabel}</span>
          <span class="tag">答题时怪物持续移动</span>
          <span class="tag">无时间限制</span>
        </div>
        <h3>{modalQuestion.prompt}</h3>
        <div class="options">
          {#each modalQuestion.options as option}
            <button class="option" on:click={() => submitAnswer(option)}>{option}</button>
          {/each}
        </div>
        <div class="explain-tip">答对后会自动发射 3 枚“。”散射弹；答错立刻扣除 20 HP，并把这道题加入备战区。</div>
        <div class="modal-actions">
          <button class="start-btn ghost" on:click={closeQuestion}>先关闭题卡</button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  :global(body) {
    background: #e9e5dd;
  }

  .kd-shell {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 12px;
    color: #f2efe9;
  }

  .kd-board {
    position: relative;
    min-height: 680px;
    border-radius: 28px;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.12);
    box-shadow: 0 22px 46px rgba(39, 31, 26, 0.16);
    background: #b9b2a7;
  }

  canvas {
    display: block;
    width: 100%;
    min-height: 680px;
  }

  .global-exit-btn {
    position: absolute;
    top: 14px;
    left: 14px;
    z-index: 6;
    width: 48px;
    height: 48px;
    display: grid;
    place-items: center;
    border-radius: 12px;
    border: 2px solid rgba(0, 0, 0, 0.42);
    background: #c6c6c6;
    color: #161616;
    box-shadow: inset -2px -2px 0 rgba(0, 0, 0, 0.25), inset 2px 2px 0 rgba(255, 255, 255, 0.35);
    cursor: pointer;
  }

  .global-exit-btn,
  .start-btn,
  .option {
    cursor: pointer;
  }

  .global-exit-btn svg {
    width: 24px;
    height: 24px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.9;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .start-btn {
    min-width: 128px;
    padding: 12px 18px;
    border-radius: 12px;
    border: 2px solid rgba(0, 0, 0, 0.4);
    font-size: 16px;
    font-weight: 700;
    background: #c6c6c6;
    color: #191919;
    box-shadow: inset -2px -2px 0 rgba(0, 0, 0, 0.25), inset 2px 2px 0 rgba(255, 255, 255, 0.35);
  }

  .start-btn.primary {
    background: #bdbdbd;
  }

  .start-btn.ghost {
    background: #a8a8a8;
  }

  .toast {
    position: absolute;
    left: 20px;
    bottom: 18px;
    padding: 10px 14px;
    border-radius: 10px;
    background: rgba(19, 19, 19, 0.55);
    border: 1px solid rgba(255, 255, 255, 0.14);
    color: #f7f2ec;
    font-size: 14px;
    max-width: min(460px, calc(100% - 40px));
    z-index: 2;
  }

  .start-screen,
  .pause-mask,
  .result-mask,
  .modal-backdrop {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 20px;
  }

  .start-screen {
    background:
      linear-gradient(rgba(20, 20, 20, 0.18), rgba(20, 20, 20, 0.18)),
      radial-gradient(circle at center, rgba(255, 255, 255, 0.12), rgba(0, 0, 0, 0.28));
    align-content: center;
    gap: 20px;
  }

  .start-hero {
    text-align: center;
  }

  .start-logo {
    font-size: clamp(56px, 8vw, 104px);
    line-height: 0.95;
    font-weight: 900;
    color: #f1ece3;
    text-shadow: 0 6px 0 rgba(0, 0, 0, 0.28), 0 14px 28px rgba(0, 0, 0, 0.25);
    letter-spacing: 2px;
  }

  .start-subtitle {
    margin-top: 8px;
    font-size: clamp(18px, 2vw, 28px);
    color: #f0db6b;
    transform: rotate(-12deg);
    text-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  }

  .prep-modal-mask {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 20px;
    background: rgba(14, 14, 14, 0.42);
    z-index: 7;
  }

  .prep-modal-card {
    width: min(980px, calc(100% - 32px));
    max-height: min(72vh, 760px);
    overflow: auto;
    background: rgba(23, 23, 23, 0.78);
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 22px;
    padding: 18px;
    box-shadow: 0 18px 42px rgba(0, 0, 0, 0.22);
    backdrop-filter: blur(6px);
  }

  .prep-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 14px;
  }

  .prep-header h3 {
    margin: 0 0 6px;
    font-size: 22px;
    color: #fff7ec;
  }

  .prep-header p {
    margin: 0;
    color: #d8cec2;
    font-size: 14px;
  }

  .prep-count {
    white-space: nowrap;
    padding: 6px 10px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: #f1ede8;
    font-size: 13px;
  }

  .prep-empty {
    border-radius: 16px;
    padding: 18px;
    background: rgba(255, 255, 255, 0.05);
    color: #efe4d7;
    font-size: 15px;
    line-height: 1.7;
  }

  .prep-list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
    max-height: 280px;
    overflow: auto;
    padding-right: 4px;
  }

  .prep-card {
    border-radius: 18px;
    padding: 14px;
    background: rgba(255, 255, 255, 0.07);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: #f7f2eb;
  }

  .prep-card-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 8px;
  }

  .prep-tag,
  .prep-times {
    display: inline-flex;
    align-items: center;
    border-radius: 999px;
    padding: 4px 8px;
    font-size: 12px;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .prep-tag {
    background: rgba(245, 106, 106, 0.18);
    color: #ffd1d1;
  }

  .prep-times {
    background: rgba(255, 255, 255, 0.06);
    color: #efe4d7;
  }

  .prep-card h4 {
    margin: 0 0 10px;
    font-size: 16px;
    line-height: 1.6;
  }

  .prep-line {
    font-size: 14px;
    line-height: 1.7;
    color: #e9dfd2;
  }

  .prep-line strong {
    color: #fff6ec;
  }

  .start-actions {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
    justify-content: center;
  }

  .pause-mask,
  .result-mask,
  .modal-backdrop {
    background: rgba(14, 14, 14, 0.42);
  }

  .pause-card,
  .result-card,
  .modal-card {
    width: min(760px, 100%);
    background: rgba(31, 31, 31, 0.92);
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 20px;
    padding: 22px;
    box-shadow: 0 24px 48px rgba(0, 0, 0, 0.28);
    color: #f6f1ea;
  }

  .pause-card {
    width: min(420px, 100%);
    display: grid;
    justify-items: center;
    gap: 16px;
  }

  .pause-title {
    font-size: 34px;
    font-weight: 900;
  }

  .result-card h2,
  .modal-card h3 {
    margin: 0 0 12px;
  }

  .result-actions,
  .modal-actions {
    display: flex;
    gap: 10px;
    justify-content: flex-end;
    margin-top: 16px;
    flex-wrap: wrap;
  }

  .result-actions.centered {
    justify-content: center;
  }

  .modal-meta {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    margin-bottom: 12px;
  }

  .tag {
    padding: 6px 10px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: #f1ede8;
    font-size: 13px;
  }

  .options {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-top: 16px;
  }

  .option {
    border: 1px solid rgba(255, 255, 255, 0.16);
    background: rgba(255, 255, 255, 0.06);
    border-radius: 18px;
    padding: 14px;
    text-align: left;
    font-size: 16px;
    color: #f8f4ef;
  }

  .option:hover {
    border-color: #d4b89c;
    background: rgba(255, 255, 255, 0.1);
  }

  .explain-tip {
    margin-top: 14px;
    color: #dbd1c8;
    font-size: 14px;
  }

  @media (max-width: 960px) {
    .options {
      grid-template-columns: 1fr;
    }

    .global-exit-btn {
      top: 12px;
      left: 12px;
    }

    .start-logo {
      letter-spacing: 0;
    }

    .prep-list {
      grid-template-columns: 1fr;
      max-height: 320px;
    }

    .prep-header {
      flex-direction: column;
      align-items: flex-start;
    }
  }
</style>
