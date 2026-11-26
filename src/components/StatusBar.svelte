<script lang="ts">
  // The help line and, beside it: the problem stepper, "last exported", and the library's save status.
  import type { LibraryState } from '../storage/index.ts';
  import { formatExported } from '../app/format.ts';
  import type { Warning } from '../model/index.ts';
  import { offerShort, type SwitchUi } from '../app/switchNote.svelte.ts';

  interface Props { waiting?: number; onopenconnections?: () => void; help: string; state: LibraryState | null; problemAt: number; onstep: (delta: 1 | -1) => void; warnings?: readonly Warning[]; warningAt?: number; onstepwarning?: (delta: 1 | -1) => void; switchUi?: SwitchUi | null }
  let { waiting = 0, onopenconnections, help, state: lib, problemAt: at, onstep, warnings = [], warningAt = -1, onstepwarning, switchUi = null }: Props = $props();
  const label = $derived(lib ? { saved: 'saved', saving: 'saving…', failed: 'not saved' }[lib.saveStatus] : '');
  const count = $derived(lib?.problems.length ?? 0);
  const wcount = $derived(warnings.length);
</script>

<footer>
  <p class="help" aria-live="polite">{help}</p>
  {#if waiting > 0}
    <button type="button" class="received" onclick={() => { onopenconnections?.(); }}
      data-help="Dump received: your work is unchanged · click to review or dismiss it in Connections">Dump received: open Connections</button>
  {/if}
  {#if switchUi?.offer}
    <span class="switch" role="status" data-help={`${switchUi.offer.text} · Switch shows it; No keeps what you have`}>
      <span>{offerShort(switchUi.offer)}</span>
      <button type="button" class="yes" onclick={() => { switchUi.accept(false); }}>Switch</button>
      <button type="button" data-help="No: keeps what you have until you open another setup · the “Don't ask again” box is in Connections, under the MIDI monitor" onclick={() => { switchUi.decline(false); }}>No</button>
    </span>
  {:else if switchUi?.note}
    <span class="switch" role="status" data-help="The editor switched as you asked · Back returns to the setup and groups you had">
      <span>{switchUi.note.text}</span>
      <button type="button" onclick={() => { switchUi.back(); }}>Back</button>
    </span>
  {/if}
  {#if lib}
    <div class="status">
      {#if count > 0}
        <span class="problems" data-help="Problems: values the UC4 would not accept, marked in red · ‹ › step through them">
          <button type="button" aria-label="Previous problem" onclick={() => { onstep(-1); }}>‹</button>
          <span>{at >= 0 ? `${at + 1} of ${count}` : count} problem{count === 1 ? '' : 's'}</span>
          <button type="button" aria-label="Next problem" onclick={() => { onstep(1); }}>›</button>
        </span>
      {/if}
      {#if wcount > 0}
        <span class="warnings" data-help="Warnings in this setup: two controls that can play together send the same message; nothing is blocked · ‹ › step through them">
          <button type="button" aria-label="Previous warning" onclick={() => { onstepwarning?.(-1); }}>‹</button>
          <span><span aria-hidden="true">▲</span>&nbsp;{warningAt >= 0 ? `${warningAt + 1} of ${wcount}` : wcount} warning{wcount === 1 ? '' : 's'}</span>
          <button type="button" aria-label="Next warning" onclick={() => { onstepwarning?.(1); }}>›</button>
        </span>
      {/if}
      <span data-help="Last exported: when you last exported all setups as a configuration">last exported: {formatExported(lib.exportState.lastWholeExportAt)}</span>
      <span class="saved" class:failed={lib.saveStatus === 'failed'} data-help="Library status: every change is saved in this browser">{label}</span>
    </div>
  {/if}
</footer>

<style>
  footer {
    display: flex; gap: var(--space-4); align-items: center; height: 36px; padding: 0 var(--space-4);
    background: var(--surface); border-top: 1px solid var(--border);
  }
  p { margin: 0; }
  .help { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .status { flex: none; display: flex; gap: var(--space-4); align-items: center; color: var(--text-muted); font-size: var(--text-sm); }
  .problems { display: flex; align-items: center; gap: var(--space-1); color: var(--danger); }
  .warnings { display: flex; align-items: center; gap: var(--space-1); color: var(--warn); }
  .problems button, .warnings button { min-width: 24px; min-height: 24px; background: transparent; border: 1px solid var(--border); border-radius: var(--radius); color: inherit; cursor: pointer; font-size: 14px; line-height: 1; }
  .problems button:focus-visible, .warnings button:focus-visible { outline: none; border-color: var(--accent); box-shadow: var(--focus-ring); }
  .switch { flex: none; display: flex; align-items: center; gap: var(--space-2); color: var(--text); font-size: var(--text-sm); }
  .switch button { min-width: 24px; min-height: 24px; padding: 0 var(--space-2); font: inherit; color: var(--text); background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius); cursor: pointer; }
  .switch button:hover { background: var(--accent-soft); }
  .switch .yes { color: var(--on-accent); background: var(--accent); border-color: var(--accent); }
  .switch button:focus-visible { outline: none; border-color: var(--accent); box-shadow: var(--focus-ring); }
  .received { flex: none; min-height: 24px; padding: 0 var(--space-2); font: inherit; font-size: var(--text-sm); color: var(--text); background: var(--accent-soft); border: 1px solid var(--accent); border-radius: var(--radius); cursor: pointer; }
  .received:focus-visible { outline: none; box-shadow: var(--focus-ring); }
  .failed { color: var(--danger); font-weight: 600; }
</style>
