<script lang="ts">
  // The selected control's properties, per kind, in the device's order.
  import type { Store } from '../app/libraryStore.svelte.ts';
  import { FIELDS, AREA_NAMES, controlNumber } from '../app/profile/uc4Properties.ts';
  import { controlAt, groupOf, selectedSetup } from '../app/selectors.ts';
  import { problemsOf } from '../app/controlProblems.ts';
  import { warningsOf } from '../app/warningMarks.ts';
  import { keepChannel, otherName } from '../app/warningList.ts';
  import { controlPathOf, isEncoderArea, wellKnownCc } from '../model/index.ts';
  import { useResolvePlan } from '../app/resolvePlanState.svelte.ts';
  import { useWarningsDialog } from '../app/warningsDialog.svelte.ts';
  import { NOTICE_SHORT } from '../app/links.ts';
  import PropertyField from './PropertyField.svelte';
  import type { Confirm } from '../app/confirm.svelte.ts';
  import { deviceHint } from '../app/profile/uc4Hints.ts';
  import GroupsSection from './GroupsSection.svelte';
  import CopyBar from './CopyBar.svelte';
  import { useCopyHold } from '../app/copyHold.svelte.ts';
  import { canPasteControl, isHeldControl } from '../app/copyPaste.ts';

  let { store, confirm }: { store: Store; confirm: Confirm } = $props();
  const copy = useCopyHold();
  /** The quiet note under a typed CC number that other gear reads as something (decision 35). */
  const ccHint = (n: number): string | undefined => { const name = wellKnownCc(n); return name ? `CC ${n} is often ${name}: fine for a DAW, may clash with an instrument` : undefined; };
  const warningsDialog = useWarningsDialog();
  const resolvePlan = useResolvePlan();
  const panel = $derived.by(() => {
    const state = store.state;
    const sel = state.selection.control;
    if (!sel) return null;
    const { setup, index: setupIndex } = selectedSetup(state);
    const group = groupOf(state, sel.area);
    const control = controlAt(state.configuration, setup.id, sel.area, group, sel.index);
    if (!control) return null;
    const problems = problemsOf(state.problems, controlPathOf(setupIndex, sel.area, group, sel.index));
    const path = controlPathOf(setupIndex, sel.area, group, sel.index);
    const warned = warningsOf(store.warnings, path);
    return { sel, group, control, setup, problems, warned, path };
  });
</script>

<section class="panel" data-copy-level="control" aria-label="Properties">
  <GroupsSection {store} {confirm} />
  {#if panel}
    {@const { sel, group, control, setup, problems, warned, path } = panel}
    <header>
      <div class="head">
        <div class="titles">
          <h2>{AREA_NAMES[sel.area].singular} {controlNumber(sel.index)}</h2>
          <p class="where">
            {setup.name} ·
            {isEncoderArea(sel.area) ? `encoder group ${group + 1}` : `fader/button group ${group + 1}`}
          </p>
        </div>
        <CopyBar level="control" holding={copy.held?.kind === 'control'} canCopy={true}
        canPaste={copy.held?.kind === 'control' && canPasteControl(copy.held, sel) && !isHeldControl(copy.held, setup.id, sel.area, group, sel.index)}
        what="{AREA_NAMES[sel.area].singular} {controlNumber(sel.index)}"
        onCopy={() => { copy.copy('control'); }} onPaste={() => { copy.paste('control'); }} onStop={() => { copy.stop(); }} />
      </div>
    </header>
    {#if warned.length > 0}
      <ul class="warned" aria-label="Warnings">
        {#each warned as w (w.message)}
          {@const free = store.suggest(w, resolvePlan.entries).choices.find((c) => c.path === path)?.suggestion?.text}
          <li>
            <span class="alsoby" data-help="Warning: {w.message} · allowed, but check it is intended"><span aria-hidden="true">▲</span> Also sent by {keepChannel(otherName(w, path))}</span>
            <span class="fix">{#if free}<span class="free">Free: {keepChannel(free)}</span>{/if}
              <button type="button" class="open" onclick={() => { warningsDialog.show({ control: path }); }}
                data-help="Open in Problems and warnings: plan a change, show or ignore this warning">Open in Problems and warnings</button></span>
          </li>
        {/each}
      </ul>
    {/if}
    {#key `${setup.id}/${sel.area}/${group}/${sel.index}`}
      <div class="fields">
        {#each FIELDS[sel.area] as field (field.key)}
          <PropertyField
            {field}
            value={control[field.key as keyof typeof control] as string | number}
            {control}
            problem={problems.find((p) => p.property === field.key)?.message}
            hint={deviceHint(sel.area, sel.index, field.key)}
            onchange={(value) => store.setProperty(sel.area, group, sel.index, field.key, value)}
            quiet={field.key === 'number' && /^CC/.test(control.type) ? ccHint(control.number as number) : undefined}
          />
        {/each}
      </div>
    {/key}
  {:else}
    <div class="empty" data-help="Properties: empty until you select a control · click one on the device">
      <h2>No control selected</h2>
      <p>Click a control on the device view, or tab to one and press Enter, to edit its properties here.</p>
      <p class="unofficial">{NOTICE_SHORT}</p>
    </div>
  {/if}
</section>

<style>
  .panel { padding: var(--space-4); }
  .head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-3); }
  .titles { flex: 1 1 auto; }
  h2 { margin: 0; font-size: var(--text-lg); }
  header { margin-bottom: var(--space-3); }
  .where { margin: 0; color: var(--text-muted); font-size: var(--text-sm); }
  .warned { margin: 0 0 var(--space-3); padding: 0; list-style: none; font-size: var(--text-sm); color: var(--warn); }
  .warned li { margin-bottom: var(--space-2); }
  .alsoby { display: block; margin-bottom: var(--space-1); }
  .fix { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-3); }
  .free { color: var(--text); }
  .open { min-height: 24px; padding: 0 var(--space-2); font: inherit; font-size: var(--text-sm); color: var(--text); background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius); cursor: pointer; }
  .open:hover { background: var(--accent-soft); }
  .open:focus-visible { outline: none; border-color: var(--accent); box-shadow: var(--focus-ring); }
  .fields { display: flex; flex-direction: column; gap: var(--space-2); }
  .empty p { color: var(--text-muted); }
  .empty .unofficial { font-size: var(--text-sm); }
</style>
