<script lang="ts">
  // The MIDI monitor (plan 0008 decisions 3, 11, 18): one row per message key, newest key on top, the value updating in place, the
  // row that moved last marked. Bottom of the Connections column; the list is resized by dragging its top edge and can shrink to
  // one line (the last message with its match). Listening only.
  import type { Live } from '../app/liveStore.svelte.ts';
  import { pickerOptions, sourceName } from '../app/monitorRows.ts';
  import { MONITOR_HEIGHT, loadSize, saveSize, type MonitorSize } from '../app/monitorSize.ts';
  import type { Match } from '../live/index.ts';
  import MonitorRow from './MonitorRow.svelte';
  import MonitorResizeHandle from './MonitorResizeHandle.svelte';

  let { live, onselectmatch }: { live: Live; onselectmatch: (match: Match) => void } = $props();
  /** The row whose other matches are listed ("+2"). */
  let openKey = $state<string | null>(null);
  let size = $state<MonitorSize>(loadSize());
  const setSize = (next: Partial<MonitorSize>, keep = true): void => { size = { ...size, ...next }; if (keep) saveSize(size); };
  const options = $derived(pickerOptions(live.inputs, live.selection));
  const listening = $derived(live.status.kind === 'listening');
  /** A row names its input only when it is needed to tell two other devices apart: UC4 rows carry the U mark, a lone synth is obvious. */
  const showSource = $derived(live.inputs.filter((i) => !i.isUc4).length > 1);
  /** The connection section already says in full why MIDI is blocked; the monitor says it short (UX checklist 3: the list must not move). */
  const statusText = $derived(live.status.kind === 'denied' || live.status.kind === 'unsupported' ? 'Not listening: see Connection above.' : live.status.message);
  /** The one line: the row that moved last. */
  const last = $derived(live.rows.find((r) => r.lastMoved) ?? live.rows[0] ?? null);
</script>

<section class="monitor" aria-label="MIDI monitor">
  <!-- The clock note shares the heading's line, so it appears without moving anything (UX checklist 3). -->
  <h3>
    <span>MIDI monitor</span>
    <small class="note" data-help="MIDI clock and active sensing are not listed: a running DAW would flood the list">{live.clockIgnored ? 'MIDI clock ignored' : ''}</small>
    <button type="button" class="fold" aria-expanded={!size.oneLine} data-help={size.oneLine ? 'Show the list: all rows again' : 'One line: shows only the last message with its match'}
      onclick={() => { setSize({ oneLine: !size.oneLine }); }}>{size.oneLine ? 'Show list' : 'One line'}</button>
  </h3>
  {#if size.oneLine}
    <div class="oneline" aria-live="off">
      {#if last}
        <MonitorRow compact row={last} source={sourceName(last, live.inputs)} showSource={false} onselect={onselectmatch}
          onpin={() => {}} onsplit={() => {}} onjoin={() => {}} />
      {:else}
        <p class="empty">{listening ? 'No messages yet.' : statusText}</p>
      {/if}
    </div>
  {:else}
    <div class="bar">
      <select aria-label="MIDI input" value={live.selection} data-help="MIDI input: listen to all inputs or to one; the choice is remembered in this browser"
        onchange={(e) => { live.select(e.currentTarget.value); }}>
        {#each options as o (o.value)}<option value={o.value}>{o.label}</option>{/each}
      </select>
      <button type="button" class="clear" disabled={live.rows.length === 0} data-help="Clear: removes every row; the next message adds its row again" onclick={() => { live.clear(); }}>Clear</button>
    </div>
    <p class="status" class:problem={!listening} data-help={listening ? 'The monitor listens; the editor sends nothing' : 'The monitor is not listening'}>{statusText}</p>
    <div class="head" aria-hidden="true"><span></span><span>Message</span><span class="c">Ch</span><span class="v">Value</span><span></span></div>
    <MonitorResizeHandle height={size.height} onresize={(h) => { setSize({ height: h }, false); }} oncommit={(h) => { setSize({ height: h }); }} />
    <!-- A scrolling list is focusable so the keyboard can scroll it (UX checklist 9). -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div class="list" role="list" aria-label="Messages" tabindex="0" style:height="{size.height}px">
      {#each live.rows as row (row.key)}
        <MonitorRow {row} source={sourceName(row, live.inputs)} {showSource} open={openKey === row.key}
          ontoggle={() => { openKey = openKey === row.key ? null : row.key; }}
          onselect={onselectmatch} onpin={(id) => { live.pin(row.key, id); }}
          onsplit={() => { if (row.pair) live.split(row.pair.key); }} onjoin={() => { if (row.pair) live.join(row.pair.key); }} />
      {:else}
        <p class="empty">{listening ? 'No messages yet. Move a control on a MIDI device and its row appears here.' : 'Nothing to list yet. The line above says what to do.'}</p>
      {/each}
    </div>
  {/if}
</section>

<style>
  /* The action column's width: two 24 px icon buttons and their gap, shared by the header and every row. */
  .monitor { --act-w: 52px; margin-top: auto; padding-top: var(--space-3); }
  h3 { display: flex; justify-content: space-between; align-items: center; gap: var(--space-3); margin: 0 0 var(--space-1); font-size: var(--text-md); }
  .note { flex: 1; text-align: right; font-size: var(--text-sm); font-weight: 400; color: var(--text-muted); }
  .fold { min-height: 24px; padding: 0 var(--space-2); font: inherit; font-size: var(--text-sm); font-weight: 400; color: var(--text); background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius); cursor: pointer; }
  .fold:hover { background: var(--accent-soft); }
  .bar { display: flex; gap: var(--space-2); margin-bottom: var(--space-2); }
  select { flex: 1; min-width: 0; min-height: var(--target); padding: 3px var(--space-2); font: inherit; color: var(--text); background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius); }
  select:focus-visible, .clear:focus-visible, .list:focus-visible, .fold:focus-visible { outline: none; border-color: var(--accent); box-shadow: var(--focus-ring); }
  .clear { min-height: var(--target); padding: 3px var(--space-3); font: inherit; color: var(--text); background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius); cursor: pointer; }
  .clear:hover:not(:disabled) { background: var(--accent-soft); }
  .clear:disabled { color: var(--text-muted); cursor: default; opacity: 0.6; }
  .status { margin: 0 0 var(--space-1); overflow-wrap: anywhere; color: var(--text-muted); font-size: var(--text-sm); }
  /* The status keeps its height, so nothing jumps when its text changes length (UX checklist 3). */
  .status { min-height: 2.6em; }
  .status.problem { color: var(--text); }
  .head { display: grid; grid-template-columns: var(--space-4) 1fr 2.2ch 6.5ch var(--act-w); column-gap: var(--space-2); align-items: center; padding: 0 var(--space-2) var(--space-1) calc(var(--space-2) + 3px); color: var(--text-muted); font-size: var(--text-sm); }
  .head .c, .head .v { text-align: right; }
  .list, .oneline { overflow-y: auto; scrollbar-width: thin; background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius); }
  .list { height: 224px; }
  .oneline { min-height: 30px; }
  .empty { margin: 0; padding: var(--space-2); color: var(--text-muted); font-size: var(--text-sm); }
</style>
