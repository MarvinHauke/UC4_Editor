<script lang="ts">
  // One entry of the Warnings dialog (plan 0008 decisions 31, 35): the message, and the actions in three fixed columns:
  // Show · Solution (one pick per control; a pick only plans, the Changes table applies) · Ignore (the pressed "Ignored" counts it
  // again on a click). A row without one leaves its column empty.
  import { keepChannel } from '../app/warningList.ts';
  import type { ResolveOption } from '../app/resolveView.ts';

  interface Props {
    problem?: boolean;
    /** The setup's name above the message (scope "all setups"). */
    where?: string;
    message: string;
    options: ResolveOption[];
    /** The choice this row has planned, or null. */
    picked?: number | null;
    quiet?: boolean;
    /** 'open': Ignore · 'ignored': the pressed Ignored · 'none': no button (problems). */
    ignore?: 'open' | 'ignored' | 'none';
    showHelp: string;
    onshow: () => void;
    onpick: (choice: number) => void;
    onignore?: () => void;
  }
  let { problem = false, where, message, options, picked = null, quiet = false, ignore = 'none', showHelp, onshow, onpick, onignore }: Props = $props();
  const reasons = $derived(options.filter((o) => !o.ok));
</script>

<li class="entry" class:problem class:quiet>
  <span class="mark" aria-hidden="true">{problem ? '●' : '▲'}</span>
  <span class="text">
    {#if problem}<span class="what">Problem</span>{/if}
    {#if where}<span class="where">{where}</span>{/if}
    <span class="msg">{keepChannel(message)}</span>
    {#each reasons as o (o.choice)}<span class="reason">{keepChannel(o.label)}</span>{/each}
  </span>
  <span class="actions">
    <button type="button" class="c1" onclick={onshow} data-help={showHelp}>Show</button>
    <span class="c2 solutions">
      {#each options.filter((o) => o.ok) as o (o.choice)}
        <button type="button" class:on={picked === o.choice} aria-pressed={picked === o.choice} onclick={() => { onpick(o.choice); }}
          data-help={picked === o.choice ? `Planned: ${o.label} · click to take it back · Apply in the Changes table below` : `Solution: ${o.label} · adds it to the Changes table below; nothing changes until Apply`}>{keepChannel(o.label)}</button>
      {/each}
    </span>
    {#if ignore === 'open'}
      <button type="button" class="c3" onclick={onignore} data-help="Ignore: accept this warning; it moves to Ignored and stops counting until one of the two controls changes · Undo brings it back">Ignore</button>
    {:else if ignore === 'ignored'}
      <button type="button" class="c3 on" aria-pressed="true" onclick={onignore} data-help="Ignored: this warning does not count · click to count it again">Ignored</button>
    {/if}
  </span>
</li>

<style>
  button { min-height: var(--target); padding: 0 var(--space-2); font: inherit; color: var(--text); background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius); cursor: pointer; }
  button:hover:not(:disabled) { background: var(--accent-soft); }
  button:focus-visible { outline: none; border-color: var(--accent); box-shadow: var(--focus-ring); }
  button.on { color: var(--on-accent); background: var(--accent); border-color: var(--accent); }
  .entry { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-2) var(--space-3); border-bottom: 1px solid var(--border); }
  .mark { flex: none; width: 1em; color: var(--warn); }
  .problem .mark { color: var(--danger); }
  .text { flex: 1; min-width: 0; display: flex; flex-wrap: wrap; align-items: baseline; column-gap: var(--space-2); overflow-wrap: anywhere; }
  .msg { flex: 1 1 100%; }
  .quiet .text { color: var(--text-muted); }
  .what { font-weight: 600; color: var(--danger); }
  .where, .reason { font-size: var(--text-sm); color: var(--text-muted); }
  .reason { flex: 1 1 100%; }
  /* Three fixed columns, so Show, Solution and Ignore stand at the same x in every row; the solutions stack inside theirs. */
  .actions { flex: none; display: grid; grid-template-columns: 4.5em 10em 6em; gap: var(--space-2); align-items: center; }
  .actions button { min-width: 0; width: 100%; white-space: nowrap; }
  .solutions { display: flex; flex-direction: column; gap: var(--space-1); }
  .c1 { grid-column: 1; } .c2 { grid-column: 2; } .c3 { grid-column: 3; }
</style>
