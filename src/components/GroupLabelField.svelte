<script lang="ts">
  // The free-text label of a group (plan 0006 decision 25): editor-only, shown here, never sent to the UC4.
  // The change is made on Enter or when leaving the field, so one edit is one undo step; Esc puts the saved text back.
  import type { Snippet } from 'svelte';

  interface Props { label: string; kind: 'encoder' | 'faderButton'; group: number; oncommit: (label: string) => void; /** What sits at the end of the row (the suggested group name). */ children?: Snippet }
  let { label, kind, group, oncommit, children }: Props = $props();

  const id = $props.id();
  let draft = $state<string | null>(null);
  const shown = $derived(draft ?? label);

  function commit(): void {
    if (draft !== null && draft.trim() !== label) oncommit(draft);
    draft = null;
  }
  function leave(e: KeyboardEvent & { currentTarget: HTMLInputElement }): void {
    if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); return; }
    if (e.key !== 'Escape') return;
    e.preventDefault(); // the field used the key: it does not also leave edit mode
    draft = null;
    e.currentTarget.value = label; // focus stays in the field: typing can go on
  }
</script>

<div class="label" data-help="Label: your own words for {kind === 'encoder' ? 'encoder' : 'fader/button'} group {group + 1}, up to 60 characters; kept in the editor, not on the UC4">
  <label for={id}>Label</label>
  <input {id} type="text" value={shown} maxlength="60" autocomplete="off" placeholder="e.g. Filter"
    oninput={(e) => { draft = e.currentTarget.value; }} onkeydown={leave} onchange={commit} onblur={commit} />
  {@render children?.()}
</div>

<style>
  .label { display: flex; align-items: center; gap: var(--space-2); }
  label { flex: none; min-width: 40px; white-space: nowrap; font-weight: 600; }
  input {
    flex: 1; min-width: 0; min-height: var(--target); padding: 3px var(--space-2);
    background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius);
  }
  input:focus-visible { outline: none; border-color: var(--accent); box-shadow: var(--focus-ring); }
</style>
