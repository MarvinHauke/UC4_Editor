<script lang="ts">
  // The name of the encoder group on show: a text field with a 7-segment preview and hints for characters
  // the display lacks. The input is filtered as typed (normalizeGroupName); the change is made on Enter or
  // when leaving the field, so one edit is one undo step.
  import { normalizeGroupName } from '../model/index.ts';
  import { DIGIT } from '../app/profile/uc4Segments.ts';
  import SevenSegmentDisplay from './SevenSegmentDisplay.svelte';

  interface Props { name: string; group: number; /** The group's printed name in SE17/SE18 ("Send 1"). */ printed?: string; problem?: string; oncommit: (input: string) => void }
  let { name, group, printed, problem, oncommit }: Props = $props();

  const id = $props.id();
  let draft = $state<string | null>(null);
  let hints = $state<string[]>([]);
  const shown = $derived(draft ?? name.trimEnd());

  function typed(e: Event & { currentTarget: HTMLInputElement }): void {
    const input = e.currentTarget;
    const { text, hints: found } = normalizeGroupName(input.value);
    if (text !== input.value) {
      // Keep the caret where the user typed: count what survives the filter before it.
      const caret = Math.min(normalizeGroupName(input.value.slice(0, input.selectionStart ?? input.value.length)).text.length, text.length);
      input.value = text;
      input.setSelectionRange(caret, caret);
    }
    draft = text;
    // Hints add up while editing; the cut-off hint is one line however many characters were cut.
    hints = [...new Set([...hints, ...found.map((h) => (h.startsWith('a group name has 4 characters') ? CUT_OFF : h))])];
  }
  const CUT_OFF = 'a group name has 4 characters; everything after them was cut off';
  function leave(e: KeyboardEvent & { currentTarget: HTMLInputElement }): void {
    // Escape is the way out that does not save.
    if (e.key !== 'Escape') return;
    draft = null;
    hints = [];
    e.currentTarget.value = name.trimEnd();
    e.currentTarget.blur();
  }
  function commit(): void {
    if (draft !== null && draft.padEnd(4, ' ') !== name) oncommit(draft);
    draft = null;
    hints = [];
  }
  const previewWidth = 3 * DIGIT.pitch + DIGIT.width + 16;
</script>

<div class="name">
  <div class="row"
    data-help="Group name of encoder group {group + 1}: 4 characters (no k or w{printed ? `; printed ${printed}` : ''}) · UC4: edit mode, Shift + encoders 1–4">
    <label for={id}>Name</label>
    <input {id} type="text" value={shown} autocomplete="off" spellcheck="false" aria-invalid={problem !== undefined && hints.length === 0}
      aria-describedby="{id}-note"
      oninput={typed} onkeydown={leave} onchange={commit} onblur={commit} />
    <svg viewBox="0 0 {previewWidth} 46" class="preview" aria-hidden="true">
      <SevenSegmentDisplay name={shown} width={previewWidth} height={46} />
    </svg>
  </div>
  <!-- A muted line only while a typed character was dropped; a red one for a problem. The height changes only then. -->
  <div id="{id}-note" aria-live="polite">
    {#if hints.length > 0}<p class="hint">{hints.join('; ')}</p>
    {:else if problem}<p class="error">{problem}</p>{/if}
  </div>
</div>

<style>
  .name { display: flex; flex-direction: column; }
  .row { display: flex; gap: var(--space-2); align-items: center; height: 40px; }
  label { flex: none; min-width: 40px; white-space: nowrap; font-weight: 600; }
  input {
    flex: 1; min-width: 0; min-height: var(--target); padding: 3px var(--space-2); font-family: var(--mono);
    background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius);
  }
  input:focus-visible { outline: none; border-color: var(--accent); box-shadow: var(--focus-ring); }
  input[aria-invalid='true'] { border-color: var(--danger); }
  .preview { flex: none; width: 88px; height: auto; }
  .hint { margin: var(--space-1) 0 0; font-size: var(--text-sm); color: var(--text-muted); }
  .error { margin: var(--space-1) 0 0; font-size: var(--text-sm); color: var(--danger); }
</style>
