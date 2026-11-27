<script lang="ts">
  // Kept dumps (plan 0005 decisions 6, 10 and 15): every .syx the editor imported or received, unchanged, newest first.
  // The 5 newest visible ones, then "Show all" (which adds the hidden ones: the backup and the dumps setups need). × asks first (naming the setups that need the dump); Clear old dumps… shows what goes and what stays.
  import type { Store } from '../app/libraryStore.svelte.ts';
  import type { Confirm } from '../app/confirm.svelte.ts';
  import { hasWorkToClear, type KeptDumpInfo } from '../storage/index.ts';
  import { downloadBytes } from '../app/download.ts';
  import { deleteDumpTexts } from '../app/dumpTexts.ts';
  import { NEWEST_SHOWN, clearTexts, deleteNeededTexts, keptNote, keptRow, shownDumps } from '../app/connections.ts';
  import { sameAs } from '../app/dumpNotices.ts';

  let { store, confirm }: { store: Store; confirm: Confirm } = $props();
  let all = $state(false);
  const dumps = $derived(store.state.dumps);
  const shown = $derived(shownDumps(dumps, all));
  const plan = $derived.by(() => { void store.state.dumpLinks; return dumps.length > 0 ? store.planClearDumps() : null; });

  function exportOne(d: KeptDumpInfo): void {
    const r = store.exportDump(d.id);
    if (!r.file) { store.say(r.message ?? 'The dump could not be exported.'); return; }
    downloadBytes(r.file.name, r.file.bytes);
    store.say(`Exported the dump as ${r.file.name}, byte for byte as it came. It is in your browser's downloads.`);
  }
  function askDelete(d: KeptDumpInfo): void {
    const needs = store.dumpNeeds(d.id);
    const linked = Object.values(store.state.dumpLinks).filter((id) => id === d.id).length;
    const texts = needs.length > 0 ? deleteNeededTexts(d, needs) : deleteDumpTexts(d, linked);
    confirm.ask({ ...texts, run: () => { store.deleteDump(d.id); } });
  }
  function askClear(): void {
    const p = store.planClearDumps();
    if (!hasWorkToClear(p)) return;
    confirm.ask({ ...clearTexts(p), run: () => { store.clearOldDumps(); } });
  }
</script>

<section class="dumps" aria-label="Kept dumps" data-help="Kept dumps: every .syx dump imported or received, exactly as it came, newest first">
  {#if dumps.length === 0}
    <p class="empty">No dumps yet. A .syx file you import, or a dump you send from the UC4, is kept here.</p>
  {:else}
    {#if shown.length === 0}<p class="empty">No new dumps. A dump you receive or import shows here.</p>{/if}
    <ul>
      {#each shown as d (d.id)}
        {@const row = keptRow(d)}
        <li>
          <div class="head">
            <strong>{row.kind}</strong>
            <span class="actions">
              <button type="button" class="icon" aria-label="Export .syx: download the dump {row.kind}, {row.meta}, byte for byte as it came" title="Export .syx" onclick={() => { exportOne(d); }} data-help="Export .syx: the kept dump itself, byte for byte, not rebuilt from the setups">
                <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2v7M5 6.5 8 9.5l3-3M2.5 10v3.5h11V10" /></svg>
              </button>
              <button type="button" class="icon x" aria-label="Delete the dump {row.kind}, {row.meta}" onclick={() => { askDelete(d); }} data-help="Delete this dump, after asking; setups made from it keep their content but cannot revert to it, not undoable · click ×">×</button>
            </span>
          </div>
          <span class="meta first">{row.meta}</span>
          {#if d.hidden}<span class="meta kept">{keptNote(d)}</span>{/if}
          {#if store.sentAgain.has(d.id)}<span class="meta again">The UC4 sent it again: {sameAs(d.date)}. Kept once.</span>{/if}
          {#if d.unreadable}<p class="bad">{d.unreadable.reason} {d.unreadable.whatToDo}</p>{/if}
        </li>
      {/each}
    </ul>
    {#if !all && dumps.length > shown.length}
      <button type="button" class="more" data-help="Show all: every kept dump, including your backup and the dumps setups need" onclick={() => { all = true; }}>Show all ({dumps.length})</button>
    {:else if all && (dumps.length > NEWEST_SHOWN || dumps.some((d) => d.hidden))}
      <button type="button" class="more" data-help="Show the newest: back to the short list, without the dim kept dumps" onclick={() => { all = false; }}>Show the newest</button>
    {/if}
    {#if plan && hasWorkToClear(plan)}
      <button type="button" class="more" onclick={askClear} data-help="Clear old dumps: deletes what nothing needs and hides your backup and the dumps setups need · Show all lists them">Clear old dumps…</button>
    {/if}
  {/if}
</section>

<style>
  .empty { margin: 0; font-size: var(--text-sm); color: var(--text-muted); }
  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
  /* Name and meta in the left column; the buttons sit in the right one, centred against those two lines. */
  li { display: grid; grid-template-columns: minmax(0, 1fr) auto; column-gap: var(--space-2); padding: var(--space-1) 0; border-bottom: 1px solid var(--border); }
  .head { display: contents; }
  .head strong { grid-column: 1; grid-row: 1; min-width: 0; overflow-wrap: anywhere; }
  .first { grid-column: 1; grid-row: 2; }
  .kept { grid-column: 1; grid-row: 3; font-style: italic; }
  .again, .bad { grid-column: 1 / -1; }
  .meta { font-size: var(--text-sm); color: var(--text-muted); overflow-wrap: anywhere; }
  .bad { margin: var(--space-1) 0 0; font-size: var(--text-sm); color: var(--danger); }
  .actions { grid-column: 2; grid-row: 1 / span 2; align-self: center; display: flex; gap: var(--space-1); }
  button { min-height: 24px; padding: 0 var(--space-2); font: inherit; font-size: var(--text-sm); background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius); cursor: pointer; }
  .icon { width: 24px; height: 24px; padding: 0; display: inline-flex; align-items: center; justify-content: center; }
  .x { font-size: 14px; }
  .more { display: block; margin-top: var(--space-2); }
  button:hover { background: var(--accent-soft); }
  button:focus-visible { outline: none; border-color: var(--accent); box-shadow: var(--focus-ring); }
</style>
