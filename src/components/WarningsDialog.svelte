<script lang="ts">
  // The Warnings dialog (plan 0008 decisions 25, 31, 35): four blocks (problems, open warnings, ignored, the factory layout's).
  // Show selects the control and closes the dialog; Ignore is a toggle; a Solution pick only plans a change, and the Changes table
  // at the bottom applies the plan (one undo step; the dialog stays open).
  import { onMount, tick } from 'svelte';
  import type { Store } from '../app/libraryStore.svelte.ts';
  import type { WarningsDialog } from '../app/warningsDialog.svelte.ts';
  import { entriesOf, type Problem, type Warning } from '../model/index.ts';
  import { warningId, type ListedWarning } from '../storage/index.ts';
  import WarningRow from './WarningRow.svelte';
  import ChangesTable from './ChangesTable.svelte';
  import { useResolvePlan } from '../app/resolvePlanState.svelte.ts';
  import { entriesWithout, pickedChoice } from '../app/resolvePlan.ts';
  import { resolveOptions, withPlanned } from '../app/resolveView.ts';
  import { problemText } from '../app/controlProblems.ts';
  import { slotName } from '../app/format.ts';
  import { loadFactoryOpen, saveFactoryOpen } from '../app/foldState.ts';
  import { blocksOf, listEntries } from '../app/warningList.ts';
  import { selectedSetup } from '../app/selectors.ts';

  let { store, warnings: ui }: { store: Store; warnings: WarningsDialog } = $props();
  const resolvePlan = useResolvePlan();
  /** The Factory layout block is folded until opened; the choice stays for the session (sessionStorage). A list narrowed to one control shows it (decision 36). */
  let factoryOpen = $state(loadFactoryOpen());
  let dialog = $state<HTMLDialogElement | null>(null);
  let closeButton = $state<HTMLButtonElement | null>(null);
  const lib = $derived(store.state);
  const here = $derived(selectedSetup(lib));
  const options = $derived({ scope: ui.scope, setupId: here.setup.id, setupIndex: here.index, control: ui.control });
  const entries = $derived(listEntries(lib.problems, store.allWarnings, options));
  const blocks = $derived.by(() => { const b = blocksOf(entries.warnings); return [{ title: 'Open warnings', list: b.open }, { title: 'Ignored', list: b.ignored }, { title: 'Factory layout', list: b.factory, fold: true }]; });
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
    if (ui.open && dialog && !dialog.open) { dialog.showModal(); void tick().then(() => { (dialog?.querySelector<HTMLElement>('.entry .acts button') ?? closeButton)?.focus(); }); }
    else if (!ui.open && dialog?.open) dialog.close();
  });
  onMount(() => () => { if (dialog?.open) dialog.close(); });

  const kept = async (): Promise<void> => { await tick(); (dialog?.querySelector<HTMLElement>('.entry .acts button') ?? closeButton)?.focus(); };
  function show(w: ListedWarning): void { ui.close(); store.showWarning(w); }
  function ignoreWarning(w: ListedWarning): void { store.ignore([w]); void kept(); }
  function showAgain(w: ListedWarning): void { store.unignore(w); void kept(); }
  function showProblem(index: number): void { ui.close(); store.showProblem(index); }
  const problemId = (p: Problem): string => `problem|${p.path}|${p.message}`;
  /** What the row would plan: its own earlier pick doesn't reserve numbers against itself. */
  const suggestFor = (item: Warning | Problem, rowId: string) => store.suggest(item, entriesWithout(resolvePlan.plan, rowId));
  /** The row's options; a picked one shows the planned After. */
  const optionsFor = (item: Warning | Problem, rowId: string) => {
    const r = suggestFor(item, rowId);
    const picked = pickedChoice(resolvePlan.plan, rowId);
    const entries = picked === null ? [] : resolvePlan.plan.filter((i) => i.rowId === rowId && i.choice === picked).map((i) => i.entry);
    return withPlanned(resolveOptions(r), r, picked === null ? null : { choice: picked, entries });
  };
  function pick(item: Warning | Problem, rowId: string, choice: number): void {
    const c = suggestFor(item, rowId).choices[choice];
    if (c) resolvePlan.pick(rowId, choice, entriesOf(lib.configuration, c));
  }
