<script lang="ts">
  // The switch offer (plan 0008 decision 6, step 4): "The UC4 seems to be on encoder group 3 — switch?". It sits in the Connections
  // column under the monitor's heading, next to the rows that are its evidence, and after Switch turns into "Switched to … · Back".
  // It never takes focus and never switches by itself. The box, with either button, means "don't ask again" until the tab closes.
  import { useSwitch } from '../app/switchNote.svelte.ts';

  const ui = useSwitch();
  let never = $state(false);
</script>

{#if ui.offer}
  <div class="strip offer" role="status" data-help="The editor never switches by itself: Switch shows the setup and groups the UC4's messages point to · No keeps what you have">
    <span class="text">{ui.offer.text}</span>
    <span class="row">
      <button type="button" class="yes" onclick={() => { ui.accept(never); }}>Switch</button>
      <button type="button" onclick={() => { ui.decline(never); }}>No</button>
      <label class="never" data-help="Don't ask again: no more offers until you close this tab; applies with either button"><input type="checkbox" bind:checked={never} />Don't ask again</label>
    </span>
  </div>
{:else if ui.note}
  <div class="strip" role="status" data-help="The editor switched as you asked · Back returns to the setup and groups you had">
    <span class="text">{ui.note.text}</span>
    <span class="row"><button type="button" onclick={() => { ui.back(); }}>Back</button></span>
  </div>
{/if}

<style>
  .strip { display: flex; flex-direction: column; gap: var(--space-2); margin: 0 0 var(--space-2); padding: var(--space-2) var(--space-3); background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius); font-size: var(--text-md); animation: in 160ms ease-out; }
  .offer { border-color: var(--accent); }
  @keyframes in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
  @media (prefers-reduced-motion: reduce) { .strip { animation: none; } }
  .row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-3); }
  button { min-height: var(--target); padding: 0 var(--space-3); font: inherit; color: var(--text); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); cursor: pointer; }
  button:hover { background: var(--accent-soft); }
  .yes { color: var(--on-accent); background: var(--accent); border-color: var(--accent); }
  .yes:hover { background: var(--accent); filter: brightness(1.1); }
  button:focus-visible, input:focus-visible { outline: none; border-color: var(--accent); box-shadow: var(--focus-ring); }
  .never { display: inline-flex; align-items: center; gap: var(--space-2); min-height: var(--target); color: var(--text-muted); font-size: var(--text-sm); cursor: pointer; }
  .never input { width: 16px; height: 16px; margin: 0; }
</style>
