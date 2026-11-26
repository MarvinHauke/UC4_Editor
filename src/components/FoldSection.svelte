<script lang="ts">
  // A Connections section that folds to its heading line (plan 0008 decision 24). Folded or open is remembered per viewer;
  // it opens by itself when `attention` turns true (a connection problem, a waiting dump) and the user can fold it again.
  import type { Snippet } from 'svelte';
  import { loadOpen, saveOpen } from '../app/foldState.ts';

  interface Props {
    id: string; title: string; summary?: string; attention?: boolean; children: Snippet;
    /** Starts open until the user folds it (the monitor). */
    defaultOpen?: boolean;
    /** Takes the height left in a column (the body fills it and only its inside scrolls). */
    fill?: boolean;
    /** A control on the heading line, beside the fold button (the monitor's Follow switch). */
    extra?: Snippet;
    /** Shown under the heading even while folded (the monitor's switch offer). */
    below?: Snippet;
  }
  let { id, title, summary = '', attention = false, children, defaultOpen = false, fill = false, extra, below }: Props = $props();
  // svelte-ignore state_referenced_locally
  let open = $state(loadOpen(id, undefined, defaultOpen));
  $effect(() => { if (attention) open = true; });
  function toggle(): void { open = !open; saveOpen(id, open); }
</script>

<div class="fold" class:fill={fill && open}>
  <h3>
    <button type="button" aria-expanded={open} data-help={open ? `Fold ${title}` : `Open ${title}`} onclick={toggle}>
      <span class="chev" aria-hidden="true">{open ? '▾' : '▸'}</span>
      <span class="title">{title}</span>
      {#if !open && summary}<span class="sum">{summary}</span>{/if}
    </button>
    {#if extra}{@render extra()}{/if}
  </h3>
  {#if below}{@render below()}{/if}
  {#if open}<div class="body">{@render children()}</div>{/if}
</div>

<style>
  .fold { margin-top: var(--space-1); }
  h3 { display: flex; align-items: center; gap: var(--space-3); margin: 0; font-size: var(--text-md); }
  .fold.fill { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 180px; }
  .fill .body { display: flex; flex-direction: column; flex: 1 1 0; min-height: 0; }
  h3 > button:first-child { display: flex; align-items: center; gap: var(--space-2); flex: 1; min-width: 0; min-height: var(--target); padding: 0 var(--space-2); font: inherit; text-align: left; color: var(--text); background: transparent; border: 1px solid transparent; border-radius: var(--radius); cursor: pointer; }
  h3 > button:first-child:hover { background: var(--accent-soft); }
  h3 > button:first-child:focus-visible { outline: none; border-color: var(--accent); box-shadow: var(--focus-ring); }
  .chev { flex: none; width: 1ch; color: var(--text-muted); }
  .title { font-weight: 600; }
  .sum { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: right; font-size: var(--text-sm); font-weight: 400; color: var(--text-muted); }
  .body { padding: var(--space-1) var(--space-2) var(--space-2); }
</style>
