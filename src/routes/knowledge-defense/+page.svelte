<script lang="ts">
  import KnowledgeDefenseGame from '$lib/features/knowledge-defense/ui/KnowledgeDefenseGame.svelte';
</script>

<div class="knowledge-defense-route">
  <KnowledgeDefenseGame />
</div>

<style>
  .knowledge-defense-route {
    width: 100%;
    min-height: 100dvh;
  }

  :global(main) {
    width: 100%;
    max-width: none !important;
    padding: 0 !important;
  }

  :global(.content) {
    max-width: none !important;
  }
</style>
