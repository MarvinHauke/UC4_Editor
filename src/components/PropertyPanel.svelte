<script lang="ts">
  // The selected control's properties, per kind, in the device's order.
  import type { Store } from '../app/libraryStore.svelte.ts';
  import { FIELDS, AREA_NAMES, controlNumber } from '../app/profile/uc4Properties.ts';
  import { controlAt, groupOf, selectedSetup } from '../app/selectors.ts';
  import { controlPath, problemsOf } from '../app/controlProblems.ts';
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
  const panel = $derived.by(() => {
    const state = store.state;
    const sel = state.selection.control;
    if (!sel) return null;
    const { setup, index: setupIndex } = selectedSetup(state);
    const group = groupOf(state, sel.area);
    const control = controlAt(state.configuration, setup.id, sel.area, group, sel.index);
    if (!control) return null;
    const problems = problemsOf(state.problems, controlPath(setupIndex, sel.area, group, sel.index));
    return { sel, group, control, setup, problems };
  });
</script>

<section class="panel" data-copy-level="control" aria-label="Properties">
  <GroupsSection {store} {confirm} />
  {#if panel}
    {@const { sel, group, control, setup, problems } = panel}
    <header>
      <div class="head">
        <h2>{AREA_NAMES[sel.area].singular} {controlNumber(sel.index)}</h2>
        <CopyBar level="control" holding={copy.held?.kind === 'control'} canCopy={true}
        canPaste={copy.held?.kind === 'control' && canPasteControl(copy.held, sel) && !isHeldControl(copy.held, setup.id, sel.area, group, sel.index)}
        what="{AREA_NAMES[sel.area].singular} {controlNumber(sel.index)}"
        onCopy={() => { copy.copy('control'); }} onPaste={() => { copy.paste('control'); }} onStop={() => { copy.stop(); }} />
      </div>
      <p class="where">
        {setup.name} ·
        {sel.area === 'encoders' || sel.area === 'pushButtons' ? `encoder group ${group + 1}` : `fader/button group ${group + 1}`}
      </p>
    </header>
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
  h2 { flex: 1 1 auto; margin: 0; font-size: var(--text-lg); }
  .where { margin: 0 0 var(--space-3); color: var(--text-muted); font-size: var(--text-sm); }
  .fields { display: flex; flex-direction: column; gap: var(--space-2); }
  .empty p { color: var(--text-muted); }
  .empty .unofficial { font-size: var(--text-sm); }
</style>
