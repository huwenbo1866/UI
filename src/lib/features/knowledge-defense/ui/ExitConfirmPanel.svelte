<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let visible = false;
  export let title = '确认退出';
  export let description = '退出后将返回启动页，本局未完成的战斗会中断。';
  export let confirmText = '确定';
  export let cancelText = '继续游戏';

  const dispatch = createEventDispatcher<{ confirm: void; cancel: void }>();
</script>

{#if visible}
  <div class="overlay" on:click={() => dispatch('cancel')}>
    <div class="panel" on:click|stopPropagation>
      <h2>{title}</h2>
      <p>{description}</p>
      <div class="actions">
        <button class="secondary" on:click={() => dispatch('cancel')}>{cancelText}</button>
        <button class="primary" on:click={() => dispatch('confirm')}>{confirmText}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: absolute;
    inset: 0;
    z-index: 165;
    display: grid;
    place-items: center;
    padding: 24px;
    background: rgba(39, 28, 19, 0.36);
    backdrop-filter: blur(5px);
  }

  .panel {
    width: min(460px, calc(100vw - 48px));
    background: #fffaf4;
    border: 1px solid #e6d7c7;
    border-radius: 28px;
    padding: 24px;
    box-shadow: 0 24px 60px rgba(54, 41, 30, 0.18);
  }

  h2 {
    margin: 0 0 12px;
    font-size: 30px;
    color: #5b4837;
  }

  p {
    margin: 0;
    color: #7b6756;
    line-height: 1.75;
  }

  .actions {
    margin-top: 22px;
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    flex-wrap: wrap;
  }

  button {
    border-radius: 16px;
    padding: 12px 16px;
    font-weight: 800;
    cursor: pointer;
  }

  .primary {
    border: 1px solid #f59e0b;
    background: linear-gradient(180deg, #fbbf24, #f59e0b);
    color: #fff;
  }

  .secondary {
    border: 1px solid #b69b7c;
    background: #fff8ef;
    color: #5a4736;
  }
</style>
