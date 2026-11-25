<script lang="ts">
  // Received (plan 0005 decision 13): the dumps the UC4 sent, waiting for a decision. They never interrupt the work:
  // nothing changes until the user presses Review. Dismiss drops only the notice; the dump stays kept.
  import type { DumpNotice } from '../app/dumpNotices.ts';
  import { noticeText } from '../app/dumpNotices.ts';

  interface Props { queue: readonly DumpNotice[]; onreview: (n: DumpNotice) => void; onexport: (n: DumpNotice) => void; ondismiss: (n: DumpNotice) => void }
  let { queue, onreview, onexport, ondismiss }: Props = $props();
</script>

<ul role="status">
  {#each queue as n (n.dumpId)}
    <li class:bad={!!n.unreadable}
      data-help="Dump notice: {n.unreadable ? `the UC4 sent a dump the editor cannot read (${n.unreadable.reason}), kept as it came · ${n.unreadable.whatToDo}` : `the UC4 sent ${n.content}, kept, your work is unchanged · Review opens the import dialog`}{n.warnings.length ? ` ${n.warnings.join(' ')}` : ''}">
      <span class="text">{noticeText([n])}</span>
      <span class="actions">
        {#if n.unreadable}
          <button type="button" onclick={() => { onexport(n); }} data-help="Export .syx: the dump byte for byte as received">Export .syx</button>
        {:else}
          <button type="button" onclick={() => { onreview(n); }}>Review</button>
        {/if}
        <button type="button" onclick={() => { ondismiss(n); }}>Dismiss</button>
      </span>
    </li>
  {/each}
</ul>

<style>
  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-2); }
  li { padding: var(--space-2); background: var(--accent-soft); border: 1px solid var(--accent); border-radius: var(--radius); }
  li.bad { border-color: var(--danger); }
  .text { display: block; overflow-wrap: anywhere; }
  .actions { display: flex; gap: var(--space-2); margin-top: var(--space-1); }
  button { min-height: 24px; padding: 0 var(--space-2); font: inherit; font-size: var(--text-sm); background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius); cursor: pointer; }
  button:hover { background: var(--surface); }
  button:focus-visible { outline: none; border-color: var(--accent); box-shadow: var(--focus-ring); }
</style>
