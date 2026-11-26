<script lang="ts">
  // Copy, Paste and "Cancel" for one level (plan 0006 decisions 30–34): the buttons say only Copy and Paste.
  // Paste shows while a copy of this level is held; it is off when the target is the copied item itself.
  interface Props { level: string; holding: boolean; canCopy: boolean; canPaste: boolean; onCopy: () => void; onPaste: () => void; onStop: () => void; what: string }
  let { level, holding, canCopy, canPaste, onCopy, onPaste, onStop, what }: Props = $props();
</script>

<div class="bar" role="group" aria-label="Copy and Paste, {level}">
  <button type="button" disabled={!canCopy} onclick={onCopy} data-help="Copy {what}: a snapshot of now · Cmd-C">Copy</button>
  {#if holding}
    <button type="button" disabled={!canPaste} onclick={onPaste} data-help="Paste the copied {level} onto {what}, one undo step · Cmd-V">Paste</button>
    <button type="button" class="stop" onclick={onStop} data-help="Cancel pasting: forget the copy · Esc">Cancel</button>
  {/if}
</div>

<style>
  .bar { display: flex; flex-wrap: nowrap; flex: none; margin-left: auto; gap: var(--space-2); }
  button { white-space: nowrap; min-height: var(--target); padding: 0 var(--space-3); font: inherit; color: var(--text); background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius); cursor: pointer; }
  button:hover:not(:disabled) { background: var(--accent-soft); }
  button:disabled { color: var(--text-muted); cursor: not-allowed; }
  button:focus-visible { outline: none; border-color: var(--accent); box-shadow: var(--focus-ring); }
  .stop { color: var(--text-muted); }
</style>
