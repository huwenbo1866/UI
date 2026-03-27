<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher<{ exit: void }>();

  function exit() {
    dispatch('exit');
  }
</script>

<div class="hud">
  <button type="button" class="exit" aria-label="退出本局" on:click={exit}>
    ←
  </button>
</div>

<style>
  .hud {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .exit {
    pointer-events: auto;
    position: absolute;
    top: 20px;
    left: 20px;
    z-index: 30;
    width: 46px;
    height: 46px;
    border-radius: 14px;
    border: 1px solid #d9c7b3;
    background: rgba(255, 250, 244, 0.96);
    color: #5d4936;
    box-shadow: 0 10px 22px rgba(66, 48, 31, 0.14);
    cursor: pointer;
    font-size: 18px;
    font-weight: 800;
  }
</style>
