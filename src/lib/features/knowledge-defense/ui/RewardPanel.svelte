<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { RewardChoice } from '../core/types';
  import { audioManager } from '../systems/audio-manager';

	export let choices: RewardChoice[] = [];
	export let rerollsRemaining = 0;
	export let rerollsUsed = 0;
  export let feedback: string | null = null;
  export let feedbackKind: 'success' | 'error' | null = null;

  const dispatch = createEventDispatcher<{
    answer: { choice: RewardChoice; selected: string };
    reroll: void;
    close: void;
  }>();

	function answer(choice: RewardChoice, selected: string) {
		dispatch('answer', { choice, selected });
	}

	function close() {
		dispatch('close');
	}

	function reroll() {
		dispatch('reroll');
	}

	function handleOverlayKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			close();
		}
	}

  function getRewardMeta(kind: RewardChoice['rewardKind']) {
    if (kind === 'weapon') {
		return {
			label: '武器升级',
			tone: 'weapon',
			effect: '完整领取后获得对应武器强化或换装效果。',
			iconLabel: 'I'
		};
	}

    if (kind === 'xp') {
		return {
			label: '经验增幅',
			tone: 'xp',
			effect: '完整领取后获得一段时间的经验加速推进。',
			iconLabel: 'XP'
		};
	}

	if (kind === 'skill') {
		return {
			label: '技能',
			tone: 'skill',
			effect: '答对后获得新技能或升级已有技能，并自动挂入底部技能栏。',
			iconLabel: 'H'
		};
	}

	if (kind === 'buff') {
		return {
			label: '战术增益',
			tone: 'buff',
			effect: '完整领取后立刻获得临时增益或单次格挡，HUD 会持续显示剩余状态。',
			iconLabel: '↑'
		};
	}

	return {
		label: '—',
		tone: 'xp',
		effect: '答对领取完整奖励。',
		iconLabel: '·'
	};
  }

  function getDifficultyLabel(difficulty: RewardChoice['question']['difficulty']) {
    if (difficulty === 'easy') return '基础题';
    if (difficulty === 'hard') return '压轴题';
    return '标准题';
  }

  function getOptionPrefix(index: number) {
    return String.fromCharCode(65 + index);
  }
</script>

<div
	class="overlay"
	role="button"
	tabindex="0"
	aria-label="关闭奖励答题面板"
	on:click|self={close}
	on:keydown|self={handleOverlayKeydown}
