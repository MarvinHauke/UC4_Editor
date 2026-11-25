<script lang="ts">
  // The 18 setups: slot, name, problem count, a dot when the setup differs from factory. Click selects;
  // the pencil, F2 or a double click renames; the reset below goes back to factory after a confirm.
  import { tick } from 'svelte';
  import type { Store } from '../app/libraryStore.svelte.ts';
  import type { Confirm } from '../app/confirm.svelte.ts';
  import { resetSetupTexts, resetAllTexts } from '../app/resetTexts.ts';
  import { formatExported } from '../app/format.ts';
  import { revertTexts } from '../app/dumpTexts.ts';
  import type { Device } from '../app/deviceStore.svelte.ts';
  import type { Sender } from '../app/sender.svelte.ts';
  import type { DeviceProfile } from '../protocol/profile.ts';
  import SendButton from './SendButton.svelte';
  import CopyBar from './CopyBar.svelte';
  import PasteIcon from './PasteIcon.svelte';
  import { useCopyHold } from '../app/copyHold.svelte.ts';
  import { flashOn } from '../app/flash.ts';

  let { store, confirm, device, sender, profile }: { store: Store; confirm: Confirm; device: Device; sender: Sender; profile: Pick<DeviceProfile, 'deviceName'> } = $props();
  const slotLabel = (slot: number | undefined, i: number): string => `SE${String(slot ?? i + 1).padStart(2, '0')}`;
  let editing = $state<string | null>(null);
  const copy = useCopyHold();
  // Setups (decisions 30, 31): the held setup stays bright and the others show the Paste icon; with nothing held, pointing at
  // or focusing another row offers pasting the selected setup there (the icon at its right edge).
  const holdingSetup = $derived(copy.held?.kind === 'setup');
  const heldSetupId = $derived(copy.held?.kind === 'setup' ? copy.held.setupId : null);
  const sourceId = $derived(heldSetupId ?? (copy.held ? null : store.state.selection.setupId));
  const offers = (id: string): boolean => sourceId !== null && id !== sourceId;
  const current = $derived(store.state.setups.find((s) => s.id === store.state.selection.setupId));

  // Slot labels by setup id, for the paste icon's words.
  const setups = $derived(Object.fromEntries(store.state.setups.map((x, i) => [x.id, x.slot ?? i + 1])) as Record<string, number>);

  function startRename(id: string): void {
    store.selectSetup(id);
    editing = id;
  }
  function focusAndSelect(node: HTMLInputElement): void { node.focus(); node.select(); }
  // The input goes away when renaming ends; keyboard focus goes back to the row.
  async function backToRow(id: string): Promise<void> {
    await tick();
    document.querySelector<HTMLElement>(`[data-setup-id="${id}"]`)?.focus();
  }
  function finish(id: string, input: HTMLInputElement, restoreFocus = true): void {
    if (editing !== id) return;
    editing = null;
    if (restoreFocus) void backToRow(id);
    const name = input.value;
    if (name !== store.state.setups.find((s) => s.id === id)?.name) store.setSetupName(id, name);
  }
  function inputKey(e: KeyboardEvent & { currentTarget: HTMLInputElement }, id: string): void {
    if (e.key === 'Enter') { e.preventDefault(); finish(id, e.currentTarget); }
    else if (e.key === 'Escape') { e.preventDefault(); editing = null; void backToRow(id); }
  }
  // One tab stop in the list (the current setup); the arrows move between setups and pick them, Home and End the ends.
  function listKey(e: KeyboardEvent, from: number): void {
    if (e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return;
    const last = store.state.setups.length - 1;
    const to = e.key === 'ArrowUp' ? from - 1 : e.key === 'ArrowDown' ? from + 1 : e.key === 'Home' ? 0 : e.key === 'End' ? last : null;
    if (to === null) return;
    e.preventDefault();
    const target = store.state.setups[Math.min(last, Math.max(0, to))];
    if (!target) return;
    store.selectSetup(target.id);
    void backToRow(target.id);
  }
  // A setup that came from a kept dump can go back to it: one undo step, asked first.
  const dump = $derived(current ? store.state.dumps.find((d) => d.id === store.state.dumpLinks[current.id]) : undefined);
  function askRevert(): void {
    if (!current || !dump) return;
    const id = current.id;
    confirm.ask({ ...revertTexts(current.name, dump), run: () => { store.revertSetup(id); } });
  }
  function askResetAll(): void {
    confirm.ask({ ...resetAllTexts(formatExported(store.state.exportState.lastWholeExportAt)), run: () => store.resetAll() });
  }
  function askReset(): void {
    if (!current) return;
    const id = current.id;
    confirm.ask({ ...resetSetupTexts(current.slot, current.name), run: () => store.resetSetup(id) });
  }
</script>

<div class="library">
  <div class="libhead">
    <h2>Library</h2>
    <button type="button" class="quiet" disabled={!store.state.differsFromFactory} onclick={askResetAll}
      data-help={store.state.differsFromFactory ? 'Reset all: all 18 setups back to factory, after asking; Undo brings them back, the UC4 is not touched · click' : 'Reset all: all setups are factory already'}
    >↺ Reset all…</button>
  </div>
<nav class:holding={holdingSetup} data-copy-level="setup" aria-label="Setups" data-help="Setups: the 18 setups of the library · ↑ ↓ select one">
  <div class="sethead"><h2>Setups</h2>
  <CopyBar level="setup" holding={holdingSetup} canCopy={!!current} canPaste={holdingSetup && !!current && heldSetupId !== current.id}
    what={current ? `${slotLabel(current.slot, 0)} "${current.name}"` : 'the setup'} onCopy={() => { copy.copy('setup'); }} onPaste={() => { copy.paste('setup'); }} onStop={() => { copy.stop(); }} /></div>
  <ul>
    {#each store.state.setups as setup, i (setup.id)}
      {@const selected = setup.id === store.state.selection.setupId}
      <li class:current={selected} class:held={setup.id === heldSetupId} use:flashOn={{ flash: copy.flash, target: `setup:${setup.id}`, ring: true }}>
        {#if editing === setup.id}
          <span class="slot editing">{slotLabel(setup.slot, i)}</span>
          <input
            class="rename" value={setup.name} aria-label="Setup name" use:focusAndSelect
            data-help="Setup name: kept in the editor, not on the UC4 · Enter keeps it, Esc leaves it as it was"
            onkeydown={(e) => inputKey(e, setup.id)} onblur={(e) => finish(setup.id, e.currentTarget, false)}
          />
        {:else}
          <button
            type="button" class="pick" data-setup-id={setup.id} tabindex={selected ? 0 : -1}
            aria-current={selected ? 'true' : undefined}
            data-help="{slotLabel(setup.slot, i)} {setup.name}{setup.differsFromFactory ? ' (changed from factory)' : ''}{setup.problemCount > 0 ? `, ${setup.problemCount} problem${setup.problemCount === 1 ? '' : 's'}` : ''}: shown on the device · click to select it"
            onclick={() => store.selectSetup(setup.id)}
            ondblclick={() => startRename(setup.id)}
            onkeydown={(e) => { if (e.key === 'F2') { e.preventDefault(); startRename(setup.id); } else listKey(e, i); }}
          >
            <span class="slot">{slotLabel(setup.slot, i)}</span>
            <span class="name">{setup.name}</span>
            {#if setup.differsFromFactory}<span class="changed" role="img" aria-label="changed from factory" title="">●</span>{/if}
            {#if setup.problemCount > 0}<span class="count" aria-label="{setup.problemCount} problems">{setup.problemCount}</span>{/if}
          </button>
          {#if offers(setup.id)}
            <button type="button" class="icon paste" tabindex="-1" aria-label="Paste {slotLabel(setups[sourceId!], i)} here" data-help="Paste {slotLabel(setups[sourceId!], i)} onto {slotLabel(setup.slot, i)} {setup.name}: its controls, group names and labels; slot and name stay · one undo step"
              onclick={() => { copy.pasteSetupOnto(setup.id); }}><PasteIcon /></button>
          {/if}
          {#if selected}
            <button type="button" class="icon" tabindex="-1" aria-label="Rename {setup.name}" data-help="Rename this setup · F2; the name is kept in the editor, not on the UC4" onclick={() => startRename(setup.id)}>✎</button>
          {/if}
        {/if}
      </li>
    {/each}
  </ul>
  <button
    type="button" class="reset" disabled={!current || current.slot === undefined} onclick={askReset}
    data-help="Reset setup: back to its factory content, after asking · Undo brings it back"
  >↺ Reset {current ? `"${current.name}"` : 'setup'}…</button>
  {#if dump}
    <button
      type="button" class="reset" onclick={askRevert}
      data-help="Revert to its dump: back to what the kept dump held ({dump.content}, {formatExported(dump.date)}), after asking; the name stays, Undo brings your edits back · click"
    >⟲ Revert to its dump…</button>
  {/if}
  <SendButton {store} {device} {sender} {profile} />
</nav>
</div>

<style>
  .library { padding: var(--space-3) var(--space-2); }
  h2 { margin: 0 var(--space-2) var(--space-2); font-size: var(--text-lg); }
  .libhead { display: flex; align-items: center; justify-content: space-between; gap: var(--space-1) var(--space-3); flex-wrap: wrap; margin-bottom: var(--space-3); }
  .libhead h2 { margin: 0 0 0 var(--space-1); }
  .libhead .quiet { padding-inline: var(--space-2); }
  .quiet { min-height: var(--target); padding: var(--space-1) var(--space-3); border: 1px solid var(--border); color: var(--text-muted); white-space: nowrap; }
  .quiet:hover:not(:disabled) { background: var(--surface-2); color: var(--text); }
  .quiet:disabled { opacity: 0.5; cursor: default; }
  ul { list-style: none; margin: 0 0 var(--space-3); padding: 0; }
  li { display: flex; align-items: center; gap: 2px; border: 1px solid transparent; border-radius: var(--radius); min-height: var(--target); }
  li.current { background: var(--accent-soft); border-color: var(--accent); }
  button { font: inherit; background: transparent; border: 0; cursor: pointer; border-radius: var(--radius); }
  button:focus-visible { outline: none; box-shadow: var(--focus-ring); }
  .rename:focus-visible { outline: none; box-shadow: inset 0 0 0 1px var(--accent); }
  .pick { flex: 1; min-width: 0; display: flex; gap: var(--space-2); align-items: baseline; min-height: calc(var(--target) - 2px); padding: 3px var(--space-2); text-align: left; }
  li:not(.current) .pick:hover { background: var(--surface-2); }
  .slot { font: var(--text-sm) var(--mono); color: var(--text-muted); flex: none; padding-left: var(--space-2); }
  .pick .slot { padding-left: 0; }
  .name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  .changed { flex: none; color: var(--accent); font-size: var(--text-sm); line-height: 1; }
  .count { flex: none; min-width: 18px; padding: 0 4px; text-align: center; font-size: var(--text-sm); color: var(--on-danger); background: var(--danger); border-radius: 9px; }
  .sethead { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-3); margin: 0 var(--space-2) var(--space-2); }
  .sethead h2 { flex: 1; margin: 0; }
  /* A paste icon at the row's right edge: on hover or focus, always while a setup is held; held rows stay bright, others dim slightly. */
  .paste { opacity: 0; color: var(--accent); }
  li:hover .paste, li:focus-within .paste, .holding .paste { opacity: 1; }
  .holding li:not(.held) .pick { opacity: 0.75; }
  li.held { box-shadow: inset 0 0 0 1px var(--text-muted); }
  .icon { flex: none; width: var(--target); min-height: var(--target); color: var(--text-muted); }
  .icon:hover { color: var(--text); }
  .slot.editing { padding-left: var(--space-2); padding-right: var(--space-2); }
  .rename { flex: 1; min-width: 0; box-sizing: border-box; margin: 1px 4px 1px 6px; min-height: calc(var(--target) - 4px); padding: 2px var(--space-2); font: inherit; background: var(--surface-2); border: 1px solid var(--accent); border-radius: var(--radius); }
  .reset { width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-height: var(--target); padding: 3px var(--space-2); border: 1px solid var(--border); background: var(--surface-2); }
  .reset + .reset { margin-top: var(--space-2); }
  .reset:disabled { opacity: 0.5; cursor: default; }
</style>
