<script lang="ts">
  // The Changes table at the bottom of the Warnings dialog (plan 0008 decision 35): what the picked solutions would change,
  // one line per control and property (control, property, before, After, ✕). After is editable and a value that collides is
  // marked at once. Apply changes n lines as one undo step; the dialog stays open; Discard drops the plan.
  import type { Store } from '../app/libraryStore.svelte.ts';
  import type { ResolvePlanState } from '../app/resolvePlanState.svelte.ts';
  import { checkPlanValue } from '../model/index.ts';
  import { nameOfPath } from '../live/mapping.ts';
  import { flashTargets, PROPERTY_WORD } from '../app/resolvePlan.ts';
  import { useCopyHold } from '../app/copyHold.svelte.ts';

  let { store, plan }: { store: Store; plan: ResolvePlanState } = $props();
  const copy = useCopyHold();
  /** What the last Apply or edit said (a refused entry's reason); gone when the plan changes. */
  let note = $state('');
  const checks = $derived(plan.plan.map((i) => checkPlanValue(store.state.configuration, plan.entries, { path: i.entry.path, property: i.entry.property, after: i.entry.after })));
  const blocked = $derived(checks.some((c) => !c.valid));

  function edit(index: number, input: HTMLInputElement): void {
    const n = Number(input.value);
    if (input.value.trim() === '' || !Number.isInteger(n)) { note = 'The new value must be a whole number.'; input.value = String(plan.plan[index]!.entry.after); return; }
    note = '';
    plan.setAfter(index, n);
  }
  function apply(): void {
    const r = store.applyPlan(plan.entries);
    plan.discard();
    note = r.refused.length > 0 ? `${r.message ?? ''} ${r.refused.length} not applied: ${r.refused.map((x) => x.reason).join(' ')}`.trim() : (r.message ?? '');
    if (r.changed) copy.pulse(flashTargets(r.changed, store.state.selection));
  }
  function discard(): void { plan.discard(); note = ''; }
</script>

<section class="changes" aria-label="Changes">
  <h3>Changes{plan.plan.length > 0 ? ` · ${plan.plan.length}` : ''}</h3>
  <div class="table">
    {#if plan.plan.length === 0}
      <p class="empty">{note || 'Pick a solution in a row to plan a change. Nothing changes until you press Apply.'}</p>
    {:else}
      <ul>
        {#each plan.plan as item, i (`${item.entry.path}|${item.entry.property}`)}
          {@const c = checks[i]}
          <li class="line">
            <span class="ctl">{nameOfPath(item.entry.path) ?? item.entry.path}</span>
            <span class="prop">{PROPERTY_WORD[item.entry.property]}</span>
            <span class="before" aria-label="before">{item.entry.before}</span>
            <span class="arrow" aria-hidden="true">→</span>
            <input class="after" class:bad={c && !c.valid} class:warn={c?.valid && c.collidesWith.length > 0} inputmode="numeric" aria-label="After: {PROPERTY_WORD[item.entry.property]} of {nameOfPath(item.entry.path) ?? item.entry.path}"
              value={item.entry.after} onchange={(e) => { edit(i, e.currentTarget); }} data-help="After: the new value; edit it to plan another one · a value another control sends is marked" />
            <button type="button" class="x" aria-label="Take {nameOfPath(item.entry.path) ?? item.entry.path} out of the changes" title="Take out" data-help="Take out: drops this line from the plan; nothing was changed" onclick={() => { plan.remove(i); note = ''; }}>✕</button>
            {#if c && !c.valid}<span class="note bad">{c.reason}</span>
            {:else if c && c.collidesWith.length > 0}<span class="note warn">▲ Also sent by {c.collidesWith.map((x) => x.name).join(', ')}</span>{/if}
          </li>
        {/each}
      </ul>
    {/if}
  </div>
  <div class="foot">
    <span class="says" role="status">{plan.plan.length > 0 ? note : ''}</span>
    <button type="button" onclick={discard} disabled={plan.plan.length === 0} data-help="Discard: drops the planned changes; nothing was changed">Discard</button>
    <button type="button" class="apply" onclick={apply} disabled={plan.plan.length === 0 || blocked}
      data-help={blocked ? 'Apply: a value is not valid; fix or take it out first' : 'Apply: makes all planned changes as one undo step · this list stays open'}>Apply {plan.plan.length === 1 ? '1 change' : `${plan.plan.length} changes`}</button>
  </div>
</section>

<style>
  .changes { margin-top: var(--space-3); }
  h3 { margin: 0 0 var(--space-1); font-size: var(--text-sm); font-weight: 400; color: var(--text-muted); }
  /* A reserved height, so the dialog never jumps when a pick is made or taken back. */
  .table { height: 112px; overflow-y: auto; scrollbar-width: thin; background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius); }
  ul { margin: 0; padding: 0; list-style: none; }
  .empty { margin: 0; padding: var(--space-3); color: var(--text-muted); font-size: var(--text-sm); }
  .line { display: grid; grid-template-columns: minmax(0, 1fr) 5em 3em 1.2em 5em var(--target); align-items: center; column-gap: var(--space-2); padding: var(--space-1) var(--space-3); border-bottom: 1px solid var(--border); }
  .line:last-child { border-bottom: 0; }
  .prop, .before { color: var(--text-muted); font-size: var(--text-sm); }
  .before { text-align: right; font-variant-numeric: tabular-nums; font-family: var(--mono); }
  .arrow { color: var(--text-muted); }
  .after { box-sizing: border-box; width: 100%; min-height: var(--target); padding: 0 var(--space-2); font: inherit; font-family: var(--mono); color: var(--text); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); }
  .after.warn { border-color: var(--warn); }
  .after.bad { border-color: var(--danger); }
  .note { grid-column: 1 / -1; font-size: var(--text-sm); }
  .note.warn { color: var(--warn); }
  .note.bad { color: var(--danger); }
  button { min-height: var(--target); padding: 0 var(--space-3); font: inherit; color: var(--text); background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius); cursor: pointer; }
  button:hover:not(:disabled) { background: var(--accent-soft); }
  button:disabled { color: var(--text-muted); cursor: default; opacity: 0.6; }
  button:focus-visible, .after:focus-visible { outline: none; border-color: var(--accent); box-shadow: var(--focus-ring); }
  .x { width: var(--target); padding: 0; }
  /* A fixed width, so the buttons never move as the count changes. */
  .apply { min-width: 11em; }
  .apply:not(:disabled) { color: var(--on-accent); background: var(--accent); border-color: var(--accent); }
  .foot { display: flex; align-items: center; justify-content: flex-end; gap: var(--space-2); margin-top: var(--space-2); }
  .says { flex: 1; min-width: 0; color: var(--text-muted); font-size: var(--text-sm); }
</style>
