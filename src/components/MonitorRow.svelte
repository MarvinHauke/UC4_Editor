<script lang="ts">
  // One monitor row (plan 0008 decisions 3, 8, 12, 18). First line: mark · message · channel · value · the column kept for Map (step 7).
  // Second line: the match with "+n" (UC4 rows), the input's name when two other devices need telling apart, and Split or Join for a pair.
  // `compact` is the one-line monitor: the same row on one line, the match beside the value.
  import type { LiveRow, Match } from '../live/index.ts';
  import { matchLabel, whereWord } from '../app/liveView.ts';
  import { rowLabel, rowText } from '../app/monitorRows.ts';

  interface Props {
    row: LiveRow; source: string; showSource: boolean; compact?: boolean; open?: boolean;
    ontoggle?: () => void; onselect: (match: Match) => void; onpin: (controlId: string | null) => void;
    onsplit: () => void; onjoin: () => void;
  }
  let { row, source, showSource, compact = false, open = false, ontoggle, onselect, onpin, onsplit, onjoin }: Props = $props();
  const t = $derived(rowText(row));
  const label = $derived(row.isUc4 ? matchLabel(row) : null);
  const pair = $derived(row.pair && row.pair.state !== 'waiting' ? row.pair : null);
  const hasSub = $derived(!compact && (row.isUc4 || showSource || pair !== null));
</script>

{#snippet cells()}
  <span class="mark" title={row.isUc4 ? 'From the UC4' : undefined} aria-hidden="true">{row.isUc4 ? 'U' : ''}</span>
  <span class="msg">{t.message}</span>
  <span class="ch">{t.channel}</span>
  <span class="val">{row.valueText}</span>
{/snippet}

<div class="row" class:moved={row.lastMoved} class:compact role="listitem" aria-label={rowLabel(row, source)}
  data-help={`${rowLabel(row, source)}${row.lastMoved ? ' · moved last' : ''}`}>
  {#if row.best}
    <button type="button" class="pick" data-help={`Show ${row.best.control.name} in the editor`} onclick={() => { onselect(row.best!); }}>{@render cells()}</button>
  {:else}
    <div class="pick">{@render cells()}</div>
  {/if}
  {#if compact}
    <span class="solo" title={label ? `${label.name}${label.more > 0 ? ` and ${label.more} more` : ''}` : undefined}>{label ? `${label.name}${label.more > 0 ? ` +${label.more}` : ''}` : ''}</span>
  {:else}
    <span class="act"></span>
  {/if}
  {#if hasSub}
    <div class="sub">
      {#if row.isUc4}
        {#if label}
          <span class="match">{label.name}{#if row.pinned}<span class="pin" title="Pinned" aria-hidden="true">◆</span><span class="sr">pinned</span>{/if}</span>
          {#if label.where}<span class="where">{label.where}</span>{/if}
          {#if label.more > 0}
            <button type="button" class="more" aria-expanded={open} aria-label="{label.more} more {label.more === 1 ? 'match' : 'matches'}"
              data-help="{label.more} more control{label.more === 1 ? ' sends' : 's send'} this message · click to list them and pin the right one"
              onclick={() => { ontoggle?.(); }}>+{label.more}</button>
          {/if}
        {:else}
          <span class="where">no control sends this</span>
        {/if}
      {:else if showSource}
        <span class="where">{source}</span>
      {/if}
      {#if pair}
        {#if pair.state === 'joined'}
          <button type="button" class="pairbtn" data-help={pair.kind === 'ccah' ? 'Split: shows the two CCs of this pair as separate rows, until the tab closes' : 'Split: shows the note on and the note off as separate rows, until the tab closes'} onclick={onsplit}>Split</button>
        {:else}
          <button type="button" class="pairbtn" data-help="Join: shows the pair as one row again" onclick={onjoin}>Join</button>
        {/if}
      {/if}
    </div>
    {#if open && row.matches.length > 1}
      <ul class="alts" aria-label="Controls that send this message">
        {#each row.matches as m, i (m.control.id)}
          {@const w = whereWord(m)}
          <li>
            <span class="altname">{m.control.name}{#if w}<br /><span class="where">{w}</span>{/if}</span>
            {#if i === 0 && row.pinned}
              <button type="button" class="pinbtn" data-help="Unpin: the editor ranks this row again" onclick={() => { onpin(null); }}>Unpin</button>
            {:else}
              <button type="button" class="pinbtn" data-help="Pin: this is the control the row means, until you open another setup" onclick={() => { onpin(m.control.id); }}>Pin</button>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</div>

<style>
  /* The row: the message (a button when it has a match to show) and the reserved Map column; below, the match line and its list. */
  .row { display: grid; grid-template-columns: 1fr var(--target); align-items: center; padding: 0 var(--space-2); border-left: 3px solid transparent; border-bottom: 1px solid var(--border); font-family: var(--mono); font-size: var(--text-sm); }
  .row.moved { background: var(--accent-soft); border-left-color: var(--accent); }
  .row.compact { grid-template-columns: auto 1fr; column-gap: var(--space-2); border-bottom: 0; }
  .pick { display: grid; grid-template-columns: var(--space-4) 1fr 2.2ch 6.5ch; column-gap: var(--space-2); align-items: center; min-height: 28px; margin: 0; padding: 0; font: inherit; color: inherit; text-align: left; background: none; border: 0; border-radius: 0; }
  .compact .pick { grid-template-columns: var(--space-4) auto auto auto; }
  .compact .ch::before { content: 'ch '; }
  button.pick { cursor: pointer; }
  button.pick:hover { background: var(--accent-soft); }
  button.pick:focus-visible { outline: none; box-shadow: inset 0 0 0 2px var(--accent); }
  .solo { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mark { display: grid; place-items: center; height: var(--space-4); font-size: var(--text-sm); font-weight: 600; line-height: 1; color: var(--on-accent); background: var(--accent); border-radius: 3px; }
  .mark:empty { background: none; }
  .ch { text-align: right; color: var(--text-muted); }
  .val { text-align: right; font-variant-numeric: tabular-nums; }
  .sub { grid-column: 1 / -1; display: flex; align-items: center; gap: var(--space-2); min-height: 28px; padding-left: calc(var(--space-4) + var(--space-2)); font-family: var(--font); }
  .match { color: var(--text); font-family: var(--mono); }
  .pin { margin-left: var(--space-1); }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .where { color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .more, .pinbtn, .pairbtn { min-height: 24px; min-width: 24px; padding: 0 var(--space-2); font: inherit; color: var(--text); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); cursor: pointer; }
  .pairbtn { margin-left: auto; }
  .more:hover, .pinbtn:hover, .pairbtn:hover { background: var(--accent-soft); }
  .more:focus-visible, .pinbtn:focus-visible, .pairbtn:focus-visible { outline: none; border-color: var(--accent); box-shadow: var(--focus-ring); }
  .alts { grid-column: 1 / -1; margin: 0 0 var(--space-1); padding: 0 0 0 calc(var(--space-4) + var(--space-2)); list-style: none; font-family: var(--font); }
  .alts li { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); min-height: 28px; }
  .altname { flex: 1; min-width: 0; font-family: var(--mono); overflow-wrap: anywhere; }
  .altname .where { font-family: var(--font); white-space: normal; }
</style>
