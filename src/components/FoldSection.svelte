<script lang="ts">
  // A Connections section that folds to its heading line (plan 0008 decision 24). Folded or open is remembered per viewer;
  // it opens by itself when `attention` turns true (a connection problem, a waiting dump) and the user can fold it again.
  import type { Snippet } from 'svelte';
  import { loadOpen, saveOpen } from '../app/foldState.ts';

  let { id, title, summary = '', attention = false, children }: { id: string; title: string; summary?: string; attention?: boolean; children: Snippet } = $props();
  // svelte-ignore state_referenced_locally
  let open = $state(loadOpen(id));
  $effect(() => { if (attention) open = true; });
  function toggle(): void { open = !open; saveOpen(id, open); }
</script>

<div class="fold">
  <h3>
    <button type="button" aria-expanded={open} data-help={open ? `Fold ${title}` : `Open ${title}`} onclick={toggle}>
      <span class="chev" aria-hidden="true">{open ? '▾' : '▸'}</span>
      <span class="title">{title}</span>
      {#if !open && summary}<span class="sum">{summary}</span>{/if}
    </button>
  </h3>
  {#if open}<div class="body">{@render children()}</div>{/if}
</div>

<style>
  .fold { margin-top: var(--space-1); }
  h3 { margin: 0; font-size: var(--text-md); }
  button { display: flex; align-items: center; gap: var(--space-2); width: 100%; min-height: var(--target); padding: 0 var(--space-2); font: inherit; text-align: left; color: var(--text); background: transparent; border: 1px solid transparent; border-radius: var(--radius); cursor: pointer; }
  button:hover { background: var(--accent-soft); }
  button:focus-visible { outline: none; border-color: var(--accent); box-shadow: var(--focus-ring); }
  .chev { flex: none; width: 1ch; color: var(--text-muted); }
  .title { font-weight: 600; }
  .sum { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: right; font-size: var(--text-sm); font-weight: 400; color: var(--text-muted); }
  .body { padding: var(--space-1) var(--space-2) var(--space-2); }
</style>
