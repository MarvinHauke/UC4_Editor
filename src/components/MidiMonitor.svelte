<script lang="ts">
  // The MIDI monitor (plan 0008 decisions 3, 11, 24, 25): one line per message key, newest key on top, the value updating in
  // place, the row that moved last marked. Bottom of the Connections column, it fills the height left there and only its list
  // scrolls; it folds from its heading in the column. Listening only.
  import type { Live } from '../app/liveStore.svelte.ts';
  import { clickTarget, pickerOptions, sourceName, statusLine } from '../app/monitorRows.ts';
  import type { Match } from '../live/index.ts';
  import MonitorRow from './MonitorRow.svelte';
  import { useMap } from '../app/mapFlow.svelte.ts';
  import { useFollow } from '../app/followState.svelte.ts';

  let { live, onselectmatch }: { live: Live; onselectmatch: (match: Match) => void } = $props();
  /** The row whose other matches are listed ("+2"). */
  let openKey = $state<string | null>(null);
  const mapUi = useMap();
  const follow = useFollow();
  const map = mapUi.flow;
  const options = $derived(pickerOptions(live.inputs, live.selection));
  const listening = $derived(live.status.kind === 'listening');
  /** The connection section already says in full why MIDI is blocked; the monitor says it short (UX checklist 3: the list must not move). */
  const statusText = $derived(live.status.kind === 'denied' || live.status.kind === 'unsupported' ? 'Not listening: see Connection above.' : statusLine(live.status.message, listening, live.clockIgnored));
</script>

<section class="monitor" aria-label="MIDI monitor">
  <div class="bar">
    <select aria-label="MIDI input" value={live.selection} data-help="MIDI input: listen to all inputs or to one; the choice is remembered in this browser"
      onchange={(e) => { live.select(e.currentTarget.value); }}>
      {#each options as o (o.value)}<option value={o.value}>{o.label}</option>{/each}
    </select>
    <button type="button" class="clear" disabled={live.rows.length === 0} data-help="Clear: removes every row; the next message adds its row again" onclick={() => { live.clear(); }}>Clear</button>
  </div>
  <p class="status" class:problem={!listening} data-help={listening ? 'The monitor listens; the editor sends nothing · MIDI clock and active sensing are not listed: a running DAW would flood the list' : 'The monitor is not listening'}>{statusText}</p>
  <!-- A scrolling list is focusable so the keyboard can scroll it (UX checklist 9). -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div class="list" role="list" aria-label="Messages" tabindex="0">
    {#each live.rows as row (row.key)}
      <MonitorRow {row} source={sourceName(row, live.inputs)} open={openKey === row.key}
        ontoggle={() => { const opening = openKey !== row.key; openKey = opening ? row.key : null; const m = clickTarget(row, opening, follow.on); if (m) onselectmatch(m); }}
        onreset={row.mappedTo && mapUi.canReset(row.mappedTo) ? () => { map.resetToFactory(row.key, row.mappedTo!); } : undefined}
        armed={map.armed === row.key} next={map.nextKey === row.key} onmap={() => { map.toggle(row.key); }}
        onselect={onselectmatch} onpin={(id) => { live.pin(row.key, id); }} />
    {:else}
      <p class="empty">{listening ? 'No messages yet. Move a control on a MIDI device and its row appears here.' : 'Nothing to list yet. The line above says what to do.'}</p>
    {/each}
  </div>
</section>

<style>
  /* The monitor takes the height left in the column (the list is the only thing that scrolls); a floor keeps it usable. */
  .monitor { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; }
  .monitor > :global(*) { flex: none; }
  .monitor > .list { flex: 1 1 0; min-height: 0; }
  .bar { display: flex; gap: var(--space-2); margin-bottom: var(--space-2); }
  select { flex: 1; min-width: 0; min-height: var(--target); padding: var(--space-1) var(--space-2); font: inherit; color: var(--text); background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius); }
  select:focus-visible, .clear:focus-visible, .list:focus-visible { outline: none; border-color: var(--accent); box-shadow: var(--focus-ring); }
  .clear { flex: none; box-sizing: border-box; width: 72px; min-height: var(--target); padding: var(--space-1) var(--space-3); font: inherit; font-size: var(--text-md); font-weight: 400; color: var(--text); background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius); cursor: pointer; }
  .clear:hover:not(:disabled) { background: var(--accent-soft); }
  .clear:disabled { color: var(--text-muted); cursor: default; opacity: 0.6; }
  .status { margin: 0 0 var(--space-1); overflow-wrap: anywhere; color: var(--text-muted); font-size: var(--text-sm); }
  .status.problem { color: var(--text); }
  /* One scrollbar, thin, only while the pointer or focus is on the list. */
  .list { overflow-y: auto; scrollbar-width: thin; scrollbar-color: transparent transparent; background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius); }
  .list:hover, .list:focus-within { scrollbar-color: var(--border) transparent; }
  .list::-webkit-scrollbar { width: 8px; }
  .list::-webkit-scrollbar-thumb { background: transparent; border-radius: 4px; }
  .list:hover::-webkit-scrollbar-thumb, .list:focus-within::-webkit-scrollbar-thumb { background: var(--border); }
  .empty { margin: 0; padding: var(--space-2); color: var(--text-muted); font-size: var(--text-sm); }
</style>
