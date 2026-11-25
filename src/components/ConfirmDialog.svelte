<script lang="ts">
  // A modal confirmation in the page. Esc and Cancel leave everything as it is; focus starts on Cancel.
  import { onMount, tick } from 'svelte';
  import type { Confirm } from '../app/confirm.svelte.ts';

  let { confirm }: { confirm: Confirm } = $props();
  let dialog = $state<HTMLDialogElement | null>(null);
  const spec = $derived(confirm.current);
  let chosen = $state(1);
  $effect(() => { if (spec?.slots) chosen = spec.slots.initial; });
  const option = $derived(spec?.slots?.options.find((o) => o.slot === chosen));

  $effect(() => {
    if (spec && dialog && !dialog.open) dialog.showModal();
    else if (!spec && dialog?.open) dialog.close();
  });
  // A new question in the open dialog ("Export first" asks again): focus goes to its first button.
  $effect(() => {
    if (spec) void tick().then(() => { dialog?.querySelector('button')?.focus(); });
  });
  onMount(() => () => { if (dialog?.open) dialog.close(); });
</script>

<dialog bind:this={dialog} oncancel={(e) => { e.preventDefault(); confirm.cancel(); }} aria-labelledby="confirm-title">
  {#if spec}
    <h2 id="confirm-title">{spec.title}</h2>
    {#each spec.body as paragraph, i (i)}<p>{paragraph}</p>{/each}
    {#if spec.list}<ul class="fields">{#each spec.list as item, i (i)}<li>{item}</li>{/each}</ul>{/if}
    {#if spec.slots}
      <label class="slot">Slot
        <select bind:value={chosen}>
          {#each spec.slots.options as o (o.slot)}<option value={o.slot}>{o.label}</option>{/each}
        </select>
      </label>
      <p class="loss" class:none={!option?.replaces}>{option?.replaces ? `Replaces "${option.replaces}" in this slot.` : 'This slot is free; nothing is replaced.'}</p>
    {/if}
    <div class="buttons">
      <button type="button" onclick={() => confirm.cancel()}>{spec.confirmLabel === null ? 'Close' : 'Cancel'}</button>
      {#if spec.secondary}<button type="button" onclick={() => confirm.second()}>{spec.secondary.label}</button>{/if}
      {#if spec.confirmLabel !== null}
        <button type="button" class:danger={!spec.slots || option?.replaces} onclick={() => confirm.accept(spec.slots ? chosen : undefined)}>
          {spec.slots && option?.replaces ? `${spec.confirmLabel}, replacing` : spec.confirmLabel}
        </button>
      {/if}
    </div>
  {/if}
</dialog>

<style>
  dialog {
    max-width: 420px; padding: var(--space-4); color: var(--text); background: var(--surface);
    border: 1px solid var(--border); border-radius: var(--radius);
  }
  dialog::backdrop { background: rgb(0 0 0 / 45%); }
  h2 { margin: 0 0 var(--space-2); font-size: var(--text-lg); }
  p { margin: 0 0 var(--space-2); }
  .fields { margin: 0 0 var(--space-2); padding: var(--space-1) var(--space-2) var(--space-1) var(--space-4); max-height: 160px; overflow-y: auto; font-size: var(--text-sm); font-family: var(--mono, monospace); background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius); }
  .buttons { display: flex; justify-content: flex-end; gap: var(--space-2); margin-top: var(--space-3); }
  button { min-height: var(--target); padding: 3px var(--space-3); background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius); cursor: pointer; }
  button:focus-visible { outline: none; border-color: var(--accent); box-shadow: var(--focus-ring); }
  .slot { display: flex; gap: var(--space-2); align-items: center; margin: var(--space-2) 0; }
  select { flex: 1; min-height: var(--target); background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius); }
  select:focus-visible { outline: none; border-color: var(--accent); box-shadow: var(--focus-ring); }
  .loss { color: var(--danger); min-height: 20px; }
  .loss.none { color: var(--text-muted); }
  .danger { border-color: var(--danger); color: var(--danger); font-weight: 600; }
</style>
