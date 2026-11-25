<script lang="ts">
  // "Export ▾": every file export behind one button, ordered by scope (plan 0007 decisions 17 and 20).
  // All setups: Configuration (.json), Dump (.syx). The selected slot: the same two.
  // Keyboard: Enter, Space or ↓ opens; ↑ ↓ Home End move; Enter picks; Esc closes and returns focus to the button.
  import type { Store } from '../app/libraryStore.svelte.ts';
  import { exportAll, exportOne, type FlowUi } from '../app/importFlow.ts';
  import { slotName } from '../app/format.ts';
  import { downloadBytes } from '../app/download.ts';
  import { exportAllSyx, exportOneSyx, type SyxUi } from '../app/syxFlow.ts';

  let { store, ui }: { store: Store; ui: FlowUi } = $props();
  let open = $state(false);
  let trigger = $state<HTMLButtonElement | null>(null);
  let panel = $state<HTMLDivElement | null>(null);
  const syxUi: SyxUi = $derived({ ...ui, downloadBytes });
  const lib = $derived(store.state);
  const current = $derived(lib.setups.find((s) => s.id === lib.selection.setupId));
  const slotLabel = $derived(current?.slot !== undefined ? slotName(current.slot) : 'setup');

  function close(refocus: boolean): void { open = false; if (refocus) trigger?.focus(); }
  function run(go: () => void): void { close(true); go(); }
  const items = (): HTMLButtonElement[] => [...(panel?.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]:not(:disabled)') ?? [])];
  $effect(() => { if (open) items()[0]?.focus(); });
  function away(e: PointerEvent): void { if (open && e.target instanceof Node && !panel?.contains(e.target) && !trigger?.contains(e.target)) open = false; }
  function triggerKey(e: KeyboardEvent): void { if (e.key === 'ArrowDown' && !open) { e.preventDefault(); open = true; } }
  function panelKey(e: KeyboardEvent): void {
    const list = items();
    const at = list.indexOf(document.activeElement as HTMLButtonElement);
    const to = e.key === 'ArrowDown' ? (at + 1) % list.length : e.key === 'ArrowUp' ? (at <= 0 ? list.length - 1 : at - 1) : e.key === 'Home' ? 0 : e.key === 'End' ? list.length - 1 : null;
    if (to === null) return;
    e.preventDefault();
    list[to]?.focus();
  }
</script>

<svelte:document onpointerdown={away} />
<div class="wrap" role="presentation" onfocusout={(e) => { if (open && !(e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget))) open = false; }}
  onkeydown={(e) => { if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); close(true); } }}>
  <button type="button" class="trigger" bind:this={trigger} aria-expanded={open} aria-haspopup="menu" onclick={() => { open = !open; }} onkeydown={triggerKey}
    data-help="Export: your setups as a file, all or the selected one, nothing is sent to the UC4 · click">Export ▾</button>
  {#if open}
    <!-- svelte-ignore a11y_interactive_supports_focus -->
    <div class="panel" role="menu" aria-label="Export" bind:this={panel} onkeydown={panelKey}>
      <div role="group" aria-labelledby="exp-all">
      <div class="heading" id="exp-all">All setups</div>
      <button type="button" role="menuitem" onclick={() => { run(() => { exportAll(store.flow, ui); }); }}
        data-help="Export all setups as a configuration: one dated .json file, the editor's own · Import reads it back">Configuration<span class="hint">.json</span></button>
      <button type="button" role="menuitem" onclick={() => { run(() => { exportAllSyx(store.syxFlow, syxUi); }); }}
        data-help="Export all setups as a dump: one SndA .syx file made from the editor's setups, not tested on the UC4 yet; a value that cannot be written safely is named · click">Dump<span class="hint">.syx</span></button>
      </div>
      <div role="group" aria-labelledby="exp-one">
      <div class="heading" id="exp-one">{slotLabel}</div>
      <button type="button" role="menuitem" disabled={!current} onclick={() => { run(() => { exportOne(store.flow, ui); }); }}
        data-help="Export {slotLabel} as a configuration: its own .json file">Configuration<span class="hint">.json</span></button>
      <button type="button" role="menuitem" disabled={!current} onclick={() => { run(() => { exportOneSyx(store.syxFlow, syxUi); }); }}
        data-help="Export {slotLabel} as a dump: a Sndc .syx file for its slot · needs a Sndc of that slot kept from the UC4">Dump<span class="hint">.syx</span></button>
      </div>
    </div>
  {/if}
</div>

<style>
  .wrap { position: relative; }
  button { min-height: var(--target); padding: 0 var(--space-3); white-space: nowrap; background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius); cursor: pointer; }
  button:hover:not(:disabled) { background: var(--accent-soft); }
  button:focus-visible { outline: none; border-color: var(--accent); box-shadow: var(--focus-ring); }
  button:disabled { opacity: 0.5; cursor: default; }
  .panel { position: absolute; z-index: 20; top: calc(100% + 2px); left: 0; display: flex; flex-direction: column; gap: 2px; padding: var(--space-1); min-width: 180px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: 0 4px 12px rgb(0 0 0 / 30%); }
  .heading { padding: var(--space-1) var(--space-2) 0; font-size: var(--text-sm); color: var(--text-muted); }
  .panel [role="group"] { display: flex; flex-direction: column; gap: 2px; }
  .panel [role="group"] + [role="group"] { margin-top: var(--space-1); border-top: 1px solid var(--border); padding-top: var(--space-1); }
  .panel button { display: flex; justify-content: space-between; gap: var(--space-4); text-align: left; background: transparent; border-color: transparent; }
  .panel button:hover:not(:disabled) { background: var(--accent-soft); }
  .hint { color: var(--text-muted); font: var(--text-sm) var(--mono); align-self: center; }
</style>
