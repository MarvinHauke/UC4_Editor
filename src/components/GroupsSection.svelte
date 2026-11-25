<script lang="ts">
  // The group of the active section, at the top of the property panel (plan 0006 decision 24): the encoder
  // group (name with its display, reset) or the fader/button group (a row of 8 LEDs with its LED lit, reset).
  // The section is the selected control's; with none selected, the one whose group was stepped last.
  // (The device view shows only the panel; the groups are shown there the device's way.)
  import type { Store } from '../app/libraryStore.svelte.ts';
  import type { Confirm } from '../app/confirm.svelte.ts';
  import { resetEncoderGroupTexts, resetFaderButtonGroupTexts } from '../app/resetTexts.ts';
  import { selectedSetup } from '../app/selectors.ts';
  import { problemsOf } from '../app/controlProblems.ts';
  import { printedGroupName } from '../app/printedNames.ts';
  import { PRINTED_GROUP_NAMES } from '../app/profile/uc4PrintedNames.ts';
  import { kindOfArea } from '../app/carousel.ts';
  import { useActiveArea } from '../app/activeArea.svelte.ts';
  import { suggestGroupName } from '../model/index.ts';
  import GroupLabelField from './GroupLabelField.svelte';
  import GroupNameField from './GroupNameField.svelte';
  import CopyBar from './CopyBar.svelte';
  import PasteIcon from './PasteIcon.svelte';
  import { useCopyHold } from '../app/copyHold.svelte.ts';
  import { flashOn } from '../app/flash.ts';

  let { store, confirm }: { store: Store; confirm: Confirm } = $props();
  const g = $derived.by(() => {
    const state = store.state;
    const { setup, index } = selectedSetup(state);
    const eg = state.selection.encoderGroup;
    const fg = state.selection.faderButtonGroup;
    const found = problemsOf(state.problems, `setups[${index}].encoderGroups[${eg}]`).filter((p) => p.property === 'name');
    return { setup, eg, fg, encPrinted: printedGroupName(PRINTED_GROUP_NAMES, setup, 'encoder', eg), fbPrinted: printedGroupName(PRINTED_GROUP_NAMES, setup, 'faderButton', fg), name: setup.encoderGroups[eg]!.name, encLabel: setup.encoderGroups[eg]!.label ?? '', fbLabel: setup.faderButtonGroups[fg]!.label ?? '', problem: found.length > 0 ? found.map((p) => p.message).join('; ') : undefined };
  });

  // The setup and group are taken when the user asks, not when the confirm is answered.
  function askEncoderReset(): void {
    const { setup, eg, name } = g;
    confirm.ask({ ...resetEncoderGroupTexts(eg, name, setup.name), run: () => { store.resetEncoderGroup(setup.id, eg); } });
  }
  function askFaderButtonReset(): void {
    const { setup, fg } = g;
    confirm.ask({ ...resetFaderButtonGroupTexts(fg, setup.name), run: () => { store.resetFaderButtonGroup(setup.id, fg); } });
  }
  // The section: set when a control is picked (here) or a group is stepped (DeviceView), so an undo or an import never switches it.
  const active = useActiveArea();
  const section = $derived(active.section);
  let pickedArea: string | null = null;
  $effect.pre(() => {
    // A pick in the device view sets the section itself (AreaView); this covers the problem stepper, which picks a control too.
    const c = store.state.selection.control;
    const picked = c ? `${c.area}:${c.index}` : null;
    if (c && picked !== pickedArea) { const kind = kindOfArea(c.area); if (kind) active.setSection(kind); }
    pickedArea = picked;
  });
  // A name suggested from the encoder group's label (decision 25); nothing when there is none or it is the name already.
  const suggestion = $derived(suggestGroupName(g.encLabel));
  const showSuggestion = $derived(suggestion !== '' && suggestion !== g.name);
  // Copy / Paste of a group (decisions 30, 33): the group on show is copied; while a copy of this section's kind is held, the eight
  // group steps show the Paste icon (the copied group stays bright when it is in this setup), and Paste puts it on the shown group.
  const copy = useCopyHold();
  const kind = $derived(section === 'encoder' ? 'encoderGroup' : 'faderButtonGroup');
  const held = $derived(copy.held?.kind === kind ? copy.held : null);
  const shownGroup = $derived(section === 'encoder' ? g.eg : g.fg);
  const isHeld = (n: number): boolean => held !== null && 'group' in held && held.setupId === g.setup.id && held.group === n;
  const noSlot = $derived(g.setup.slot === undefined);
</script>

