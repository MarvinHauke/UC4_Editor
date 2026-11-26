<script lang="ts">
  // The card of the "Send a dump from the UC4" guide (plan 0010 decision 6): choose One setup or All setups, see what it waits for, Close.
  // Focus starts on Close; Esc is handled by DumpGuide. The editor only listens here.
  import type { ListenCard } from '../app/guide.ts';
  let { card }: { card: ListenCard } = $props();
  function start(node: HTMLButtonElement): void { node.focus(); }
</script>

<div class="ui-card card" data-listen-card role="group" aria-label={card.title}>
  <p class="title">{card.title}</p>
  <div class="choices" role="radiogroup" aria-label="Which dump">
    {#each card.choices as c (c.value)}
      <button type="button" role="radio" aria-checked={card.choice === c.value} class:on={card.choice === c.value} data-help={c.help}
        onclick={() => { card.onchoose(c.value); }}>{c.label}</button>
    {/each}
  </div>
  <p class="status" aria-live="polite">{card.status}</p>
  <p class="note">{card.note}</p>
  <div class="buttons">
    {#if card.connectLabel}<button type="button" class="go" onclick={() => { card.onconnect(); }}>{card.connectLabel}</button>{/if}
    <button type="button" use:start onclick={() => { card.onclose(); }} data-help="Close · Esc · nothing was sent">Close</button>
  </div>
</div>

<style>
  .card { position: absolute; left: 50%; top: 46%; transform: translate(-50%, -50%); z-index: 3; width: min(340px, 94%); padding: var(--space-3); }
  .title { margin: 0 0 var(--space-2); font-size: var(--text-lg); font-weight: 600; }
  .status { margin: var(--space-2) 0 0; min-height: 2.6em; font-size: var(--text-md); color: var(--text-muted); overflow-wrap: anywhere; }
  .note { margin: 0 0 var(--space-2); font-size: var(--text-sm); color: var(--text-muted); }
  .choices { display: flex; gap: var(--space-2); }
  .choices button { flex: 1; white-space: nowrap; padding-inline: var(--space-2); }
  .buttons { display: flex; justify-content: flex-end; gap: var(--space-2); }
  .choices .on { border-color: var(--accent); background: var(--accent-soft); font-weight: 600; }
</style>
