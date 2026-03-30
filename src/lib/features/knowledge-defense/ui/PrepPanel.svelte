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
</script>

{#if visible}
  <div class="overlay" on:click={close}>
    <div class="panel" on:click|stopPropagation>
      <div class="header">
        <div>
          <h2>备战区 · 错题回看</h2>
          <p>这里保留你近期错题、错误次数与解析，并根据错题情况给出针对性建议。</p>
        </div>
        <div class="actions">
          {#if onClear}
            <button class="secondary" on:click={onClear}>清空记录</button>
          {/if}
          <button class="primary" on:click={close}>关闭</button>
        </div>
      </div>

      <div class="layout">
        <div class="cards">
          {#if items.length === 0}
            <div class="empty">当前还没有错题记录，先升级做题再回来查看吧。</div>
          {:else}
            {#each items as item (item.id)}
              <article class="wrong-card">
                <div class="pill">错题</div>
                <div class="times">错了 {item.wrong_count} 次</div>
                <div class="question">{item.question}</div>
                <div class="meta"><strong>你当时选了：</strong> {item.last_user_answer}</div>
                <div class="meta"><strong>正确答案：</strong> {item.correct_answer}</div>
                <div class="meta"><strong>解析：</strong> {item.explanation}</div>
                <div class="meta subtle">连续答对进度：{item.consecutive_correct_count}/2</div>
              </article>
            {/each}
          {/if}
        </div>

        <aside class="analysis">
          <div class="sticky-scroll">
            <h3>错题分析</h3>
            <div class="stats-grid">
              <div class="stat-box"><span>错题总数</span><strong>{stats.total}</strong></div>
              <div class="stat-box"><span>反复错题</span><strong>{stats.repeated}</strong></div>
            </div>

            <div class="section">
              <h4>错题类型</h4>
              {#if stats.typeEntries.length === 0}
                <div class="empty-mini">暂时还没有可分析数据。</div>
              {:else}
                {#each stats.typeEntries as [type, count]}
                  <div class="row"><span>{type}</span><strong>{count}</strong></div>
                {/each}
              {/if}
            </div>

            <div class="section">
              <h4>学习建议</h4>
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
    padding: 24px;
    background: rgba(39, 28, 19, 0.28);
    backdrop-filter: blur(4px);
  }

  .panel {
    width: min(1220px, calc(100vw - 48px));
    max-height: min(86dvh, 920px);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    background: #fffaf4;
    border: 1px solid #e3d5c7;
    border-radius: 28px;
    padding: 20px;
    box-shadow: 0 24px 60px rgba(54, 41, 30, 0.16);
  }

  .header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 16px;
  }

  .header h2 {
    margin: 0;
    font-size: 28px;
    color: #5b4837;
  }

  .header p {
    margin: 8px 0 0;
    color: #7b6756;
  }

  .actions {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }

  .primary,
  .secondary {
    border-radius: 14px;
    padding: 10px 14px;
    font-weight: 700;
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

  .layout {
    display: grid;
    grid-template-columns: 1.75fr 0.95fr;
    gap: 18px;
    min-height: 0;
    flex: 1;
  }

  .cards {
    min-height: 0;
    overflow: auto;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
    align-content: start;
    padding-right: 4px;
  }

  .wrong-card {
    position: relative;
    background: #fffdf9;
    border: 1px solid #ecdccb;
    border-radius: 20px;
    padding: 16px;
    box-shadow: 0 8px 18px rgba(98,79,59,0.06);
  }

  .pill {
    display: inline-flex;
    padding: 6px 10px;
    border-radius: 999px;
    background: #fde7e7;
    color: #a14b4b;
    font-size: 12px;
    font-weight: 700;
  }

  .times {
    position: absolute;
    right: 16px;
    top: 16px;
    color: #7d6858;
    font-weight: 700;
  }

  .question {
    margin-top: 14px;
    font-size: 18px;
    line-height: 1.6;
    color: #4e3c2e;
    min-height: 86px;
  }

  .meta {
    margin-top: 10px;
    color: #6e5c4c;
    line-height: 1.6;
  }

  .subtle { color: #907b6a; }

  .analysis {
    min-height: 0;
  }

  .sticky-scroll {
    height: 100%;
    overflow: auto;
    background: #fffdf9;
    border: 1px solid #ecdccb;
    border-radius: 20px;
    padding: 16px;
  }

  .sticky-scroll h3 {
    margin: 0 0 12px;
    color: #5b4837;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .stat-box,
  .section,
  .empty {
    border-radius: 16px;
    border: 1px solid #ecdccb;
    background: #fffaf4;
    padding: 14px;
  }

  .stat-box span,
  .row span,
  .section h4,
  .empty-mini { color: #8b7767; }
  .stat-box strong,
  .row strong { color: #4e3c2e; font-size: 28px; }

  .section { margin-top: 12px; }
  .section h4 { margin: 0 0 10px; }
  .row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 0;
    border-bottom: 1px dashed #ebdfd0;
  }
  .row:last-child { border-bottom: 0; }
  ul {
    margin: 0;
    padding-left: 18px;
    color: #6e5c4c;
    line-height: 1.8;
  }

  .empty,
  .empty-mini {
    display: grid;
    place-items: center;
    color: #7b6756;
    min-height: 160px;
  }

  @media (max-width: 980px) {
    .overlay {
      padding: 14px;
      align-items: end;
    }

    .panel {
      width: 100%;
      max-height: 92dvh;
      border-radius: 22px 22px 0 0;
      padding: 14px;
    }

    .header h2 {
      font-size: 22px;
    }

    .layout {
      grid-template-columns: 1fr;
    }

    .cards {
      grid-template-columns: 1fr;
    }

    .question {
      min-height: auto;
      font-size: 16px;
    }
  }
</style>
