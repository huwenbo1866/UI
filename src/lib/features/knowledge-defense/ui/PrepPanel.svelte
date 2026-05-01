<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { WrongNotebookStats } from '../core/types';
  import type { WrongQuestionRecord } from '$lib/apis/knowledge-defense';

  export let visible = false;
  export let items: WrongQuestionRecord[] = [];
  export let stats: WrongNotebookStats;
  export let onClose: () => void;
  export let onClear: (() => void) | undefined;

  const dispatch = createEventDispatcher();

  function close() {
    onClose?.();
    dispatch('close');
  }

  function handleOverlayKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      close();
    }
  }

  function getItemTone(item: WrongQuestionRecord) {
    if (item.wrong_count >= 3) return 'danger';
    if (item.wrong_count >= 2) return 'warning';
    return 'calm';
  }

  function getSourceLabel(item: WrongQuestionRecord) {
    if (item.chapter) return item.chapter;
    if (item.source_type === 'knowledge') return '知识库题源';
    if (item.source_type === 'chat') return '对话题源';
    return '训练题包';
  }
</script>

{#if visible}
  <div
    class="overlay"
    role="button"
    tabindex="0"
    aria-label="关闭错题回看面板"
    on:click|self={close}
    on:keydown|self={handleOverlayKeydown}
  >
    <div class="panel">
      <div class="header">
        <div class="header-copy">
          <div class="eyebrow">Prep Room</div>
          <h2>备战区 · 错题回看</h2>
          <p>这里保留你近期错题、错误次数与解析，并根据错题情况给出针对性建议。先看反复失手点，再决定是否马上回战场。</p>
        </div>

        <div class="actions">
          {#if onClear}
            <button type="button" class="secondary" on:click={onClear}>清空记录</button>
          {/if}
          <button type="button" class="primary" on:click={close}>关闭</button>
        </div>
      </div>

      <div class="top-strip">
        <section class="stat-banner">
          <span class="banner-tag">Wrong Count</span>
          <strong>{stats.total}</strong>
          <p>仍在错题本中的题目总量</p>
        </section>

        <section class="stat-banner accent">
          <span class="banner-tag">Repeat Mistakes</span>
          <strong>{stats.repeated}</strong>
          <p>需要优先复盘的反复失误题</p>
        </section>

        <section class="stat-banner compact">
          <span class="banner-tag">Advice</span>
          <strong>{stats.advice.length}</strong>
          <p>右侧已生成针对性建议</p>
        </section>
      </div>

      <div class="layout">
        <div class="cards">
          {#if items.length === 0}
            <div class="empty">
              <strong>当前还没有错题记录</strong>
              <span>先升级做题再回来查看吧，新的问题会按题源自动归档到这里。</span>
            </div>
          {:else}
            {#each items as item, itemIndex (item.id)}
              <article class={`wrong-card ${getItemTone(item)}`}>
                <div class="card-topline">
                  <span class="pill">错题 #{itemIndex + 1}</span>
                  <span class="source-pill">{getSourceLabel(item)}</span>
                </div>

                <div class="card-head">
                  <div class="severity-mark" aria-hidden="true">!</div>
                  <div class="card-head-copy">
                    <strong>错了 {item.wrong_count} 次</strong>
                    <span>连续答对进度：{item.consecutive_correct_count}/2</span>
                  </div>
                </div>

                <div class="question">{item.question}</div>

                <div class="answer-grid">
                  <div class="answer-box user">
                    <span>你当时选了</span>
                    <strong>{item.last_user_answer}</strong>
                  </div>

                  <div class="answer-box correct">
                    <span>正确答案</span>
                    <strong>{item.correct_answer}</strong>
                  </div>
                </div>

                <div class="analysis-box">
                  <span>解析</span>
                  <p>{item.explanation}</p>
                </div>
              </article>
            {/each}
          {/if}
        </div>

        <aside class="analysis">
          <div class="sticky-scroll">
            <div class="section-head">
              <h3>错题分析</h3>
              <span>Battle Prep Notes</span>
            </div>

            <div class="stats-grid">
              <div class="stat-box">
                <span>错题总数</span>
                <strong>{stats.total}</strong>
              </div>
              <div class="stat-box">
                <span>反复错题</span>
                <strong>{stats.repeated}</strong>
              </div>
            </div>

            <div class="section">
              <div class="section-head compact-head">
                <h4>错题类型</h4>
                <span>Topic Map</span>
              </div>

              {#if stats.typeEntries.length === 0}
                <div class="empty-mini">暂时还没有可分析数据。</div>
              {:else}
                {#each stats.typeEntries as [type, count]}
                  <div class="row"><span>{type}</span><strong>{count}</strong></div>
                {/each}
              {/if}
            </div>

            <div class="section advice-section">
              <div class="section-head compact-head">
                <h4>学习建议</h4>
                <span>Route Tips</span>
              </div>
              <ul>
                {#each stats.advice as line}
                  <li>{line}</li>
                {/each}
              </ul>
            </div>
          </div>
        </aside>
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 155;
    display: grid;
    place-items: center;
    padding: 20px;
    background: rgba(39, 28, 19, 0.3);
    backdrop-filter: blur(5px);
  }

  .panel {
    --prep-bg: #fffaf4;
    --prep-bg-soft: #fffdf9;
    --prep-border: #e3d5c7;
    --prep-text: #5b4837;
    --prep-text-soft: #7b6756;
    width: min(1240px, calc(100vw - 40px));
    max-height: min(88dvh, 940px);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    background: var(--prep-bg);
    border: 1px solid var(--prep-border);
    border-radius: 28px;
    padding: 18px;
    box-shadow: 0 24px 60px rgba(54, 41, 30, 0.16);
  }

  .header,
  .section-head,
  .card-topline,
  .card-head,
  .answer-grid,
  .actions,
  .stats-grid,
  .top-strip,
  .layout {
    display: grid;
  }

  .header {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 14px;
    align-items: start;
    margin-bottom: 14px;
  }

  .header-copy {
    display: grid;
    gap: 8px;
  }

  .eyebrow,
  .banner-tag,
  .pill,
  .source-pill {
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

  .header h2,
  .section-head h3,
  .section-head h4,
  .wrong-card strong,
  .question,
  .answer-box strong {
    color: var(--prep-text);
  }

  .header h2 {
    margin: 0;
    font-size: clamp(28px, 3.8vw, 38px);
  }

  .header p,
  .wrong-card span,
  .analysis-box p,
  .row span,
  .empty span,
  ul {
    margin: 0;
    color: var(--prep-text-soft);
    line-height: 1.7;
  }

  .actions {
    grid-auto-flow: column;
    gap: 10px;
    align-items: start;
  }

  .primary,
  .secondary {
    border-radius: 14px;
    padding: 10px 14px;
    font-weight: 800;
    cursor: pointer;
  }

  .primary {
    border: 1px solid #b69b7c;
    background: #fff8ef;
    color: #5a4736;
  }

  .secondary {
    border: 1px solid #ead6bf;
    background: #fff;
    color: #8b5e3c;
  }

  .top-strip {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
    margin-bottom: 14px;
  }

  .stat-banner,
  .wrong-card,
  .sticky-scroll,
  .stat-box,
  .section,
  .empty,
  .empty-mini,
  .answer-box,
  .analysis-box {
    border-radius: 20px;
    border: 1px solid var(--prep-border);
    background: var(--prep-bg-soft);
  }

  .stat-banner {
    padding: 14px;
    display: grid;
    gap: 6px;
  }

  .stat-banner.accent {
    background: linear-gradient(180deg, #fff8ed, var(--prep-bg-soft));
    border-color: #edcf9c;
  }

  .banner-tag,
  .pill,
  .source-pill {
    padding: 6px 10px;
  }

  .banner-tag,
  .source-pill {
    background: rgba(244, 237, 228, 0.96);
    color: #7b6756;
  }

  .stat-banner strong,
  .stat-box strong {
    font-size: clamp(28px, 4vw, 40px);
    line-height: 1;
  }

  .layout {
    grid-template-columns: 1.65fr 0.95fr;
    gap: 16px;
    min-height: 0;
    flex: 1;
  }

  .cards {
    min-height: 0;
    overflow: auto;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    align-content: start;
    padding-right: 4px;
  }

  .wrong-card {
    display: grid;
    gap: 12px;
    padding: 14px;
    box-shadow: 0 8px 18px rgba(98, 79, 59, 0.06);
  }

  .wrong-card.warning {
    border-color: #edcf9c;
    background: linear-gradient(180deg, #fff8ed, var(--prep-bg-soft));
  }

  .wrong-card.danger {
    border-color: #efc7b8;
    background: linear-gradient(180deg, #fff7f4, var(--prep-bg-soft));
  }

  .card-topline,
  .answer-grid,
  .stats-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .pill {
    background: #fde7e7;
    color: #a14b4b;
  }

  .card-head {
    grid-template-columns: 50px minmax(0, 1fr);
    gap: 12px;
    align-items: center;
  }

  .severity-mark {
    width: 50px;
    height: 50px;
    display: grid;
    place-items: center;
    border-radius: 18px;
    background: rgba(255, 241, 215, 0.92);
    border: 1px solid rgba(237, 205, 154, 0.92);
    color: #9a5c0e;
    font-size: 24px;
    font-weight: 900;
  }

  .question {
    font-size: 17px;
    line-height: 1.65;
    min-height: 92px;
  }

  .answer-box,
  .analysis-box,
  .stat-box,
  .section {
    padding: 12px;
  }

  .answer-box,
  .analysis-box {
    display: grid;
    gap: 6px;
  }

  .answer-box span,
  .analysis-box span,
  .stat-box span,
  .row span,
  .empty-mini,
  .compact-head span {
    color: #8b7767;
  }

  .answer-box.user {
    background: #fff7ef;
  }

  .answer-box.correct {
    background: #f3fbf4;
  }

  .analysis {
    min-height: 0;
  }

  .sticky-scroll {
    height: 100%;
    overflow: auto;
    padding: 16px;
  }

  .section-head {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 10px;
    align-items: baseline;
  }

  .section-head h3,
  .section-head h4 {
    margin: 0;
  }

  .compact-head {
    margin-bottom: 10px;
  }

  .stat-box strong,
  .row strong {
    color: var(--prep-text);
  }

  .section {
    margin-top: 12px;
  }

  .row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 0;
    border-bottom: 1px dashed #ebdfd0;
  }

  .row:last-child {
    border-bottom: 0;
  }

  ul {
    padding-left: 18px;
  }

  .advice-section li + li {
    margin-top: 8px;
  }

  .empty,
  .empty-mini {
    display: grid;
    place-items: center;
    text-align: center;
  }

  .empty {
    min-height: 240px;
    gap: 8px;
    padding: 18px;
  }

  .empty strong {
    color: var(--prep-text);
    font-size: 20px;
  }

  .empty-mini {
    min-height: 120px;
  }

  @media (max-width: 980px) {
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

    .top-strip,
    .layout,
    .cards,
    .card-topline,
    .answer-grid {
      grid-template-columns: 1fr;
    }

    .header {
      grid-template-columns: 1fr;
    }

    .actions {
      grid-auto-flow: row;
    }

    .primary,
    .secondary {
      width: 100%;
    }

    .question {
      min-height: auto;
      font-size: 16px;
    }
  }
</style>
