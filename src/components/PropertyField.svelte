<script lang="ts">
  // One property of the selected control: a choice (device names with friendly words) or a number.
  import type { Field } from '../app/profile/uc4Properties.ts';
  import { isEmptyEntry } from '../app/numberEntry.ts';
  import { NUMBER_UNUSED_TYPES } from '../app/glyphText.ts';
  import { flashOn, type Flash } from '../app/flash.ts';
  import { VALUE_WORDS, commandTypeLine, maxFor } from '../app/profile/uc4Properties.ts';

  interface Props {
    field: Field;
    value: string | number;
    control: { type: string };
    problem?: string;
    /** How to set this on the UC4 by hand (the help line). */
    hint?: string;
    onchange: (value: string | number) => void;
    /** Resolve's event: the field flashes when it is one of the changed properties. */
    flash?: Flash | null;
  }
  let { field, value, control, problem, hint, onchange, flash = null }: Props = $props();

  const id = $props.id();
  let draftError = $state<string | null>(null);
  // The refused entry's message, shown under the field only after the field is left (nothing moves while typing).
  let leftNote = $state<string | null>(null);
  const max = $derived(field.input === 'number' ? maxFor(field, control) : 0);
  // A saved number or a changed range (undo, paste, another command type) makes an old refusal stale.
  $effect(() => { void value; void max; leftNote = null; });
  const known = $derived(field.input === 'choice' && typeof value === 'string' && field.choices.includes(value));
  const unused = $derived(((field.key === 'lower' || field.key === 'upper') && (control.type === 'CCr1' || control.type === 'CCr2')) || (field.key === 'number' && NUMBER_UNUSED_TYPES.includes(control.type)));
  // The range sits inside the field; the line below says something more (a problem, or a note) or is not there.
  const range = $derived(field.input === 'number' ? `${field.min}–${max}` : '');
  const note = $derived(problem ?? (leftNote !== null ? `${leftNote}; kept ${value}` : null) ?? (field.input === 'number' && unused ? (field.key === 'number' ? 'Not sent by this type' : 'Not used by relative types') : ''));
  // Red on the field only while its draft is refused or the saved value has a problem; after a refusal the field shows the kept, valid number and only the line stays red.
  const invalid = $derived(draftError !== null || problem !== undefined);
  const alarm = $derived(invalid || leftNote !== null);

  // The command type's own line (what it sends, its DAW name) leads the help for that field.
  const typeLine = $derived(field.key === 'type' && typeof value === 'string' ? commandTypeLine(value) : null);

  const parse = (text: string): number | null => {
    const n = Number(text);
    return field.input === 'number' && text !== '' && Number.isInteger(n) && n >= field.min && n <= max ? n : null;
  };
  // Typing only checks; the change is made on Enter or when leaving the field, so one edit is one undo step.
  function typed(e: Event & { currentTarget: HTMLInputElement }): void {
    if (field.input !== 'number') return;
    leftNote = null;
    // Empty while typing is not an error (the user is about to type); only a value that is not allowed is.
    draftError = isEmptyEntry(e.currentTarget.value, e.currentTarget.validity.badInput) || parse(e.currentTarget.value) !== null ? null : `${field.friendly} is a whole number ${field.min}–${max}`;
  }
  function commit(e: Event & { currentTarget: HTMLInputElement }): void {
    if (isEmptyEntry(e.currentTarget.value, e.currentTarget.validity.badInput)) { e.currentTarget.value = String(value); return; } // left empty: the saved number comes back
    const n = parse(e.currentTarget.value);
    // Enter on a refused entry does what leaving the field does (decision 45): the kept number comes back, the red goes, the line stays.
    if (n === null) { leftNote = draftError; draftError = null; e.currentTarget.value = String(value); return; }
    leftNote = null;
    if (n !== value) onchange(n);
  }
  function leave(e: KeyboardEvent & { currentTarget: HTMLInputElement }): void {
    // Escape is the way out that does not save: the saved number comes back.
    if (e.key !== 'Escape') return;
    draftError = null;
    leftNote = null;
    e.currentTarget.value = String(value);
    e.currentTarget.blur();
  }
  function settle(e: FocusEvent & { currentTarget: HTMLInputElement }): void {
    // Leaving the field empty or with a refused entry puts the saved number back.
    if (draftError !== null) leftNote = draftError;
    if (draftError !== null || e.currentTarget.value === '' || e.currentTarget.validity.badInput) { draftError = null; e.currentTarget.value = String(value); }
  }
</script>

<div class="field" use:flashOn={{ flash, target: field.key, ring: true }} data-property={field.key} data-help="{field.friendly}: {field.input === 'choice' ? `one of ${field.choices.join(' ')}` : `${field.min}–${max}${unused ? (field.key === 'number' ? `; the UC4 does not send it for ${control.type}` : '; not used by relative types (CCr1, CCr2)') : ''}`}{typeLine ? ` · ${typeLine}` : ''} · UC4: {hint ?? field.device}">
  <label for={id}><span class="friendly">{field.friendly}</span><span class="device">{field.device}</span></label>
  {#if field.input === 'choice'}
    <select {id} class:invalid value={String(value)} aria-invalid={invalid} onchange={(e) => onchange(e.currentTarget.value)}>
      {#if !known}<option value={String(value)} disabled>{String(value)} · not allowed here</option>{/if}
      {#each field.choices as choice (choice)}
        <option value={choice}>{choice} · {VALUE_WORDS[choice]}</option>
      {/each}
    </select>
  {:else}
    <div class="number">
      <input {id} class:invalid type="number" inputmode="numeric" step="1" min={field.min} {max} {value}
        aria-invalid={invalid} aria-describedby={note ? `${id}-range ${id}-note` : `${id}-range`}
        oninput={typed} onchange={commit} onkeydown={leave} onblur={settle} />
      <span class="range" class:invalid id="{id}-range" aria-hidden="true">{range}</span>
    </div>
  {/if}
  {#if note}<p class="note" id="{id}-note" class:error={alarm} role={alarm ? 'alert' : undefined}>{note}</p>{/if}
</div>

<style>
  .field { display: flex; flex-direction: column; gap: var(--space-1); }
  label { display: flex; justify-content: space-between; align-items: baseline; }
  .friendly { font-weight: 600; }
  .device { font: var(--text-sm) var(--mono); color: var(--text-muted); }
  select, input {
    min-height: var(--target); width: 100%; padding: 3px var(--space-2);
    background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius);
  }
  input { font-family: var(--mono); }
  .number { position: relative; }
  /* Room on the right for the dim range, so a typed value never runs under it. The spin arrows are off (the arrow keys still step). */
  .number input { padding-right: calc(var(--space-4) * 4); appearance: textfield; -moz-appearance: textfield; }
  .number input::-webkit-inner-spin-button, .number input::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
  .range {
    position: absolute; top: 0; bottom: 0; right: var(--space-2); display: flex; align-items: center;
    font: var(--text-sm) var(--mono); color: var(--text-muted); pointer-events: none;
  }
  select:focus-visible, input:focus-visible { outline: none; border-color: var(--accent); box-shadow: var(--focus-ring); }
  .invalid { border-color: var(--danger); }
  .range.invalid { color: var(--danger); }
  .note { margin: 0; font-size: var(--text-sm); line-height: 15px; color: var(--text-muted); }
  .note.error { color: var(--danger); }
</style>