>
	<div class="panel">
		<div class="header">
			<div class="header-copy">
				<div class="eyebrow">Upgrade Quiz</div>
				<h2>战术抉择 · 奖励答题</h2>
			<p>升级不会自动打断战斗。你可以在需要的时候按空格或点击角色打开这里。先选奖励再答题：答对领取完整奖励并立刻回到战场；答错也会得到保底恢复，避免断节奏（R 可重抽奖励）。</p>
			</div>

			<div class="header-actions">
				<div class="micro-note">
					<strong>回答节奏</strong>
					<span>先选奖励，再做题，成功后立刻带着强化回到战场。</span>
				</div>
				<div class="micro-note reroll-note">
					<strong>重随机会</strong>
					<span>剩余 {rerollsRemaining} 次 · 已使用 {rerollsUsed} 次（R 可重抽）</span>
				</div>
				<button type="button" class="reroll" on:click={() => { audioManager.playClick(); reroll(); }} disabled={rerollsRemaining <= 0}>重抽奖励</button>
				<button type="button" class="close" on:click={() => { audioManager.playClick(); close(); }}>关闭</button>
			</div>
		</div>

    {#if feedback}
      <div class={`feedback ${feedbackKind ?? ''}`}>{feedback}</div>
    {/if}

			<div class="grid">
				{#each choices as choice, choiceIndex (choice.id)}
					<section class={`choice-card ${getRewardMeta(choice.rewardKind).tone}`}>
						<div class="choice-topline">
							<span class="choice-index">奖励 {choiceIndex + 1}</span>
							<div class="choice-badges">
								<span class={`choice-tag ${getRewardMeta(choice.rewardKind).tone}`}>{choice.tag}</span>
								{#if choice.levelFrom !== undefined && choice.levelTo !== undefined}
									<span class="choice-level">Lv {choice.levelFrom} → {choice.levelTo}</span>
								{/if}
								<span class={`choice-type ${getRewardMeta(choice.rewardKind).tone}`}>{getRewardMeta(choice.rewardKind).label}</span>
							</div>
						</div>

						<div class="choice-head">
							<div class={`reward-icon ${getRewardMeta(choice.rewardKind).tone}`} aria-hidden="true">
								{choice.iconGlyph}
							</div>

            <div class="reward-copy">
              <h3>{choice.title}</h3>
              <p>{choice.description}</p>
            </div>
          </div>

          <div class="effect-ribbon">
            <strong>答对效果</strong>
            <span>{getRewardMeta(choice.rewardKind).effect}</span>
          </div>

          <div class="question-box">
            <div class="question-head">
              <span class={`difficulty ${choice.question.difficulty}`}>{getDifficultyLabel(choice.question.difficulty)}</span>
              <span class="question-tag">Question</span>
            </div>

            <div class="prompt">{choice.question.prompt}</div>
            <div class="question-hint">答错依旧保底恢复，但完整强化只有答对才能拿满。</div>

            <div class="options">
              {#each choice.question.options as option, optionIndex}
                <button
                  type="button"
                  class="option"
                  on:click={() => {
                    audioManager.playClick();
                    answer(choice, option);
                  }}
                >
                  <span class="option-prefix">{getOptionPrefix(optionIndex)}</span>
                  <span class="option-text">{option}</span>
                </button>
              {/each}
            </div>
          </div>
        </section>
      {/each}
    </div>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 20px;
    background: rgba(39, 28, 19, 0.34);
    backdrop-filter: blur(5px);
    z-index: 180;
  }

  .panel {
    --reward-bg: #fffaf4;
    --reward-bg-soft: #fffdf9;
    --reward-border: #e3d5c7;
    --reward-border-strong: #d5bf9f;
    --reward-text: #5b4837;
    --reward-text-soft: #7b6756;
    --reward-accent: #f59e0b;
    width: min(1120px, calc(100vw - 40px));
    max-height: min(88vh, 920px);
    overflow: auto;
    background: var(--reward-bg);
    border: 1px solid var(--reward-border);
    border-radius: 28px;
    padding: 18px;
    box-shadow: 0 24px 60px rgba(54, 41, 30, 0.18);
  }

  .header,
  .choice-head,
  .question-head,
  .choice-topline,
  .effect-ribbon,
  .header-actions {
    display: flex;
    gap: 12px;
  }

  .header {
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 14px;
  }

  .header-copy {
    display: grid;
    gap: 8px;
    max-width: 760px;
  }

  .eyebrow,
  .choice-index,
  .choice-type,
  .difficulty,
  .question-tag {
    display: inline-flex;
    align-items: center;
    width: fit-content;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 800;
  }

  .eyebrow {
    padding: 7px 12px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    background: #fff1d7;
    color: #a26514;
  }

  .header h2 {
    margin: 0;
    font-size: clamp(28px, 3.8vw, 38px);
    color: var(--reward-text);
  }

  .header p,
  .reward-copy p,
  .micro-note span,
  .question-hint {
    margin: 0;
    color: var(--reward-text-soft);
    line-height: 1.7;
  }

  .header-actions {
    align-items: flex-start;
  }

  .micro-note,
  .choice-card,
  .feedback {
    border-radius: 20px;
    border: 1px solid var(--reward-border);
  }

  .micro-note {
    max-width: 260px;
    padding: 12px 14px;
    display: grid;
    gap: 4px;
    background: var(--reward-bg-soft);
  }

  .micro-note strong,
  .reward-copy h3,
  .prompt,
  .effect-ribbon strong {
    color: var(--reward-text);
  }

  .close {
		border: 1px solid #b69b7c;
		background: #fff8ef;
		color: #5a4736;
		border-radius: 14px;
		padding: 10px 14px;
		font-weight: 800;
		cursor: pointer;
	}

	.reroll {
		border: 1px solid #b69b7c;
		background: linear-gradient(180deg, #fff5df, #ffedcb);
		color: #8a5510;
		border-radius: 14px;
		padding: 10px 14px;
		font-weight: 800;
		cursor: pointer;
	}

  .feedback {
    margin-bottom: 14px;
    padding: 12px 14px;
    font-weight: 700;
  }

  .feedback.success {
    background: #edfdf3;
    color: #166534;
    border-color: #b7e4c7;
  }

  .feedback.error {
    background: #fff2f2;
    color: #991b1b;
    border-color: #efc4c4;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
  }

  .choice-card {
    display: grid;
    gap: 12px;
    padding: 14px;
    background: var(--reward-bg-soft);
  }

  .choice-card.weapon {
    background: linear-gradient(180deg, #fff8ed, var(--reward-bg-soft));
    border-color: #edcf9c;
  }

  .choice-card.xp {
    background: linear-gradient(180deg, #f4f8ff, var(--reward-bg-soft));
    border-color: #c9d9f5;
  }

	.choice-card.drone {
		background: linear-gradient(180deg, #f6fbf7, var(--reward-bg-soft));
		border-color: #cae4d2;
	}

	.choice-card.buff {
		background: linear-gradient(180deg, #f8f5ff, var(--reward-bg-soft));
		border-color: #d9cbf8;
	}

	.choice-card.utility {
		background: linear-gradient(180deg, #eef7ff, var(--reward-bg-soft));
		border-color: #bfdcff;
	}

  .choice-topline,
  .question-head,
  .effect-ribbon {
    justify-content: space-between;
    align-items: center;
  }

  .choice-index {
    padding: 6px 10px;
    background: rgba(244, 237, 228, 0.96);
    color: #7b6756;
  }

  .choice-type,
  .difficulty,
  .question-tag {
    padding: 6px 10px;
  }

	.choice-badges {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 8px;
		flex-wrap: wrap;
	}

	.choice-tag,
	.choice-level {
		padding: 6px 10px;
		border-radius: 999px;
		font-size: 12px;
		line-height: 1;
		letter-spacing: 0.02em;
		white-space: nowrap;
	}

	.choice-tag {
		background: rgba(244, 237, 228, 0.96);
		color: #7b6756;
		border: 1px solid rgba(227, 213, 199, 0.9);
	}

	.choice-tag.weapon {
		background: rgba(251, 191, 36, 0.12);
		color: #a26514;
		border-color: rgba(237, 205, 154, 0.8);
	}

	.choice-tag.xp {
		background: rgba(96, 165, 250, 0.12);
		color: #1d4ed8;
		border-color: rgba(191, 216, 255, 0.8);
	}

	.choice-tag.buff {
		background: rgba(168, 85, 247, 0.1);
		color: #7c3aed;
		border-color: rgba(221, 205, 255, 0.8);
	}

	.choice-level {
		background: rgba(91, 72, 55, 0.06);
		color: rgba(91, 72, 55, 0.78);
		border: 1px solid rgba(227, 213, 199, 0.72);
	}

  .choice-type.weapon,
  .difficulty.easy {
    background: rgba(251, 191, 36, 0.16);
    color: #a26514;
  }

  .choice-type.xp,
  .difficulty.medium {
    background: rgba(96, 165, 250, 0.16);
    color: #1d4ed8;
  }

	.choice-type.drone,
	.difficulty.hard {
		background: rgba(34, 197, 94, 0.16);
		color: #166534;
	}

	.choice-type.buff {
		background: rgba(168, 85, 247, 0.14);
		color: #7c3aed;
	}

	.choice-type.utility {
		background: rgba(14, 165, 233, 0.14);
		color: #0369a1;
	}

  .question-tag {
    background: rgba(244, 237, 228, 0.96);
    color: #7b6756;
  }

  .choice-head {
    align-items: center;
  }

  .reward-icon {
    width: 64px;
    height: 64px;
    flex: 0 0 64px;
    display: grid;
    place-items: center;
    border-radius: 20px;
    font-size: 22px;
    font-weight: 900;
    border: 1px solid transparent;
  }

  .reward-icon.weapon {
    color: #9a5c0e;
    background: rgba(255, 243, 219, 0.96);
    border-color: rgba(237, 205, 154, 0.92);
  }

  .reward-icon.xp {
    color: #1d4ed8;
    background: rgba(229, 239, 255, 0.96);
    border-color: rgba(191, 216, 255, 0.92);
  }

	.reward-icon.drone {
		color: #166534;
		background: rgba(231, 247, 236, 0.96);
		border-color: rgba(190, 230, 202, 0.92);
	}

	.reward-icon.buff {
		color: #7c3aed;
		background: rgba(244, 238, 255, 0.96);
		border-color: rgba(221, 205, 255, 0.92);
	}

	.reward-icon.utility {
		color: #0369a1;
		background: rgba(232, 245, 255, 0.96);
		border-color: rgba(191, 225, 255, 0.92);
	}

  .reward-copy {
    display: grid;
    gap: 6px;
    min-width: 0;
  }

  .reward-copy h3 {
    margin: 0;
    font-size: 22px;
  }

  .effect-ribbon,
  .question-box {
    border-radius: 18px;
    border: 1px solid rgba(228, 214, 200, 0.96);
    background: rgba(255, 250, 244, 0.94);
  }

  .effect-ribbon {
    padding: 10px 12px;
    align-items: baseline;
    color: var(--reward-text-soft);
    line-height: 1.6;
  }

  .question-box {
    padding: 12px;
    display: grid;
    gap: 12px;
  }

  .prompt {
    font-size: 17px;
    line-height: 1.65;
  }

  .options {
    display: grid;
    gap: 8px;
  }

  .option {
    display: grid;
    grid-template-columns: 32px minmax(0, 1fr);
    gap: 10px;
    align-items: center;
    border: 1px solid #ddceb9;
    background: #fff;
    border-radius: 14px;
    padding: 10px 12px;
    text-align: left;
    cursor: pointer;
    color: #5b4837;
    font-weight: 700;
  }

  .option-prefix {
    width: 32px;
    height: 32px;
    display: inline-grid;
    place-items: center;
    border-radius: 10px;
    background: #fff4de;
    color: #9a5c0e;
    font-size: 12px;
  }

  .option:hover {
    background: #fff7ed;
  }

  @media (max-width: 1040px) {
    .header,
    .header-actions {
      flex-direction: column;
    }

    .micro-note {
      max-width: none;
    }

    .grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 640px) {
    .overlay {
      padding: 12px;
      align-items: end;
    }

    .panel {
      width: 100%;
      max-height: 92dvh;
      border-radius: 22px 22px 0 0;
      padding: 14px;
    }

    .choice-head {
      align-items: flex-start;
    }

    .reward-icon {
      width: 56px;
      height: 56px;
      flex-basis: 56px;
      border-radius: 18px;
    }

    .option {
      grid-template-columns: 28px minmax(0, 1fr);
      padding: 9px 10px;
    }

    .option-prefix {
      width: 28px;
      height: 28px;
    }
  }
</style>
