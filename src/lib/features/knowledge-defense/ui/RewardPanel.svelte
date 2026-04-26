<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { RewardChoice } from '../core/types';
  import { audioManager } from '../systems/audio-manager';

  export let choices: RewardChoice[] = [];
  export let feedback: string | null = null;
  export let feedbackKind: 'success' | 'error' | null = null;

  const dispatch = createEventDispatcher<{
    answer: { choice: RewardChoice; selected: string };
    close: void;
  }>();

  function answer(choice: RewardChoice, selected: string) {
    dispatch('answer', { choice, selected });
  }
</script>

<div class="overlay" on:click={() => dispatch('close')}>
  <div class="panel" on:click|stopPropagation>
    <div class="header">
      <div>
        <h2>战术抉择 · 奖励答题</h2>
        <p>升级后不会自动打断战斗。你可以在需要的时候按空格或点击角色打开这里。答对可领取完整奖励，答错也会得到保底恢复，避免断节奏。</p>
      </div>
      <button class="close" on:click={() => { audioManager.playClick(); dispatch('close'); }}>关闭</button>
    </div>

    {#if feedback}
      <div class={`feedback ${feedbackKind ?? ''}`}>{feedback}</div>
    {/if}

    <div class="grid">
      {#each choices as choice (choice.id)}
        <section class="choice-card">
          <div class="choice-head">
            <h3>{choice.title}</h3>
            <p>{choice.description}</p>
          </div>
          <div class="question-box">
            <div class="difficulty">{choice.question.difficulty.toUpperCase()}</div>
            <div class="prompt">{choice.question.prompt}</div>
            <div class="options">
              {#each choice.question.options as option}
                <button
                  class="option"
                  on:click={() => {
                    audioManager.playClick();
                    answer(choice, option);
                  }}
                >
                  {option}
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
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 24px;
    background: rgba(39, 28, 19, 0.34);
    backdrop-filter: blur(4px);
    z-index: 50;
  }
  .panel {
    width: min(1180px, calc(100vw - 48px));
    max-height: min(86vh, 900px);
    overflow: auto;
    background: #fffaf4;
    border: 1px solid #e3d5c7;
    border-radius: 28px;
    padding: 22px;
    box-shadow: 0 24px 60px rgba(54, 41, 30, 0.18);
  }
  .header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 16px;
  }
  .header h2 { margin: 0; font-size: 28px; color: #5b4837; }
  .header p { margin: 8px 0 0; color: #7b6756; line-height: 1.6; }
  .close {
    border: 1px solid #b69b7c;
    background: #fff8ef;
    color: #5a4736;
    border-radius: 14px;
    padding: 10px 14px;
    font-weight: 700;
    cursor: pointer;
  }
  .feedback {
    margin-bottom: 16px;
    padding: 12px 14px;
    border-radius: 16px;
    font-weight: 600;
  }
  .feedback.success { background: #dcfce7; color: #166534; }
  .feedback.error { background: #fee2e2; color: #991b1b; }
  .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
  .choice-card {
    border: 1px solid #eadfce;
    border-radius: 22px;
    background: #fffdfa;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .choice-head h3 { margin: 0; font-size: 20px; color: #5b4837; }
  .choice-head p { margin: 8px 0 0; color: #7b6756; line-height: 1.6; }
  .question-box {
    border: 1px solid #efe4d3;
    background: #fffaf4;
    border-radius: 18px;
    padding: 14px;
  }
  .difficulty {
    display: inline-flex;
    font-size: 12px;
    border-radius: 999px;
    padding: 6px 10px;
    background: #f4ede4;
    color: #75614f;
    font-weight: 700;
  }
  .prompt {
    margin-top: 12px;
    font-size: 18px;
    line-height: 1.65;
    color: #4e3c2e;
  }
  .options { display: grid; gap: 10px; margin-top: 14px; }
  .option {
    border: 1px solid #ddceb9;
    background: #fff;
    border-radius: 14px;
    padding: 12px 14px;
    text-align: left;
    cursor: pointer;
    color: #5b4837;
    font-weight: 600;
  }
  .option:hover { background: #fff6eb; }

  @media (max-width: 980px) {
    .grid { grid-template-columns: 1fr; }
  }
</style>
