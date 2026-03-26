<script lang="ts">
  import KnowledgeDefenseGame from '$lib/components/knowledge-defense/KnowledgeDefenseGame.svelte';
  import { samplePack } from '$lib/components/knowledge-defense/samplePack';
</script>

<svelte:head>
  <title>知识闯关 - 小玲</title>
</svelte:head>

<div class="page-shell">
  <KnowledgeDefenseGame pack={samplePack} sourceType="pack" sourceId={samplePack.id} />
</div>

<style>
  .page-shell {
    padding: 16px;
  }
</style>