<section class="groups" data-copy-level="group" aria-label="Groups"
  data-help="Groups: the group of the section you work in, encoder or fader/button · ( ) and {'{'} {'}'} step them">
  <div class="head">
      <h2>{section === 'encoder' ? `Encoder group ${g.eg + 1}` : `Fader/button group ${g.fg + 1}`}{#if section === 'encoder' ? g.encPrinted : g.fbPrinted}<span class="printed">{` · ${section === 'encoder' ? g.encPrinted : g.fbPrinted}`}</span>{/if}</h2>
    <CopyBar level="group" holding={held !== null} canCopy={true} canPaste={held !== null && !isHeld(shownGroup)}
      what={section === 'encoder' ? `encoder group ${g.eg + 1}` : `fader/button group ${g.fg + 1}`}
      onCopy={() => { copy.copy('group'); }} onPaste={() => { copy.paste('group'); }} onStop={() => { copy.stop(); }} />
  </div>
  <div class="copyrow">
    {#if held}
      <div class="steps" role="group" aria-label="Paste onto a group of this setup">
        {#each [0, 1, 2, 3, 4, 5, 6, 7] as n (n)}
          <button type="button" class="step" class:bright={isHeld(n)} class:shown={n === shownGroup} disabled={isHeld(n)} use:flashOn={{ flash: copy.flash, target: `group:${section}:${n}`, ring: true }} tabindex={n === shownGroup ? 0 : -1}
            aria-label="Paste onto {section === 'encoder' ? 'encoder' : 'fader/button'} group {n + 1}" data-help="Paste the copied group onto group {n + 1}, one undo step · Cmd-V"
            onclick={() => { copy.pasteGroupOnto(n); }}>{#if isHeld(n)}{n + 1}{:else}<PasteIcon size={14} /><span>{n + 1}</span>{/if}</button>
        {/each}
      </div>
    {/if}
  </div>
  <div class="body">
    {#if section === 'encoder'}
      {#key `${g.setup.id}/${g.eg}`}
        <GroupNameField name={g.name} group={g.eg} printed={g.encPrinted} problem={g.problem} oncommit={(input) => store.setGroupName(g.eg, input)} />
      {/key}
      {#key `${g.setup.id}/${g.eg}`}
        <GroupLabelField label={g.encLabel} kind="encoder" group={g.eg} oncommit={(l) => store.setGroupLabel('encoder', g.eg, l)}>
          {#if showSuggestion}
            <span class="suggest" data-help="Suggested group name from the label, with characters the display can show">→ <code>{suggestion}</code>
              <button type="button" class="use" aria-label="Use {suggestion.trim()} as the group name"
                data-help="Take {suggestion.trim()} as the name of encoder group {g.eg + 1} · Undo brings the old name back"
                onclick={() => { store.setGroupName(g.eg, suggestion); }}>Use</button></span>
          {/if}
        </GroupLabelField>
      {/key}
      <button type="button" data-group-reset disabled={noSlot} onclick={askEncoderReset}
        data-help="Reset encoder group {g.eg + 1}: name, label, encoders and push buttons back to factory, after asking · Undo brings it back">
        ↺ Reset encoder group {g.eg + 1}…
      </button>
    {:else}
      <div class="leds row" data-help="Group LED {g.fg + 1}{g.fbPrinted ? ` · ${g.fbPrinted}` : ''}: the fader/button group on show · Shift + click green button n · UC4: the lit LED above the green buttons">
        <span class="cap">LEDs</span>
        <div class="dots" aria-hidden="true">{#each [0, 1, 2, 3, 4, 5, 6, 7] as i (i)}<span class="led" class:lit={i === g.fg}></span>{/each}</div>
      </div>
      {#key `${g.setup.id}/${g.fg}`}
        <GroupLabelField label={g.fbLabel} kind="faderButton" group={g.fg} oncommit={(l) => store.setGroupLabel('faderButton', g.fg, l)} />
      {/key}
      <button type="button" data-group-reset disabled={noSlot} onclick={askFaderButtonReset}
        data-help="Reset fader/button group {g.fg + 1}: label, faders, crossfader and green buttons back to factory, after asking · Undo brings it back">
        ↺ Reset fader/button group {g.fg + 1}…
      </button>
    {/if}
  </div>
</section>

<style>
  .groups { padding-bottom: var(--space-3); margin-bottom: var(--space-3); border-bottom: 1px solid var(--border); }
  .head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-3); margin-bottom: var(--space-2); }
  h2 { flex: 1 1 auto; margin: 0; font-size: var(--text-lg); }
  .printed { font-weight: 400; color: var(--text-muted); }
  /* Same rows in both sections (title, group row, label, reset): label and reset sit at the same height. */
  .copyrow { display: flex; flex-direction: column; gap: var(--space-2); margin-bottom: var(--space-2); }
  .steps { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--space-1); }
  .step { display: flex; align-items: center; justify-content: center; gap: 2px; padding: 0; min-height: var(--target); opacity: 0.8; color: var(--accent); font-size: var(--text-sm); }
  .step.bright { opacity: 1; color: var(--text); border-color: var(--text-muted); font-weight: 700; }
  .step.shown { border-color: var(--accent); }
  .body { display: flex; flex-direction: column; gap: var(--space-2); }
  .row { display: flex; gap: var(--space-2); align-items: center; height: 40px; }
  .cap { flex: none; min-width: 40px; white-space: nowrap; font-weight: 600; }
  .dots { display: flex; gap: var(--space-2); }
  .led { width: 16px; height: 16px; border-radius: 50%; background: var(--led-off); border: 1px solid var(--border); }
  .led.lit { background: var(--group); border-color: var(--group); }
  .suggest { flex: none; display: flex; align-items: center; gap: var(--space-1); font-size: var(--text-sm); color: var(--text-muted); }
  .suggest code { font: var(--text-md) var(--mono); color: var(--text); }
  .use { min-height: 24px; padding: 0 var(--space-2); font-size: var(--text-sm); }
  button { min-height: var(--target); padding: 3px var(--space-2); text-align: left; background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius); cursor: pointer; }
  .use { text-align: center; }
  button:hover:not(:disabled) { background: var(--accent-soft); }
  button:focus-visible { outline: none; border-color: var(--accent); box-shadow: var(--focus-ring); }
  button:disabled { opacity: 0.5; cursor: default; }
</style>
