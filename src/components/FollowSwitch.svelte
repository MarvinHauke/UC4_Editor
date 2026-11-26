<script lang="ts">
  // The Follow switch in the monitor heading (plan 0008 decision 25): while on, a message from the UC4 selects the control it
  // belongs to. A toggle button: pressed looks pressed (accent fill), as the other toggles do.
  import { useFollow } from '../app/followState.svelte.ts';
  const follow = useFollow();
</script>

<button type="button" class="follow" class:on={follow.on} aria-pressed={follow.on}
  data-help={follow.on ? 'Follow is on: a message from the UC4 selects its control (not an undo step) · paused while you type in a property field · click to turn off' : 'Follow: when on, a message from the UC4 selects its control in the editor · remembered in this browser'}
  onclick={() => { follow.set(!follow.on); }}>Follow</button>

<style>
  .follow { flex: none; min-width: 64px; min-height: var(--target); padding: 3px var(--space-3); font: inherit; font-size: var(--text-md); font-weight: 400; color: var(--text); background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius); cursor: pointer; }
  .follow:hover { background: var(--accent-soft); }
  .follow.on { color: var(--on-accent); background: var(--accent); border-color: var(--accent); }
  .follow:focus-visible { outline: none; border-color: var(--accent); box-shadow: var(--focus-ring); }
</style>
