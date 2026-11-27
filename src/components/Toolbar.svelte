<script lang="ts">
  // Files and undo, in the top bar. Import reads a chosen .json or .syx file and asks what is needed; exports download.
  import type { Store } from '../app/libraryStore.svelte.ts';
  import type { Confirm } from '../app/confirm.svelte.ts';
  import { download } from '../app/download.ts';
  import ExportMenu from './ExportMenu.svelte';
  import { startImport, type FlowUi } from '../app/importFlow.ts';

  let { store, confirm }: { store: Store; confirm: Confirm } = $props();
  let picker = $state<HTMLInputElement | null>(null);
  const ui: FlowUi = { ask: (spec) => { confirm.ask(spec); }, download, say: (text, warnFor) => { store.say(text, warnFor); } };

  async function picked(e: Event & { currentTarget: HTMLInputElement }): Promise<void> {
    const input = e.currentTarget;
    const file = input.files?.[0];
    input.value = ''; // the same file can be chosen again
    if (!file) return;
    let content: Uint8Array; // the library decides what the bytes are (a dump or JSON text) and refuses the rest
    try { content = new Uint8Array(await file.arrayBuffer()); } catch {
      store.say(`"${file.name}" could not be read. Check that the file is still there and try again.`);
      return;
    }
    startImport(store.flow, ui, file.name, content);
  }
  const lib = $derived(store.state);
</script>

<div class="toolbar" role="toolbar" aria-label="Files and undo">
  <button type="button" data-help="Import: a configuration (.json) or a dump (.syx) from your computer, after asking · Undo brings back what it replaced" onclick={() => picker?.click()}>Import…</button>
  <!-- No `accept` filter: Brave on macOS greyed out a valid .json file, import checks the content anyway, and .syx files must be choosable too. -->
  <input bind:this={picker} type="file" hidden onchange={picked} />
  <ExportMenu {store} {ui} />
  <span class="divider" role="separator" aria-orientation="vertical"></span>
  <button type="button" class="icon" aria-label="Undo" title="Undo" disabled={!lib.canUndo} data-help="Undo the last change · Cmd-Z" onclick={() => store.undo()}><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11" /></svg></button>
  <button type="button" class="icon" aria-label="Redo" title="Redo" disabled={!lib.canRedo} data-help="Redo the change you undid · Shift-Cmd-Z" onclick={() => store.redo()}><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 14 5-5-5-5" /><path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13" /></svg></button>
</div>

<style>
  .toolbar { display: flex; align-items: center; gap: var(--space-2); }
  button { min-height: var(--target); padding: 0 var(--space-3); background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius); cursor: pointer; }
  button:hover:not(:disabled) { background: var(--accent-soft); }
  button:focus-visible { outline: none; border-color: var(--accent); box-shadow: var(--focus-ring); }
  button:disabled { opacity: 0.5; cursor: default; }
  .icon { width: var(--target); padding: 0; font-size: 16px; display: inline-flex; align-items: center; justify-content: center; }
  .divider { align-self: stretch; margin: 4px var(--space-1); border-left: 1px solid var(--border); }
</style>
