<script lang="ts">
  // The Warnings dialog (plan 0008 decision 25): problems first, then warnings. Show selects the control and closes the dialog;
  // Ignore accepts an open warning (kept in this browser, one undo step); "Show ignored" brings back ignored and factory-layout ones.
  import { onMount, tick } from 'svelte';
  import type { Store } from '../app/libraryStore.svelte.ts';
  import type { WarningsDialog } from '../app/warningsDialog.svelte.ts';
  import type { ListedWarning } from '../storage/index.ts';
  import { problemText } from '../app/controlProblems.ts';
  import { slotName } from '../app/format.ts';
  import { hiddenCount, listEntries } from '../app/warningList.ts';
  import { selectedSetup } from '../app/selectors.ts';

  let { store, warnings: ui }: { store: Store; warnings: WarningsDialog } = $props();
  let dialog = $state<HTMLDialogElement | null>(null);
  let closeButton = $state<HTMLButtonElement | null>(null);
  const lib = $derived(store.state);
  const here = $derived(selectedSetup(lib));
  const options = $derived({ scope: ui.scope, showIgnored: ui.showIgnored, setupId: here.setup.id, setupIndex: here.index, control: ui.control });
  const entries = $derived(listEntries(lib.problems, store.allWarnings, options));
  const hidden = $derived(hiddenCount(store.allWarnings, options));
  const total = $derived(entries.problems.length + entries.warnings.length);
  const setupName = (setupId: string): string => {
    const s = lib.setups.find((x) => x.id === setupId);
    return s ? `${s.slot !== undefined ? slotName(s.slot) : 'Setup'} · ${s.name}` : 'Setup';
  };
  const problemSetupName = (path: string): string => {
    const m = /^setups\[(\d+)\]/.exec(path);
    const s = m ? lib.configuration.setups[Number(m[1])] : undefined;
    return s ? `${s.slot !== undefined ? slotName(s.slot) : 'Setup'} · ${s.name}` : '';
  };

  $effect(() => {
    if (ui.open && dialog && !dialog.open) { dialog.showModal(); void tick().then(() => { (dialog?.querySelector<HTMLElement>('.entry button') ?? closeButton)?.focus(); }); }
    else if (!ui.open && dialog?.open) dialog.close();
  });
  onMount(() => () => { if (dialog?.open) dialog.close(); });

  const kept = async (): Promise<void> => { await tick(); (dialog?.querySelector<HTMLElement>('.entry button') ?? closeButton)?.focus(); };
  function show(w: ListedWarning): void { ui.close(); store.showWarning(w); }
  function ignoreWarning(w: ListedWarning): void { store.ignore([w]); void kept(); }
  function showAgain(w: ListedWarning): void { store.showAgain(w); void kept(); }
  function showProblem(index: number): void { ui.close(); store.showProblem(index); }
  const stateTag = (w: ListedWarning): string => (w.state === 'factory' ? 'factory layout' : w.state === 'ignored' ? 'ignored' : '');
</script>

