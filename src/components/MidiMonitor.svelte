<script lang="ts">
  // The MIDI monitor (plan 0008 decision 3): one row per message key, newest key on top, the value updating in place, the
  // row that moved last marked. Bottom of the Connections column. Listening only.
  // Row layout is fixed now so steps 2 and 7 don't reflow it: the first line is mark · message · channel · value · Map
  // (the last column is reserved, empty until step 7); the second line (input name, later the match label) sits under it.
  import type { Live } from '../app/liveStore.svelte.ts';
  import { pickerOptions, rowLabel, rowText, sourceName } from '../app/monitorRows.ts';

  let { live }: { live: Live } = $props();
  const options = $derived(pickerOptions(live.inputs, live.selection));
  const listening = $derived(live.status.kind === 'listening');
  /** A row names its input only when it is needed to tell two other devices apart: UC4 rows carry the U mark, a lone synth is obvious. */
  const showSource = $derived(live.inputs.filter((i) => !i.isUc4).length > 1);
  /** The connection section already says in full why MIDI is blocked; the monitor says it short (UX checklist 3: the list must not move). */
  const statusText = $derived(live.status.kind === 'denied' || live.status.kind === 'unsupported' ? 'Not listening: see Connection above.' : live.status.message);
</script>

<section class="monitor" aria-label="MIDI monitor">
  <!-- The clock note shares the heading's line, so it appears without moving anything (UX checklist 3). -->
  <h3><span>MIDI monitor</span><small class="note" data-help="MIDI clock and active sensing are not listed: a running DAW would flood the list">{live.clockIgnored ? 'MIDI clock ignored' : ''}</small></h3>
  <div class="bar">
    <select aria-label="MIDI input" value={live.selection} data-help="MIDI input: listen to all inputs or to one; the choice is remembered in this browser"
      onchange={(e) => { live.select(e.currentTarget.value); }}>
      {#each options as o (o.value)}<option value={o.value}>{o.label}</option>{/each}
    </select>
    <button type="button" class="clear" disabled={live.rows.length === 0} data-help="Clear: removes every row; the next message adds its row again" onclick={() => { live.clear(); }}>Clear</button>
  </div>
  <p class="status" class:problem={!listening} data-help={listening ? 'The monitor listens; the editor sends nothing' : 'The monitor is not listening'}>{statusText}</p>
  <div class="head" aria-hidden="true"><span></span><span>Message</span><span class="c">Ch</span><span class="v">Value</span><span></span></div>
  <!-- A scrolling list is focusable so the keyboard can scroll it (UX checklist 9). -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div class="list" role="list" aria-label="Messages" tabindex="0">
    {#each live.rows as row (row.key)}
      {@const t = rowText(row)}
      {@const source = sourceName(row, live.inputs)}
      <div class="row" class:moved={row.lastMoved} role="listitem" aria-label={rowLabel(row, source)}
        data-help={`${rowLabel(row, source)}${row.lastMoved ? ' · moved last' : ''}`}>
        <span class="mark" title={row.isUc4 ? 'From the UC4' : undefined} aria-hidden="true">{row.isUc4 ? 'U' : ''}</span>
        <span class="msg">{t.message}</span>
        <span class="ch">{t.channel}</span>
        <span class="val">{t.value}</span>
        <span class="act"></span>
        {#if showSource && !row.isUc4}<span class="src">{source}</span>{/if}
      </div>
    {:else}
      <p class="empty">{listening ? 'No messages yet. Move a control on a MIDI device and its row appears here.' : 'Nothing to list yet. The line above says what to do.'}</p>
    {/each}
  </div>
</section>

<style>
  .monitor { margin-top: auto; padding-top: var(--space-3); }
  h3 { display: flex; justify-content: space-between; align-items: baseline; gap: var(--space-3); margin: 0 0 var(--space-1); font-size: var(--text-md); }
  .bar { display: flex; gap: var(--space-2); margin-bottom: var(--space-2); }
  select { flex: 1; min-width: 0; min-height: var(--target); padding: 3px var(--space-2); font: inherit; color: var(--text); background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius); }
  select:focus-visible, .clear:focus-visible, .list:focus-visible { outline: none; border-color: var(--accent); box-shadow: var(--focus-ring); }
  .clear { min-height: var(--target); padding: 3px var(--space-3); font: inherit; color: var(--text); background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius); cursor: pointer; }
  .clear:hover:not(:disabled) { background: var(--accent-soft); }
  .clear:disabled { color: var(--text-muted); cursor: default; opacity: 0.6; }
  .status { margin: 0 0 var(--space-1); overflow-wrap: anywhere; color: var(--text-muted); font-size: var(--text-sm); }
  /* Both lines keep their height, so nothing jumps when the note appears or the status changes length (UX checklist 3). */
  .status { min-height: 2.6em; }
  .status.problem { color: var(--text); }
  .note { font-size: var(--text-sm); font-weight: 400; color: var(--text-muted); }
  /* One grid for header and rows: mark · message · channel · value · Map (reserved). */
  .head, .row { display: grid; grid-template-columns: var(--space-4) 1fr 2.2ch 6.5ch var(--target); column-gap: var(--space-2); align-items: center; padding: 0 var(--space-2) 0 calc(var(--space-2) + 3px); box-sizing: border-box; }
  .head { color: var(--text-muted); font-size: var(--text-sm); padding-bottom: var(--space-1); }
  .head .c, .head .v { text-align: right; }
  /* About 8 rows; the area keeps its size when empty (resize and one-line come in step 3). */
  .list { height: 224px; overflow-y: auto; scrollbar-width: thin; background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius); font-family: var(--mono); font-size: var(--text-sm); }
  .row { min-height: 28px; padding-left: var(--space-2); border-left: 3px solid transparent; border-bottom: 1px solid var(--border); }
  .row.moved { background: var(--accent-soft); border-left-color: var(--accent); }
  .mark { display: grid; place-items: center; height: var(--space-4); font-size: var(--text-sm); font-weight: 600; line-height: 1; color: var(--on-accent); background: var(--accent); border-radius: 3px; }
  .mark:empty { background: none; }
  .ch { text-align: right; color: var(--text-muted); }
  .val { text-align: right; font-variant-numeric: tabular-nums; }
  .src { grid-column: 2 / -1; padding-bottom: var(--space-1); color: var(--text-muted); font-family: var(--font); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .empty { margin: 0; padding: var(--space-2); color: var(--text-muted); font-family: var(--font); }
</style>
