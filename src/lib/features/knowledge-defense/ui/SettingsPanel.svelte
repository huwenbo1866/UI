<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { AttackPreference } from '../core/types';

  export type KnowledgeBaseOption = { id: string; name: string };
  export type KnowledgeFileOption = { id: string; name: string };
  export type ChapterHomeworkOption = {
    id: string;
    chapter_title: string;
    question_count: number;
  };

  export let visible = false;
  export let attackPreference: AttackPreference = 'straight';

  export let loadingKnowledgeBases = false;
  export let loadingKnowledgeFiles = false;
  export let loadingChapterHomeworks = false;

  export let knowledgeBases: KnowledgeBaseOption[] = [];
  export let knowledgeFiles: KnowledgeFileOption[] = [];
  export let chapterHomeworks: ChapterHomeworkOption[] = [];

  export let selectedKnowledgeId = '';
  export let selectedFileId = '';
  export let selectedHomeworkId = '';
  export let usingSampleFallback = true;

  const dispatch = createEventDispatcher<{
    close: void;
    changePreference: { value: AttackPreference };
    changeKnowledge: { value: string };
    changeFile: { value: string };
    changeChapterHomework: { value: string };
  }>();

  function close() {
    dispatch('close');
  }
</script>

{#if visible}
  <div class="overlay" on:click={close}>
    <div class="panel" on:click|stopPropagation>
      <div class="header">
        <div>
          <h2>设置</h2>
          <p>可切换攻击模式，并选择知识库文件章节作业作为闯关题源；加载失败时自动回退 sample_pack。</p>
        </div>
        <button class="close" on:click={close}>关闭</button>
      </div>

      <div class="section">
        <h3>常规攻击模式</h3>
        <div class="options">
          <button
            class:selected={attackPreference === 'straight'}
            on:click={() => dispatch('changePreference', { value: 'straight' })}
          >
            <strong>直线发射</strong>
            <span>平时自动攻击为单发直射；升级武器强化只会出现 4 连发直射。</span>
          </button>

          <button
            class:selected={attackPreference === 'scatter'}
            on:click={() => dispatch('changePreference', { value: 'scatter' })}
          >
            <strong>散射</strong>
            <span>平时自动攻击为 3 发散射；升级武器强化只会出现 7 发散射。</span>
          </button>
        </div>
      </div>

      <div class="section">
        <h3>题目来源（知识库章节作业）</h3>
        <div class="field-grid">
          <label>
            <span>知识库</span>
            <select
              value={selectedKnowledgeId}
              disabled={loadingKnowledgeBases}
              aria-label="选择知识库"
              on:change={(event) =>
                dispatch('changeKnowledge', {
                  value: (event.currentTarget as HTMLSelectElement).value
                })}
            >
              <option value="">{loadingKnowledgeBases ? '知识库加载中...' : '选择知识库'}</option>
              {#each knowledgeBases as kb}
                <option value={kb.id}>{kb.name}</option>
              {/each}
            </select>
          </label>

          <label>
            <span>文件</span>
            <select
              value={selectedFileId}
              disabled={!selectedKnowledgeId || loadingKnowledgeFiles}
              aria-label="选择知识库文件"
              on:change={(event) =>
                dispatch('changeFile', {
                  value: (event.currentTarget as HTMLSelectElement).value
                })}
            >
              <option value="">{loadingKnowledgeFiles ? '文件加载中...' : '选择文件'}</option>
              {#each knowledgeFiles as file}
                <option value={file.id}>{file.name}</option>
              {/each}
            </select>
          </label>

          <label>
            <span>章节作业</span>
            <select
              value={selectedHomeworkId}
              disabled={!selectedFileId || loadingChapterHomeworks}
              aria-label="选择章节作业"
              on:change={(event) =>
                dispatch('changeChapterHomework', {
                  value: (event.currentTarget as HTMLSelectElement).value
                })}
            >
              <option value="">{loadingChapterHomeworks ? '章节作业加载中...' : '选择章节作业'}</option>
              {#each chapterHomeworks as hw}
                <option value={hw.id}>{hw.chapter_title}（{hw.question_count}题）</option>
              {/each}
            </select>
          </label>
        </div>

        <p class="source-tip" class:fallback={usingSampleFallback}>
          {#if usingSampleFallback}
            当前使用 sample_pack（知识库题源不可用时自动回退）
          {:else}
            当前使用知识库章节作业题源
          {/if}
        </p>
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: absolute;
    inset: 0;
    z-index: 160;
    display: grid;
    place-items: center;
    padding: 24px;
    background: rgba(39, 28, 19, 0.28);
    backdrop-filter: blur(3px);
  }
  .panel {
    width: min(760px, calc(100vw - 48px));
    background: #fffaf4;
    border: 1px solid #e3d5c7;
    border-radius: 28px;
    padding: 20px;
    box-shadow: 0 24px 60px rgba(54, 41, 30, 0.16);
  }
  .header {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: flex-start;
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
  .section { margin-top: 18px; }
  .section h3 { margin: 0 0 12px; color: #5b4837; }
  .options { display: grid; gap: 12px; }
  .options button {
    display: grid;
    gap: 8px;
    text-align: left;
    border-radius: 18px;
    border: 1px solid #e4d6c8;
    background: #fffdfa;
    padding: 16px;
    cursor: pointer;
    color: #5b4837;
  }
  .options button span { color: #7b6756; line-height: 1.6; }
  .options button.selected {
    border-color: #f59e0b;
    background: #fff7ed;
    box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.12);
  }

  .field-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }
  .field-grid label {
    display: grid;
    gap: 6px;
    color: #6b5848;
    font-size: 13px;
  }
  .field-grid select {
    border: 1px solid #ddccb8;
    border-radius: 12px;
    padding: 8px 10px;
    background: #fffdfa;
    color: #4f3d2f;
    min-width: 0;
  }
  .source-tip {
    margin: 10px 0 0;
    color: #5a4736;
    font-size: 13px;
  }
  .source-tip.fallback {
    color: #a16207;
  }
</style>