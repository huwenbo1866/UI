<script lang="ts">
  import KnowledgeDefenseGame from '$lib/components/knowledge-defense/KnowledgeDefenseGame.svelte';
  import { samplePack } from '$lib/components/knowledge-defense/samplePack';
  import type { FinishStats } from '$lib/components/knowledge-defense/types';

  let lastResult: FinishStats | null = null;

  function handleFinish(event: CustomEvent<FinishStats>) {
    lastResult = event.detail;
  }
</script>

<svelte:head>
  <title>知识闯关 - 小玲</title>
</svelte:head>

<div class="page-shell">
  <KnowledgeDefenseGame pack={samplePack} attackMode="straight" on:finish={handleFinish} />
</div>

<style>
  :global(html), :global(body) {
    height: 100%;
  }

  .page-shell {
    padding: 10px 12px 14px;
    height: calc(100vh - 64px);
    min-height: calc(100vh - 64px);
    box-sizing: border-box;
  }

  @media (max-width: 768px) {
    .page-shell {
      padding: 6px;
      height: calc(100vh - 52px);
      min-height: calc(100vh - 52px);
    }
  }
</style>