</script>

<dialog bind:this={dialog} oncancel={(e) => { e.preventDefault(); ui.close(); }} onclose={() => { if (ui.open) ui.close(); }} aria-labelledby="warnings-title"
  data-help="Problems and warnings: Show selects the control · a Solution plans a change, Apply makes it · Ignore accepts a warning · Esc closes">
  <header>
    <h2 id="warnings-title">Problems and warnings</h2>
    <button type="button" class="close" bind:this={closeButton} aria-label="Close the list" title="Close" onclick={() => { ui.close(); }}>✕</button>
  </header>
  <div class="bar">
    <div class="seg" role="group" aria-label="Which setups">
      <button type="button" aria-pressed={ui.scope === 'this'} onclick={() => { ui.setScope('this'); }} data-help="This setup: only the open setup's problems and warnings">This setup</button>
      <button type="button" aria-pressed={ui.scope === 'all'} onclick={() => { ui.setScope('all'); }} data-help="All setups: every setup of the library">All setups</button>
    </div>
  </div>
  {#if ui.control}
    <p class="narrow">Only the warnings of one control. <button type="button" class="link" onclick={() => { ui.clearControl(); }}>Show all of this setup</button></p>
  {/if}
  <div class="list" tabindex="-1">
    <!-- The column names stay in view while the list scrolls; they sit over the columns of the rows (decision 36). -->
    <div class="heads" aria-hidden="true"><span class="hf">Finding</span><span class="hcols"><span>Solution</span><span>Actions</span></span></div>
    {#if total === 0}
      <p class="empty">{ui.control ? 'No warnings for this control.' : ui.scope === 'this' ? 'Nothing to review in this setup.' : 'Nothing to review in any setup.'}</p>
    {/if}
    {#if entries.problems.length > 0}
      <h3 class="block">Problems · {entries.problems.length}</h3>
      <ul>
        {#each entries.problems as e (e.index)}
          {@const id = problemId(e.problem)}
          <WarningRow problem where={ui.scope === 'all' ? problemSetupName(e.problem.path) : undefined} message={problemText(e.problem)} options={optionsFor(e.problem, id)}
            picked={pickedChoice(resolvePlan.plan, id)} showHelp="Show: selects the control with this problem and closes the list" onshow={() => { showProblem(e.index); }} onpick={(c) => { pick(e.problem, id, c); }} />
        {/each}
      </ul>
    {/if}
    {#each blocks as b (b.title)}
      {#if b.list.length > 0}
        {@const shown = !b.fold || factoryOpen || ui.control !== null}
        {#if b.fold && ui.control === null}
          <h3 class="block"><button type="button" class="fold" aria-expanded={shown} onclick={() => { factoryOpen = !factoryOpen; saveFactoryOpen(factoryOpen); }}
            data-help={shown ? 'Factory layout: the warnings of the UC4\'s own layout; click to fold' : 'Factory layout: the warnings of the UC4\'s own layout, folded; click to unfold'}><span aria-hidden="true">{shown ? '▾' : '▸'}</span> {b.title} · {b.list.length}</button></h3>
        {:else}
          <h3 class="block">{b.title} · {b.list.length}</h3>
        {/if}
        {#if shown}
        <ul>
          {#each b.list as w (warningId(w))}
            {@const id = warningId(w)}
            <WarningRow where={ui.scope === 'all' ? setupName(w.setupId) : undefined} message={w.message} options={optionsFor(w, id)} picked={pickedChoice(resolvePlan.plan, id)} quiet={w.state !== 'open'}
              ignore={w.state === 'open' ? 'open' : 'ignored'}
              showHelp="Show: selects {w.controls[0] === w.controls[1] ? '' : 'the first of the two '}controls and closes the list{w.setupId === here.setup.id ? '' : ', opening that setup'}"
              onshow={() => { show(w); }} onpick={(c) => { pick(w, id, c); }} onignore={() => { if (w.state === 'open') ignoreWarning(w); else showAgain(w); }} />
          {/each}
        </ul>
        {/if}
      {/if}
    {/each}
  </div>
  <ChangesTable {store} plan={resolvePlan} />
  <p class="note">A warning blocks nothing: sending one CC from two controls can be what you want. Ignored warnings are kept in this browser only, never in an export.</p>
</dialog>

<style>
  dialog {
    width: min(760px, calc(100vw - 2 * var(--space-4))); max-height: calc(100vh - 2 * var(--space-4)); padding: var(--space-4);
    color: var(--text); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
  }
  /* The two button columns, once: the heading row and every row use them, so they cannot drift apart. */
  dialog { --col-solution: 130px; --col-actions: 78px; }
  dialog[open] { display: flex; flex-direction: column; }
  dialog::backdrop { background: rgb(0 0 0 / 45%); }
  header { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-3); }
  h2 { margin: 0; font-size: var(--text-lg); }
  button { min-height: var(--target); padding: 0 var(--space-3); font: inherit; color: var(--text); background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius); cursor: pointer; }
  button:hover { background: var(--accent-soft); }
  button:focus-visible { outline: none; border-color: var(--accent); box-shadow: var(--focus-ring); }
  .close { width: var(--target); padding: 0; }
  .bar { display: flex; justify-content: space-between; align-items: center; gap: var(--space-3); margin-bottom: var(--space-3); }
  .seg { display: inline-flex; }
  .seg button { border-radius: 0; }
  .seg button:first-child { border-radius: var(--radius) 0 0 var(--radius); }
  .seg button:last-child { border-radius: 0 var(--radius) var(--radius) 0; margin-left: -1px; }
  .seg button[aria-pressed='true'] { background: var(--accent-soft); border-color: var(--accent); }
  .narrow { margin: 0 0 var(--space-2); color: var(--text-muted); font-size: var(--text-sm); }
  .link { min-height: 24px; padding: 0 var(--space-2); }
  /* A fixed height, so the dialog never jumps when entries are ignored or the toggle changes the list. */
  .list { height: min(420px, 55vh); overflow-y: auto; scrollbar-gutter: stable; scrollbar-width: thin; scrollbar-color: var(--border) transparent; background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius); }
  ul { margin: 0; padding: 0; list-style: none; }
  ul :global(.entry:last-child) { border-bottom: 0; }
  .heads { position: sticky; top: 0; z-index: 1; display: flex; gap: var(--space-3); padding: var(--space-1) var(--space-3); font-size: var(--text-sm); color: var(--text-muted); background: var(--surface-2); border-bottom: 1px solid var(--border); }
  .hf { flex: 1; margin-left: calc(1em + var(--space-3)); }
  .hcols { flex: none; display: grid; grid-template-columns: var(--col-solution) var(--col-actions); gap: var(--space-2); }
  /* A block heading is a band: a line above and below, the same padding, a faint tint, so it starts a section and never reads as part of a row. */
  .block { margin: 0; padding: var(--space-2) var(--space-3); font-size: var(--text-sm); font-weight: 400; color: var(--text-muted); background: var(--surface); border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); }
  .heads + .block, .heads + :global(.block) { border-top: 0; }
  .fold { display: flex; align-items: center; gap: var(--space-2); width: 100%; min-height: 24px; margin: calc(-1 * var(--space-2)) calc(-1 * var(--space-3)); padding: var(--space-2) var(--space-3); box-sizing: content-box; font: inherit; color: inherit; text-align: left; background: none; border: 0; border-radius: 0; cursor: pointer; }
  .fold:hover { background: var(--accent-soft); }
  .fold:focus-visible { outline: none; box-shadow: inset 0 0 0 2px var(--accent); }
  .empty { margin: 0; padding: var(--space-4); color: var(--text-muted); }
  .note { margin: var(--space-3) 0 0; font-size: var(--text-sm); color: var(--text-muted); }
</style>