<dialog bind:this={dialog} oncancel={(e) => { e.preventDefault(); ui.close(); }} onclose={() => { if (ui.open) ui.close(); }} aria-labelledby="warnings-title"
  data-help="Problems and warnings: Show selects the control · Ignore accepts a warning and hides it · Esc closes">
  <header>
    <h2 id="warnings-title">Problems and warnings</h2>
    <button type="button" class="close" bind:this={closeButton} aria-label="Close the list" title="Close" onclick={() => { ui.close(); }}>✕</button>
  </header>
  <div class="bar">
    <div class="seg" role="group" aria-label="Which setups">
      <button type="button" aria-pressed={ui.scope === 'this'} onclick={() => { ui.setScope('this'); }} data-help="This setup: only the open setup's problems and warnings">This setup</button>
      <button type="button" aria-pressed={ui.scope === 'all'} onclick={() => { ui.setScope('all'); }} data-help="All setups: every setup of the library">All setups</button>
    </div>
    <label data-help="Show ignored: the warnings you accepted and the factory layout's, with Show again where it applies">
      <input type="checkbox" checked={ui.showIgnored} onchange={(e) => { ui.setShowIgnored(e.currentTarget.checked); }} />
      Show ignored{hidden > 0 && !ui.showIgnored ? ` (${hidden})` : ''}
    </label>
  </div>
  {#if ui.control}
    <p class="narrow">Only the warnings of one control. <button type="button" class="link" onclick={() => { ui.clearControl(); }}>Show all of this setup</button></p>
  {/if}
  <div class="list" tabindex="-1">
    {#if total === 0}
      <p class="empty">{ui.control ? 'No warnings for this control.' : ui.scope === 'this' ? 'Nothing to review in this setup.' : 'Nothing to review in any setup.'}
        {#if !ui.showIgnored && hidden > 0} {hidden} ignored or factory-layout {hidden === 1 ? 'warning is' : 'warnings are'} hidden: tick “Show ignored”.{/if}</p>
    {/if}
    <ul>
      {#each entries.problems as e (e.index)}
        <li class="entry problem">
          <span class="mark" aria-hidden="true">●</span>
          <span class="text"><span class="what">Problem</span>{#if ui.scope === 'all'}<span class="where">{problemSetupName(e.problem.path)}</span>{/if}<span class="msg">{problemText(e.problem)}</span></span>
          <span class="actions"><button type="button" onclick={() => { showProblem(e.index); }} data-help="Show: selects the control with this problem and closes the list">Show</button></span>
        </li>
      {/each}
      {#each entries.warnings as w (`${w.setupId}|${w.controls[0]}|${w.controls[1]}|${w.key.kind}|${w.key.channel}|${w.key.number ?? ''}`)}
        <li class="entry" class:quiet={w.state !== 'open'}>
          <span class="mark" aria-hidden="true">▲</span>
          <span class="text">
            {#if ui.scope === 'all'}<span class="where">{setupName(w.setupId)}</span>{/if}
            <span class="msg">{w.message}</span>
            {#if stateTag(w)}<span class="tag">{stateTag(w)}</span>{/if}
          </span>
          <span class="actions">
            <button type="button" onclick={() => { show(w); }} data-help="Show: selects {w.controls[0] === w.controls[1] ? '' : 'the first of the two '}controls and closes the list{w.setupId === here.setup.id ? '' : ', opening that setup'}">Show</button>
            {#if w.state === 'open'}
              <button type="button" onclick={() => { ignoreWarning(w); }} data-help="Ignore: accept this warning; it is hidden until one of the two controls changes · Undo brings it back">Ignore</button>
            {:else if w.state === 'ignored'}
              <button type="button" onclick={() => { showAgain(w); }} data-help="Show again: the warning counts again">Show again</button>
            {/if}
          </span>
        </li>
      {/each}
    </ul>
  </div>
  <p class="note">A warning blocks nothing: sending one CC from two controls can be what you want. Ignored warnings are kept in this browser only, never in an export.</p>
</dialog>

<style>
  dialog {
    width: min(640px, calc(100vw - 2 * var(--space-4))); max-height: calc(100vh - 2 * var(--space-4)); padding: var(--space-4);
    color: var(--text); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
  }
  dialog[open] { display: flex; flex-direction: column; }
  dialog::backdrop { background: rgb(0 0 0 / 45%); }
  header { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-3); }
  h2 { margin: 0; font-size: var(--text-lg); }
  button { min-height: var(--target); padding: 0 var(--space-3); font: inherit; color: var(--text); background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius); cursor: pointer; }
  button:hover { background: var(--accent-soft); }
  button:focus-visible, input:focus-visible { outline: none; border-color: var(--accent); box-shadow: var(--focus-ring); }
  .close { width: var(--target); padding: 0; }
  .bar { display: flex; justify-content: space-between; align-items: center; gap: var(--space-3); margin-bottom: var(--space-3); }
  .seg { display: inline-flex; }
  .seg button { border-radius: 0; }
  .seg button:first-child { border-radius: var(--radius) 0 0 var(--radius); }
  .seg button:last-child { border-radius: 0 var(--radius) var(--radius) 0; margin-left: -1px; }
  .seg button[aria-pressed='true'] { color: var(--on-accent); background: var(--accent); border-color: var(--accent); }
  label { display: inline-flex; align-items: center; gap: var(--space-2); min-height: var(--target); cursor: pointer; }
  input[type='checkbox'] { width: 16px; height: 16px; accent-color: var(--accent); }
  .narrow { margin: 0 0 var(--space-2); color: var(--text-muted); font-size: var(--text-sm); }
  .link { min-height: 24px; padding: 0 var(--space-2); }
  /* A fixed height, so the dialog never jumps when entries are ignored or the toggle changes the list. */
  .list { height: min(420px, 55vh); overflow-y: auto; scrollbar-width: thin; scrollbar-color: var(--border) transparent; background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius); }
  ul { margin: 0; padding: 0; list-style: none; }
  .entry { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-2) var(--space-3); border-bottom: 1px solid var(--border); }
  .entry:last-child { border-bottom: 0; }
  .mark { flex: none; width: 1em; color: var(--warn); }
  .problem .mark { color: var(--danger); }
  .text { flex: 1; min-width: 0; display: flex; flex-wrap: wrap; align-items: baseline; column-gap: var(--space-2); overflow-wrap: anywhere; }
  /* The message takes a line of its own; the setup name above and the tag below are small notes. */
  .msg { flex: 1 1 100%; }
  .quiet .text { color: var(--text-muted); }
  .what { font-weight: 600; color: var(--danger); }
  .where { font-size: var(--text-sm); color: var(--text-muted); }
  .tag { font-size: var(--text-sm); padding: 0 var(--space-2); color: var(--text-muted); border: 1px solid var(--border); border-radius: var(--radius); }
  /* Two fixed columns, so Show lines up down the list and Ignore / Show again sit under each other. */
  .actions { flex: none; display: grid; grid-template-columns: 4.5em 7em; gap: var(--space-2); }
  .actions button { padding: 0 var(--space-2); min-width: 0; width: 100%; }
  .actions button:first-child { grid-column: 1; }
  .actions button:nth-child(2) { grid-column: 2; }
  .empty { margin: 0; padding: var(--space-4); color: var(--text-muted); }
  .note { margin: var(--space-3) 0 0; font-size: var(--text-sm); color: var(--text-muted); }
</style>
