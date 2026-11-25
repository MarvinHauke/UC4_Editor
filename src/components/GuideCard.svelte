<script lang="ts">
  // The small card in the middle of the device view while a guide is on: the question and Cancel · Send/Restore
  // (plan 0005 decision 35). Focus starts on Cancel; Esc is handled by the dialog that owns the guide.
  import type { GuideCard } from '../app/guide.ts';
  let { card }: { card: GuideCard } = $props();
  function start(node: HTMLButtonElement): void { node.focus(); }
</script>

<div class="card" role="group" aria-label="Send">
  <p>{card.text}</p>
  <div class="buttons">
    <button type="button" use:start onclick={() => { card.oncancel(); }}>Cancel</button>
    <button type="button" class="go" disabled={!card.canConfirm} onclick={() => { card.onconfirm(); }}
      data-help={card.canConfirm ? `${card.confirmLabel}: sends to the UC4 now · UC4: put it in receive mode first` : 'Not possible now: the UC4 is not connected'}>{card.confirmLabel}</button>
  </div>
</div>

<style>
  .card { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 3; box-sizing: border-box; width: min(280px, 92%); padding: var(--space-4); color: var(--text); background: var(--surface-2); border: 2px solid var(--accent); border-radius: var(--radius); box-shadow: 0 8px 28px rgb(0 0 0 / 55%); }
  p { margin: 0 0 var(--space-3); font-size: var(--text-lg); font-weight: 600; color: var(--text); }
  .buttons { display: flex; justify-content: flex-end; gap: var(--space-2); }
  button { min-height: var(--target); padding: 3px var(--space-3); font: inherit; color: var(--text); background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius); cursor: pointer; }
  button:hover:not(:disabled) { background: var(--accent-soft); }
  button:disabled { color: var(--text-muted); cursor: not-allowed; }
  button:focus-visible { outline: none; border-color: var(--accent); box-shadow: var(--focus-ring); }
  .go:not(:disabled) { color: var(--on-accent); background: var(--accent); border-color: var(--accent); font-weight: 600; }
  .go:hover:not(:disabled) { background: var(--accent); filter: brightness(1.1); }
</style>
