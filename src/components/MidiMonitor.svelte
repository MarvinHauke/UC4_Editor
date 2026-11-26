<script lang="ts">
  // The MIDI monitor (plan 0008 decision 3): one row per message key, newest key on top, the value updating in place, the
  // row that moved last marked. Bottom of the Connections column. Listening only.
  // Row layout is fixed now so steps 2 and 7 don't reflow it: the first line is mark · message · channel · value · Map
  // (the last column is reserved, empty until step 7); the second line (input name, later the match label) sits under it.
  import type { Live } from '../app/liveStore.svelte.ts';
  import { pickerOptions, rowLabel, rowText, sourceName } from '../app/monitorRows.ts';
  import { matchLabel, whereWord } from '../app/liveView.ts';
  import type { Match } from '../live/index.ts';

  let { live, onselectmatch }: { live: Live; onselectmatch: (match: Match) => void } = $props();
  /** The row whose other matches are listed ("+2"). */
  let openKey = $state<string | null>(null);
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
      {@const label = row.isUc4 ? matchLabel(row) : null}
      <div class="row" class:moved={row.lastMoved} role="listitem" aria-label={rowLabel(row, source)}
        data-help={`${rowLabel(row, source)}${row.lastMoved ? ' · moved last' : ''}`}>
        {#snippet cells()}
          <span class="mark" title={row.isUc4 ? 'From the UC4' : undefined} aria-hidden="true">{row.isUc4 ? 'U' : ''}</span>
          <span class="msg">{t.message}</span>
          <span class="ch">{t.channel}</span>
          <span class="val">{row.valueText}</span>
        {/snippet}
        {#if row.best}
          <button type="button" class="pick" data-help={`Show ${row.best.control.name} in the editor`} onclick={() => { onselectmatch(row.best!); }}>{@render cells()}</button>
        {:else}
          <div class="pick">{@render cells()}</div>
        {/if}
        <span class="act"></span>
        {#if row.isUc4}
          <div class="sub">
            {#if label}
              <span class="match" class:pinned={row.pinned}>{label.name}{#if row.pinned}<span class="pin" title="Pinned" aria-hidden="true">◆</span><span class="sr">pinned</span>{/if}</span>
              {#if label.where}<span class="where">{label.where}</span>{/if}
              {#if label.more > 0}
                <button type="button" class="more" aria-expanded={openKey === row.key} aria-label="{label.more} more {label.more === 1 ? 'match' : 'matches'}"
                  data-help="{label.more} more control{label.more === 1 ? ' sends' : 's send'} this message · click to list them and pin the right one"
                  onclick={() => { openKey = openKey === row.key ? null : row.key; }}>+{label.more}</button>
              {/if}
            {:else}
              <span class="where">no control sends this</span>
            {/if}
          </div>
          {#if openKey === row.key && row.matches.length > 1}
            <ul class="alts" aria-label="Controls that send this message">
              {#each row.matches as m, i (m.control.id)}
                {@const w = whereWord(m)}
                <li>
                  <span class="altname">{m.control.name}{#if w}<br /><span class="where">{w}</span>{/if}</span>
                  {#if i === 0 && row.pinned}
                    <button type="button" class="pinbtn" data-help="Unpin: the editor ranks this row again" onclick={() => { live.pin(row.key, null); }}>Unpin</button>
                  {:else if i > 0 || !row.pinned}
                    <button type="button" class="pinbtn" data-help="Pin: this is the control the row means, until you open another setup" onclick={() => { live.pin(row.key, m.control.id); }}>Pin</button>
                  {/if}
                </li>
              {/each}
            </ul>
          {/if}
        {:else if showSource}<div class="sub"><span class="where">{source}</span></div>{/if}
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
  .head { display: grid; grid-template-columns: var(--space-4) 1fr 2.2ch 6.5ch var(--target); column-gap: var(--space-2); align-items: center; padding: 0 var(--space-2) 0 calc(var(--space-2) + 3px); box-sizing: border-box; }
  .head { color: var(--text-muted); font-size: var(--text-sm); padding-bottom: var(--space-1); }
  .head .c, .head .v { text-align: right; }
  /* About 8 rows; the area keeps its size when empty (resize and one-line come in step 3). */
  .list { height: 224px; overflow-y: auto; scrollbar-width: thin; background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius); font-family: var(--mono); font-size: var(--text-sm); }
  /* The row: the message (a button when it has a match to show) and the reserved Map column; below, the match line and its list. */
  .row { display: grid; grid-template-columns: 1fr var(--target); align-items: center; padding: 0 var(--space-2) 0 var(--space-2); border-left: 3px solid transparent; border-bottom: 1px solid var(--border); }
  .pick { display: grid; grid-template-columns: var(--space-4) 1fr 2.2ch 6.5ch; column-gap: var(--space-2); align-items: center; min-height: 28px; margin: 0; padding: 0; font: inherit; color: inherit; text-align: left; background: none; border: 0; border-radius: 0; }
  button.pick { cursor: pointer; }
  button.pick:hover { background: var(--accent-soft); }
  button.pick:focus-visible { outline: none; box-shadow: inset 0 0 0 2px var(--accent); }
  .sub { grid-column: 1 / -1; display: flex; align-items: center; gap: var(--space-2); min-height: 22px; padding-left: calc(var(--space-4) + var(--space-2)); font-family: var(--font); }
  .match { color: var(--text); font-family: var(--mono); }
  .where { color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pin { margin-left: var(--space-1); }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .more, .pinbtn { min-height: 24px; min-width: 24px; padding: 0 var(--space-2); font: inherit; color: var(--text); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); cursor: pointer; }
  .more:hover, .pinbtn:hover { background: var(--accent-soft); }
  .more:focus-visible, .pinbtn:focus-visible { outline: none; border-color: var(--accent); box-shadow: var(--focus-ring); }
  .alts { grid-column: 1 / -1; margin: 0 0 var(--space-1); padding: 0 0 0 calc(var(--space-4) + var(--space-2)); list-style: none; font-family: var(--font); }
  .alts li { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); min-height: 28px; }
  .altname { flex: 1; min-width: 0; font-family: var(--mono); overflow-wrap: anywhere; }
  .altname .where { font-family: var(--font); white-space: normal; }
  .row.moved { background: var(--accent-soft); border-left-color: var(--accent); }
  .mark { display: grid; place-items: center; height: var(--space-4); font-size: var(--text-sm); font-weight: 600; line-height: 1; color: var(--on-accent); background: var(--accent); border-radius: 3px; }
  .mark:empty { background: none; }
  .ch { text-align: right; color: var(--text-muted); }
  .val { text-align: right; font-variant-numeric: tabular-nums; }
  .empty { margin: 0; padding: var(--space-2); color: var(--text-muted); font-family: var(--font); }
</style>
