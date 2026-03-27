<script lang="ts">
  import { createEventDispatcher, onDestroy, onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import type { Difficulty, FinishStats, Monster, Projectile, Question, QuestionPack } from './types';
  import { samplePack } from './samplePack';
  import {
    wrongQuestions,
    refreshWrongQuestions,
    recordWrongQuestionEntry,
    markWrongQuestionCorrectEntry
  } from '$lib/stores/knowledge-defense';
  import type { WrongQuestionRecord } from '$lib/apis/knowledge-defense';

  export let pack: QuestionPack = samplePack;
  export let autoStart = false;
  export let maxAlive = 5;
  export let playerSprite = '/knowledge-defense/player.png';
  export let monsterSprites: Record<Difficulty, string> = {
    easy: '/knowledge-defense/monster-easy.png',
    medium: '/knowledge-defense/monster-medium.png',
    hard: '/knowledge-defense/monster-hard.png'
  };

  export type AttackMode = 'straight' | 'scatter';
  export let attackMode: AttackMode = 'straight';

  const dispatch = createEventDispatcher<{ finish: FinishStats }>();

  const PLAYER_MAX_HP = 300;
  const BASE_SPEED: Record<Difficulty, number> = { easy: 12, medium: 15.5, hard: 19 };
  const TOTAL_MONSTERS = 20;
  const ANSWER_MOVE_RATIO: Record<Difficulty, number> = { easy: 2 / 3, medium: 3 / 4, hard: 4 / 5 };
  const MONSTER_HP: Record<Difficulty, number> = { easy: 100, medium: 100, hard: 200 };
  const MONSTER_RADIUS: Record<Difficulty, number> = { easy: 26, medium: 30, hard: 34 };
  const STRAIGHT_DAMAGE = [30, 30, 40, 50];
  const SCATTER_DAMAGE = Array.from({ length: 8 }, () => 20);
  const SCATTER_SPREAD = (20 * Math.PI) / 180;

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
  let showSettingsModal = false;

  let playerHp = PLAYER_MAX_HP;
  const playerRadius = 36;
  const player = { x: width / 2, y: height / 2 };

  let kills = 0;
  let correct = 0;
  let wrong = 0;

  let activeMonsters: Monster[] = [];
  let pendingMonsters: Monster[] = [];
  let projectiles: Projectile[] = [];

  let selectedMonsterId: string | null = null;
  let modalOpen = false;
  let modalQuestion: Question | null = null;
  let selectedMonsterLabel = '';

  let toast = '';
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

  let wrongNotebook: WrongQuestionRecord[] = [];
  let selectedAttackMode: AttackMode = attackMode;

  $: wrongNotebook = $wrongQuestions;
  $: attackMode = selectedAttackMode;
  $: if (!modalOpen) {
    toast =
      selectedAttackMode === 'straight'
        ? '点击怪物答题，答对后会发射 4 枚直线子弹。'
        : '点击怪物答题，答对后会发射 8 枚 ±20° 散射子弹。';
  }

  function getQuestionType(question: string) {
    const prompt = question.replace(/\s+/g, '');
    if (/因为.*所以|因果|为什么|原因|结果/.test(prompt)) return '因果关系';
    if (/首都|朝代|历史|时间|哪一年|人物/.test(prompt)) return '历史人文';
    if (/语法|时态|单词|英语|词性|句型/.test(prompt)) return '英语语言';
    if (/实验|水循环|蒸发|凝结|生物|化学|物理|科学/.test(prompt)) return '科学概念';
    if (/计算|几何|方程|分数|面积|周长|数学/.test(prompt)) return '数学推理';
    return '综合理解';
  }

  function buildWrongAnalysis(items: WrongQuestionRecord[]) {
    const total = items.length;
    const repeated = items.filter((item) => item.wrong_count >= 2).length;
    const typeMap = new Map<string, number>();
    const frequent = [...items]
      .sort((a, b) => b.wrong_count - a.wrong_count || b.last_wrong_at - a.last_wrong_at)
      .slice(0, 4);

    for (const item of items) {
      const type = getQuestionType(item.question);
      typeMap.set(type, (typeMap.get(type) ?? 0) + 1);
    }

    const typeEntries = [...typeMap.entries()].sort((a, b) => b[1] - a[1]);
    const topType = typeEntries[0]?.[0] ?? '综合理解';
    const advice: string[] = [];

    if (total === 0) {
      advice.push('当前还没有错题，可以先开始一局，再回来查看你的易错点。');
    } else {
      advice.push(`建议优先复习「${topType}」相关题目，先把高频失分点补稳。`);
      if (repeated > 0) advice.push(`有 ${repeated} 道题已经反复出错，建议先遮住答案自测一遍。`);
      if (typeEntries.length >= 2) advice.push(`除了「${topType}」，也要兼顾「${typeEntries[1][0]}」类题目。`);
      advice.push('开局前先看题干、自己回忆答案，再对照解析，会比直接看答案更有效。');
    }

    return { total, repeated, typeEntries, frequent, advice };
  }

  $: wrongAnalysis = buildWrongAnalysis(wrongNotebook);

  async function loadWrongNotebook() {
    try {
      await refreshWrongQuestions({ source_type: 'pack', source_id: pack.id, limit: 200 });
    } catch (error) {
      console.error('加载错题本失败', error);
    }
  }

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
    height = Math.max(720, rect.height);
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

  function setToast(message: string, fallback = false) {
    toast = message;
    if (toastTimer) clearTimeout(toastTimer);
    if (!fallback) {
      toastTimer = setTimeout(() => {
        toast =
          selectedAttackMode === 'straight'
            ? '点击怪物答题，答对后会发射 4 枚直线子弹。'
            : '点击怪物答题，答对后会发射 8 枚 ±20° 散射子弹。';
      }, 2400);
    }
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
    flashUntil = 0;
    lastTs = 0;
    showStartScreen = keepStartScreen;
    showPrepModal = false;
    showSettingsModal = false;
  }

  function returnToStartScreen() {
    resetInternalState({ keepStartScreen: true });
    setToast('已返回启动页，可在备战区查看错题。');
  }

  function openPrepZone() {
    showPrepModal = true;
  }

  function closePrepZone() {
    showPrepModal = false;
  }

  function handlePrepMaskClick(event: MouseEvent) {
    if (event.target === event.currentTarget) closePrepZone();
  }

  function openSettings() {
    showSettingsModal = true;
  }

  function closeSettings() {
    showSettingsModal = false;
  }

  function handleSettingsMaskClick(event: MouseEvent) {
    if (event.target === event.currentTarget) closeSettings();
  }

  function applyAttackMode(mode: AttackMode) {
    selectedAttackMode = mode;
    setToast(
      mode === 'straight' ? '已切换为直线发射：4 发 30/30/40/50。' : '已切换为散射发射：8 发，每发 20 伤害。'
    );
  }

  function goHome() {
    goto('/');
  }

  function handleGlobalExit() {
    if (showStartScreen) {
      goHome();
      return;
    }
    if (gameOver || paused) {
      returnToStartScreen();
      return;
    }
    if (modalOpen) closeQuestion();
    paused = true;
    running = false;
    setToast('已暂停');
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
      speed: BASE_SPEED[difficulty] + seed * 0.75,
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
    setToast(selectedAttackMode === 'straight' ? '战斗开始！当前是直线发射。' : '战斗开始！当前是散射发射。');
    spawnUntilCap();
  }

  function togglePause() {
    if (gameOver || showStartScreen || modalOpen) return;
    paused = !paused;
    running = !paused;
    setToast(paused ? '已暂停' : '继续战斗');
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
    setToast(reason);
    if (playerHp <= 0) finishGame(false);
  }

  function healPlayer(amount: number) {
    if (playerHp <= 0) return;
    const nextHp = clamp(playerHp + amount, 0, PLAYER_MAX_HP);
    const delta = nextHp - playerHp;
    playerHp = nextHp;
    if (delta > 0) {
      spawnDamagePopup(player.x, player.y - 42, `+${delta}`, '#7ee787');
      setToast(`净化成功，玩家恢复 ${delta} HP`);
    }
  }

  async function recordWrongQuestion(question: Question, selectedAnswer: string) {
    try {
      await recordWrongQuestionEntry({
        source_type: 'pack',
        source_id: pack.id,
        question_id: question.id,
        question: question.prompt,
        options: question.options,
        correct_answer: question.answer,
        explanation: question.explanation,
        last_user_answer: selectedAnswer
      });
    } catch (error) {
      console.error('保存错题失败', error);
    }
  }

  async function resolveWrongQuestionProgress(question: Question) {
    const existing = wrongNotebook.find((item) => item.question_id === question.id);
    if (!existing) return null;

    try {
      return await markWrongQuestionCorrectEntry({
        source_type: 'pack',
        source_id: pack.id,
        question_id: question.id,
        mastery_threshold: 2
      });
    } catch (error) {
      console.error('更新错题掌握进度失败', error);
      return null;
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
    setToast(win ? '闯关成功！' : '守卫失败，生命归零。');
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

  function queueProjectile(angle: number, damage: number, delay: number) {
    const timer = setTimeout(() => {
      const speed = 420;
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
        }
      ];
    }, delay);
    pendingShotTimers.push(timer);
  }

  function fireBurst(monster: Monster) {
    const baseAngle = Math.atan2(monster.y - player.y, monster.x - player.x);

    if (selectedAttackMode === 'straight') {
      STRAIGHT_DAMAGE.forEach((damage, index) => {
        queueProjectile(baseAngle, damage, index * 90);
      });
      return;
    }

    SCATTER_DAMAGE.forEach((damage, index) => {
      const randomOffset = (Math.random() * 2 - 1) * SCATTER_SPREAD;
      queueProjectile(baseAngle + randomOffset, damage, index * 45);
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
      const resolveResult = await resolveWrongQuestionProgress(modalQuestion);

      if (resolveResult?.removed) {
        setToast('回答正确！这道错题已连续答对 2 次，已从备战区移除。');
      } else if (resolveResult && resolveResult.streak > 0) {
        setToast(`回答正确！错题巩固进度 ${resolveResult.streak}/${resolveResult.target}。`);
      } else {
        setToast(
          selectedAttackMode === 'straight'
            ? '回答正确！已发射 4 枚直线子弹。'
            : '回答正确！已发射 8 枚散射子弹。'
        );
      }

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

    // 一旦超出界面，立刻消亡
    if (dot.x < 0 || dot.x > width || dot.y < 0 || dot.y > height) {
      continue;
    }

    let hit = false;

    for (const monster of activeMonsters) {
      if (monster.isDead) continue;

      const dist = distance(dot.x, dot.y, monster.x, monster.y);
      if (dist <= dot.radius + monster.radius) {
        monster.hp = clamp(monster.hp - dot.damage, 0, monster.maxHp);
        spawnDamagePopup(monster.x, monster.y - 8, `-${dot.damage}`, '#ffd166');

        // 命中后子弹立刻消亡
        hit = true;

        if (monster.hp <= 0) {
          monster.isDead = true;
          removeMonster(monster.id);
        }

        break;
      }
    }

    if (!hit) {
      next.push(dot);
    }
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
    gradient.addColorStop(0, '#ece7df');
    gradient.addColorStop(1, '#cbc3b6');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.fillStyle = 'rgba(78, 67, 58, 0.12)';
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

  onMount(() => {
    ctx = canvasEl.getContext('2d');
    preloadImages();
    resizeCanvas();
    loadWrongNotebook();
    const onResize = () => resizeCanvas();
    window.addEventListener('resize', onResize);
    raf = requestAnimationFrame(loop);
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
          <button class="start-btn primary" on:click={openPrepZone}>备战区{wrongNotebook.length > 0 ? ` (${wrongNotebook.length})` : ''}</button>
          <button class="start-btn secondary" on:click={openSettings}>设置</button>
          <button class="start-btn primary" on:click={startGame}>开始闯关</button>
        </div>
      </div>
    {/if}

    {#if showPrepModal}
      <div class="prep-modal-mask" on:click={handlePrepMaskClick}>
        <div class="prep-modal-card light-theme" on:click|stopPropagation>
          <div class="prep-header">
            <div class="prep-header-copy">
              <h3>备战区 · 错题回看</h3>
              <p>这里保留近期错题、正确答案与解析，并根据你的错题情况给出针对性建议。</p>
            </div>
            <div class="prep-header-actions">
              <span class="prep-count">{wrongNotebook.length} 题</span>
              <button class="prep-close-btn" on:click={closePrepZone} aria-label="关闭备战区" title="关闭备战区">×</button>
            </div>
          </div>

          <div class="prep-grid">
            <div class="prep-left">
              {#if wrongNotebook.length === 0}
                <div class="prep-empty">当前还没有错题，先开始一局，答错的题会自动收纳到这里。</div>
              {:else}
                <div class="prep-list">
                  {#each wrongNotebook as item}
                    <article class="prep-card readable">
                      <div class="prep-card-top">
                        <span class="prep-tag">错题</span>
                        <span class="prep-times">错了 {item.wrong_count} 次</span>
                      </div>
                      <h4>{item.question}</h4>
                      <div class="prep-line"><strong>你当时选了：</strong>{item.last_user_answer}</div>
                      <div class="prep-line"><strong>正确答案：</strong>{item.correct_answer}</div>
                      <div class="prep-line"><strong>解析：</strong>{item.explanation}</div>
                      <div class="prep-line"><strong>连续答对：</strong>{item.consecutive_correct_count}/2</div>
                      <div class="prep-line"><strong>最近答错：</strong>{new Date(item.last_wrong_at).toLocaleString()}</div>
                    </article>
                  {/each}
                </div>
              {/if}
            </div>

            <aside class="analysis-panel">
              <div class="analysis-head">
                <h4>错题分析</h4>
                <span class="analysis-hint">右侧内容可滚动</span>
              </div>

              <div class="analysis-scroll">
                <div class="analysis-metrics">
                  <div class="metric-card"><span>错题总数</span><strong>{wrongAnalysis.total}</strong></div>
                  <div class="metric-card"><span>反复错题</span><strong>{wrongAnalysis.repeated}</strong></div>
                </div>

                <div class="analysis-section">
                  <h5>错题类型</h5>
                  {#if wrongAnalysis.typeEntries.length === 0}
                    <p class="muted">暂无数据</p>
                  {:else}
                    <ul class="analysis-list compact">
                      {#each wrongAnalysis.typeEntries as [type, count]}
                        <li><span>{type}</span><strong>{count}</strong></li>
                      {/each}
                    </ul>
                  {/if}
                </div>

                <div class="analysis-section">
                  <h5>经常性错题</h5>
                  {#if wrongAnalysis.frequent.length === 0}
                    <p class="muted">暂无数据</p>
                  {:else}
                    <ul class="analysis-list">
                      {#each wrongAnalysis.frequent as item}
                        <li>
                          <span>{item.question}</span>
                          <strong>{item.wrong_count} 次</strong>
                        </li>
                      {/each}
                    </ul>
                  {/if}
                </div>

                <div class="analysis-section">
                  <h5>学习建议</h5>
                  <ul class="advice-list">
                    {#each wrongAnalysis.advice as item}
                      <li>{item}</li>
                    {/each}
                  </ul>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>
    {/if}

    {#if showSettingsModal}
      <div class="prep-modal-mask" on:click={handleSettingsMaskClick}>
        <div class="settings-card light-theme" on:click|stopPropagation>
          <div class="prep-header">
            <div>
              <h3>设置</h3>
              <p>选择子弹发射方式。设置会立即生效，也会影响下一局。</p>
            </div>
          </div>

          <div class="settings-options">
            <button
              class:selected={selectedAttackMode === 'straight'}
              class="setting-option"
              on:click={() => applyAttackMode('straight')}
            >
              <h4>直线发射</h4>
              <p>4 枚子弹，沿玩家与目标怪物连线发射，伤害为 30 / 30 / 40 / 50。</p>
            </button>
            <button
              class:selected={selectedAttackMode === 'scatter'}
              class="setting-option"
              on:click={() => applyAttackMode('scatter')}
            >
              <h4>散射发射</h4>
              <p>8 枚子弹，每枚伤害 20，发射夹角限定在目标连线 ±20° 内随机。</p>
            </button>
          </div>

          <div class="result-actions">
            <button class="start-btn primary" on:click={closeSettings}>完成设置</button>
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
        <div class="explain-tip">
          {selectedAttackMode === 'straight'
            ? '答对后会发射 4 枚直线子弹；答错立刻扣除 20 HP，并把这道题加入备战区。'
            : '答对后会发射 8 枚 ±20° 散射子弹；答错立刻扣除 20 HP，并把这道题加入备战区。'}
        </div>
        <div class="modal-actions">
          <button class="start-btn ghost" on:click={closeQuestion}>先关闭题卡</button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  :global(body) {
    background: #ece7e1;
  }

  .kd-shell {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 100%;
    color: #4f4034;
  }

  .kd-board {
    position: relative;
    flex: 1;
    min-height: 0;
    height: 100%;
    border-radius: 28px;
    overflow: hidden;
    border: 1px solid rgba(145, 124, 103, 0.16);
    box-shadow: 0 18px 42px rgba(39, 31, 26, 0.09);
    background: #d8d2c8;
  }

  canvas {
    display: block;
    width: 100%;
    height: 100%;
    min-height: 720px;
  }

  .global-exit-btn {
    position: absolute;
    top: 14px;
    left: 14px;
    z-index: 8;
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

  .global-exit-btn svg {
    width: 24px;
    height: 24px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .toast {
    position: absolute;
    left: 18px;
    bottom: 18px;
    z-index: 6;
    padding: 10px 14px;
    border-radius: 14px;
    background: rgba(57, 49, 41, 0.86);
    color: #fff7eb;
    font-size: 14px;
    line-height: 1.5;
    max-width: min(520px, calc(100% - 36px));
    box-shadow: 0 10px 22px rgba(31, 22, 17, 0.14);
  }

  .start-screen {
    position: absolute;
    inset: 0;
    z-index: 5;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 26px;
    padding: 48px 24px;
  }

  .start-hero {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    text-align: center;
  }

  .start-logo {
    font-size: clamp(64px, 9vw, 96px);
    font-weight: 900;
    letter-spacing: 2px;
    color: #f4efe6;
    text-shadow: 0 8px 0 rgba(92, 82, 73, 0.38), 0 18px 34px rgba(22, 17, 12, 0.15);
  }

  .start-subtitle {
    margin-top: -8px;
    font-size: clamp(20px, 3vw, 32px);
    color: #f0d04b;
    transform: rotate(-12deg);
    text-shadow: 0 4px 10px rgba(75, 62, 17, 0.16);
  }

  .start-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 16px;
  }

  .start-btn,
  .option,
  .setting-option {
    cursor: pointer;
  }

  .start-btn {
    border-radius: 16px;
    border: 2px solid rgba(88, 77, 67, 0.4);
    background: #d6d6d6;
    color: #171717;
    padding: 16px 30px;
    font-size: 18px;
    font-weight: 700;
    box-shadow: inset -2px -2px 0 rgba(0, 0, 0, 0.25), inset 2px 2px 0 rgba(255, 255, 255, 0.4);
  }

  .start-btn.primary {
    background: #d8d8d8;
  }

  .start-btn.secondary {
    background: #ece1cf;
  }

  .start-btn.ghost {
    background: #f3ede5;
  }

  .prep-modal-mask,
  .modal-backdrop,
  .pause-mask,
  .result-mask {
    position: absolute;
    inset: 0;
    z-index: 9;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    background: rgba(54, 44, 35, 0.26);
    backdrop-filter: blur(2px);
  }

  .light-theme {
    background: linear-gradient(180deg, #fffaf3 0%, #f8f0e6 100%);
    color: #4d4034;
    border: 1px solid #e3d5c7;
    box-shadow: 0 24px 48px rgba(88, 67, 42, 0.14);
  }

  .prep-modal-card,
  .settings-card {
    width: min(1240px, 100%);
    max-height: min(88vh, 960px);
    border-radius: 24px;
    padding: 18px;
    overflow: hidden;
  }

  .prep-modal-card {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .prep-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 14px;
    margin-bottom: 4px;
  }

  .prep-header-copy {
    min-width: 0;
  }

  .prep-header h3 {
    margin: 0;
    font-size: 22px;
    color: #5a4638;
  }

  .prep-header p {
    margin: 6px 0 0;
    font-size: 14px;
    line-height: 1.55;
    color: #7b6757;
  }

  .prep-header-actions {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .prep-count {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 8px 14px;
    border-radius: 999px;
    background: #fff;
    color: #6b5849;
    font-weight: 700;
    font-size: 14px;
    border: 1px solid #ddcfbf;
  }

  .prep-close-btn {
    width: 40px;
    height: 40px;
    border: 1px solid #d9cab9;
    border-radius: 12px;
    background: #fffdf9;
    color: #6a5545;
    font-size: 24px;
    line-height: 1;
    cursor: pointer;
    box-shadow: 0 6px 14px rgba(88, 67, 42, 0.08);
  }

  .prep-close-btn:hover {
    background: #fff4e6;
  }

  .prep-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.6fr) minmax(300px, 0.9fr);
    gap: 16px;
    min-height: 0;
    flex: 1;
    overflow: hidden;
  }

  .prep-left {
    min-height: 0;
    display: flex;
  }

  .prep-list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    width: 100%;
    min-height: 0;
    overflow: auto;
    padding-right: 6px;
  }

  .prep-card.readable,
  .analysis-panel {
    background: #fffaf4;
    border: 1px solid #e2d5c8;
    border-radius: 20px;
    box-shadow: 0 10px 18px rgba(98, 79, 59, 0.06);
  }

  .prep-card {
    padding: 14px;
  }

  .prep-card-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 10px;
  }

  .prep-tag {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 6px 10px;
    border-radius: 999px;
    background: #f8d7d1;
    color: #9a5b54;
    font-weight: 700;
    font-size: 12px;
  }

  .prep-times {
    color: #8e7a69;
    font-weight: 700;
    font-size: 13px;
  }

  .prep-card h4 {
    margin: 0 0 10px;
    font-size: 18px;
    line-height: 1.5;
    color: #574637;
  }

  .prep-line {
    margin-top: 6px;
    font-size: 14px;
    line-height: 1.6;
    color: #655240;
  }

  .prep-line strong {
    color: #4d3f34;
    margin-right: 6px;
  }

  .analysis-panel {
    align-self: stretch;
    display: flex;
    flex-direction: column;
    min-height: 0;
    padding: 14px;
    overflow: hidden;
  }

  .analysis-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 10px;
  }

  .analysis-panel h4 {
    margin: 0;
    font-size: 20px;
    color: #4d3f34;
  }

  .analysis-hint {
    font-size: 12px;
    color: #8b7766;
  }

  .analysis-scroll {
    min-height: 0;
    overflow-y: auto;
    padding-right: 6px;
  }

  .analysis-metrics {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .metric-card {
    background: #fff;
    border: 1px solid #eaded1;
    border-radius: 14px;
    padding: 12px;
  }

  .metric-card span {
    display: block;
    color: #8a7666;
    font-size: 12px;
    margin-bottom: 4px;
  }

  .metric-card strong {
    font-size: 18px;
    color: #534233;
  }

  .analysis-section {
    margin-top: 14px;
  }

  .analysis-section h5 {
    margin: 0 0 8px;
    font-size: 15px;
    color: #5a4838;
  }

  .analysis-list,
  .advice-list {
    margin: 0;
    padding-left: 18px;
    color: #6a5849;
  }

  .analysis-list.compact {
    list-style: none;
    padding-left: 0;
  }

  .analysis-list.compact li,
  .analysis-list li {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    padding: 7px 0;
    border-bottom: 1px dashed #eaded1;
    font-size: 13px;
  }

  .analysis-list li span {
    flex: 1;
    line-height: 1.45;
  }

  .analysis-list li strong {
    flex: 0 0 auto;
    color: #4e3e31;
  }

  .advice-list li {
    margin-top: 6px;
    line-height: 1.55;
    font-size: 13px;
  }

  .muted,
  .prep-empty {
    color: #867260;
    font-size: 14px;
    line-height: 1.55;
  }

  .prep-empty {
    width: 100%;
    padding: 16px;
    border-radius: 18px;
    background: #fffaf4;
    border: 1px solid #e2d5c8;
  }

  .settings-options {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
    margin-top: 8px;
  }

  .setting-option {
    text-align: left;
    padding: 18px;
    border-radius: 18px;
    background: #fffaf4;
    border: 2px solid #e1d4c7;
    color: #5a4738;
  }

  .setting-option.selected {
    border-color: #d9b04d;
    box-shadow: 0 0 0 3px rgba(217, 176, 77, 0.18);
    background: #fff9ec;
  }

  .setting-option h4 {
    margin: 0 0 8px;
    font-size: 20px;
  }

  .setting-option p {
    margin: 0;
    color: #776252;
    line-height: 1.6;
  }

  .pause-card,
  .result-card,
  .modal-card {
    width: min(760px, 100%);
    border-radius: 24px;
    background: #fffaf4;
    border: 1px solid #e2d5c8;
    box-shadow: 0 22px 48px rgba(52, 40, 30, 0.16);
    padding: 24px;
    color: #4f4034;
  }

  .pause-title,
  .result-card h2,
  .modal-card h3 {
    margin: 0 0 14px;
    font-size: 34px;
    color: #4f4034;
  }

  .result-card p,
  .explain-tip {
    font-size: 17px;
    line-height: 1.7;
    color: #6f5b4d;
  }

  .modal-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-bottom: 14px;
  }

  .tag {
    padding: 7px 12px;
    border-radius: 999px;
    background: #fff;
    border: 1px solid #e3d6ca;
    color: #665345;
    font-size: 14px;
  }

  .options {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    margin-top: 18px;
  }

  .option {
    border-radius: 18px;
    border: 1px solid #e0d3c5;
    padding: 16px;
    font-size: 17px;
    text-align: left;
    background: #ffffff;
    color: #4e3d31;
  }

  .option:hover {
    border-color: #d9b04d;
    background: #fffaf0;
  }

  .modal-actions,
  .result-actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    margin-top: 18px;
  }

  .centered {
    justify-content: center;
  }

  @media (max-width: 1180px) {
    .prep-grid {
      grid-template-columns: 1fr;
      max-height: none;
    }

    .analysis-panel {
      position: static;
    }
  }

  @media (max-width: 900px) {
    .prep-list,
    .settings-options,
    .options {
      grid-template-columns: 1fr;
    }

    .start-actions {
      flex-direction: column;
      width: 100%;
      max-width: 380px;
    }

    .start-btn {
      width: 100%;
    }

    .start-logo {
      font-size: 64px;
    }
  }
</style>
