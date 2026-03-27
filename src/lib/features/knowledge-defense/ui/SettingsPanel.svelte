<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { AttackPreference } from '../core/types';

  export let visible = false;
  export let attackPreference: AttackPreference = 'straight';

  const dispatch = createEventDispatcher<{
    close: void;
    changePreference: { value: AttackPreference };
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
          <p>第一轮先开放攻击模式设置。后续你可以继续把攻速、怪物强度、题目来源等都放进来。</p>
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
    width: min(720px, calc(100vw - 48px));
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
</style>
