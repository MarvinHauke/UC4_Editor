<script lang="ts">
  // The small card in the middle of the device view while a guide is on: the question and Cancel · Send/Restore
  // (plan 0005 decision 35). Focus starts on Cancel; Esc is handled by the dialog that owns the guide.
  import type { GuideCard } from '../app/guide.ts';
  let { card }: { card: GuideCard } = $props();
  function start(node: HTMLButtonElement): void { node.focus(); }
</script>

<div class="ui-card card" role="group" aria-label="Send">
  <p>{card.text}</p>
  <div class="buttons">
    <button type="button" use:start onclick={() => { card.oncancel(); }}>Cancel</button>
    <button type="button" class="go" disabled={!card.canConfirm} onclick={() => { card.onconfirm(); }}
      data-help={card.canConfirm ? `${card.confirmLabel}: sends to the UC4 now · UC4: put it in receive mode first` : 'Not possible now: the UC4 is not connected'}>{card.confirmLabel}</button>
  </div>
</div>

<style>
  .card { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 3; width: min(280px, 92%); padding: var(--space-4); }
  p { margin: 0 0 var(--space-3); font-size: var(--text-lg); font-weight: 600; color: var(--text); }
  .buttons { display: flex; justify-content: flex-end; gap: var(--space-2); }
</style>
