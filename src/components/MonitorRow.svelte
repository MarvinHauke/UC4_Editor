<script lang="ts">
  // One monitor row (plan 0008 decisions 3, 8, 12, 18, 24). One line: U mark · message · channel · value · the best match in
  // muted text ("FAd7 · FG1 +1", or "→ Enc1 · EG1" once mapped) · the Map arrow (shown on the hovered, focused or open row).
  // Click on the row, or Enter on its message button, opens the details: the other matches with Pin, Split or Join, the input.
  // Click on the match text itself shows that control in the editor, so the two clicks never clash.
  // `compact` is the one-line monitor: the same row, the message button shows the match's control.
  import type { LiveRow, Match } from '../live/index.ts';
  import { matchLabel, whereWord } from '../app/liveView.ts';
  import { matchText, rowLabel, rowText } from '../app/monitorRows.ts';

  interface Props {
    row: LiveRow; source: string; compact?: boolean; open?: boolean;
    ontoggle?: () => void; onselect: (match: Match) => void; onpin: (controlId: string | null) => void;
    onsplit: () => void; onjoin: () => void;
    /** Map (steps 7, 8): this row is the armed one; the next row to map; the Map button. */
    armed?: boolean; next?: boolean; onmap?: () => void;
  }
  let { row, source, compact = false, open = false, ontoggle, onselect, onpin, onsplit, onjoin, armed = false, next = false, onmap }: Props = $props();
  const t = $derived(rowText(row));
  const label = $derived(row.isUc4 ? matchLabel(row) : null);
  const text = $derived(matchText(row));
  const full = $derived(row.mappedTo ? `Mapped: sent by ${row.mappedTo.name}` : label ? `${label.name}${label.more > 0 ? ` and ${label.more} more` : ''}${label.where ? ` · ${label.where}` : ''}` : '');
  const pair = $derived(row.pair && row.pair.state !== 'waiting' ? row.pair : null);
  const hasDetails = $derived(!compact);

  // A click anywhere on the row opens it; the buttons inside (match, Map) do their own thing.
  function rowClick(e: MouseEvent): void {
    if (compact || (e.target as Element).closest('button, a, select, .details')) return;
    ontoggle?.();
  }
</script>

{#snippet cells()}
  <span class="mark" title={row.isUc4 ? 'From the UC4' : undefined} aria-hidden="true">{row.isUc4 ? 'U' : ''}</span>
  <span class="msg">{t.message}</span>
  <span class="ch">ch{t.channel}</span>
  <span class="val">{row.valueText}</span>
{/snippet}

{#snippet mapBtn()}
  {#if onmap}
    <button type="button" class="icon map" class:on={armed} aria-pressed={armed} aria-label={armed ? 'Cancel Map' : 'Map to a control'} title={armed ? 'Cancel Map' : 'Map'}
      data-help={armed ? 'Map is armed: click a control, or move one on the UC4 · Esc or this button cancels' : 'Map: then click a control, or move one on the UC4, and it sends this message'} onclick={onmap}>
      <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 8h11M9 4l4 4-4 4" /></svg>
    </button>
  {/if}
{/snippet}

<!-- The row's own click is a mouse shortcut for the message button, which is the keyboard's way in. -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<div class="row" class:moved={row.lastMoved} class:armed class:next class:compact class:open role="listitem" aria-label={rowLabel(row, source)}
  data-help={`${rowLabel(row, source)}${row.lastMoved ? ' · moved last' : ''}`} onclick={rowClick}>
  {#if compact}
    {#if row.best}
      <button type="button" class="pick" data-help={`Show ${row.best.control.name} in the editor`} onclick={() => { onselect(row.best!); }}>{@render cells()}</button>
    {:else}
      <div class="pick">{@render cells()}</div>
    {/if}
  {:else}
    <button type="button" class="pick" aria-expanded={open} data-help={open ? 'Close the details of this row' : 'Details: the other matches, Pin, Split or Join, and the input'}
      onclick={() => { ontoggle?.(); }}>{@render cells()}</button>
  {/if}
  {#if row.best && !row.mappedTo && !compact}
    <button type="button" class="match" title={full} data-help={`Show ${row.best.control.name} in the editor`} onclick={() => { onselect(row.best!); }}>
      <span class="mtext">{row.best.control.name}</span>{#if row.more > 0}<span class="more">+{row.more}</span>{/if}{#if row.pinned}<span class="pin" title="Pinned" aria-hidden="true">◆</span><span class="sr">pinned</span>{/if}
    </button>
  {:else}
    <span class="match plain" class:mapped={row.mappedTo !== null} title={full || undefined}>{text || (row.isUc4 ? 'no match' : '')}</span>
  {/if}
  {@render mapBtn()}

  {#if hasDetails && open}
    <div class="details">
      <p class="src"><span class="where">From</span>{' '}{source}{#if row.isUc4}{' '}<span class="where">(the UC4)</span>{/if}</p>
      {#if row.matches.length > 0}
        <ul class="alts" aria-label="Controls that send this message">
          {#each row.matches as m, i (m.control.id)}
            {@const w = whereWord(m)}
            <li>
              <span class="altname">{m.control.name}{#if w}{' '}<span class="where">· {w}</span>{/if}</span>
              <button type="button" class="act" data-help="Show {m.control.name} in the editor" onclick={() => { onselect(m); }}>Show</button>
              {#if row.matches.length > 1}
                {#if i === 0 && row.pinned}
                  <button type="button" class="act" data-help="Unpin: the editor ranks this row again" onclick={() => { onpin(null); }}>Unpin</button>
                {:else}
                  <button type="button" class="act" data-help="Pin: this is the control the row means, until you open another setup" onclick={() => { onpin(m.control.id); }}>Pin</button>
                {/if}
              {/if}
            </li>
          {/each}
        </ul>
      {:else if row.isUc4}
        <p class="where">No control sends this message.</p>
      {/if}
      {#if pair}
        <div class="pairbar">
          {#if pair.state === 'joined'}
            <button type="button" class="act" aria-label="Split into its two messages"
              data-help={pair.kind === 'ccah' ? 'Split: shows the two CCs of this pair as separate rows, until the tab closes' : 'Split: shows the note on and the note off as separate rows, until the tab closes'} onclick={onsplit}>Split</button>
          {:else}
            <button type="button" class="act" aria-label="Join into one row" data-help="Join: shows the pair as one row again" onclick={onjoin}>Join</button>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  /* One line: message cells, the match (takes the rest, truncated), the Map arrow. The details open as a block below. */
  .row { position: relative; display: grid; grid-template-columns: auto minmax(0, 1fr); column-gap: var(--space-1); align-items: center; padding: 0 var(--space-1); border-left: 3px solid transparent; border-bottom: 1px solid var(--border); font-family: var(--mono); font-size: var(--text-sm); }
  .row.moved { background: var(--accent-soft); border-left-color: var(--accent); }
  .row.open { background: var(--surface); }
  .row.moved.open { background: var(--accent-soft); }
  .row.armed { outline: 2px solid var(--accent); outline-offset: -2px; }
  .row.next:not(.armed) { outline: 1px dashed var(--accent); outline-offset: -2px; }
  .row.compact { grid-template-columns: auto minmax(0, 1fr) auto; border-bottom: 0; }
  .row:not(.compact) { cursor: pointer; }
  .pick { display: grid; grid-template-columns: var(--space-4) 8ch 4ch 6ch; column-gap: var(--space-1); align-items: center; min-height: 28px; margin: 0; padding: 0; font: inherit; color: inherit; text-align: left; background: none; border: 0; border-radius: 0; cursor: pointer; }
  .compact .pick { grid-template-columns: var(--space-4) auto auto auto; column-gap: var(--space-2); }
  .compact .map { position: static; opacity: 1; }
  div.pick { cursor: default; }
  button.pick:hover { background: var(--accent-soft); }
  button.pick:focus-visible { outline: none; box-shadow: inset 0 0 0 2px var(--accent); }
  .mark { display: grid; place-items: center; height: var(--space-4); font-size: var(--text-sm); font-weight: 600; line-height: 1; color: var(--on-accent); background: var(--accent); border-radius: 3px; }
  .mark:empty { background: none; }
  .msg { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ch { color: var(--text-muted); white-space: nowrap; }
  .val { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  /* The match: muted text; a button of its own that shows the control (click on it does not open the row). */
  .match { display: flex; align-items: center; gap: var(--space-1); min-width: 0; min-height: 24px; margin: 0; padding: 0 2px; font: inherit; text-align: left; color: var(--text-muted); background: none; border: 0; border-radius: var(--radius); }
  button.match { cursor: pointer; justify-self: start; max-width: 100%; }
  button.match:hover { color: var(--text); background: var(--accent-soft); }
  button.match:focus-visible { outline: none; box-shadow: var(--focus-ring); }
  .row:hover .match, .row.open .match, .row:focus-within .match, .row.armed .match { padding-right: 28px; }
  .match.mapped { color: var(--text); }
  .mtext { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pin, .more { flex: none; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .icon { display: grid; place-items: center; width: 24px; height: 24px; padding: 0; color: var(--text); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); cursor: pointer; }
  .icon:hover { background: var(--accent-soft); }
  .icon.on { color: var(--on-accent); background: var(--accent); border-color: var(--accent); }
  .icon:focus-visible { outline: none; border-color: var(--accent); box-shadow: var(--focus-ring); }
  /* The arrow sits over the right end of the row, so the match keeps the width; it shows only where the pointer or focus is. */
  .map { position: absolute; top: 2px; right: var(--space-1); opacity: 0; }
  .row:hover .map, .row:focus-within .map, .row.open .map, .row.armed .map, .row.next .map, .map:focus-visible { opacity: 1; }
  @media (prefers-reduced-motion: no-preference) { .map { transition: opacity 120ms; } }
  .details { grid-column: 1 / -1; padding: var(--space-1) 0 var(--space-2) calc(var(--space-4) + var(--space-1)); font-family: var(--font); cursor: default; }
  .src { margin: 0 0 var(--space-1); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .where { color: var(--text-muted); }
  .alts { margin: 0; padding: 0; list-style: none; }
  .alts li { display: flex; align-items: center; gap: var(--space-2); min-height: 28px; }
  .altname { flex: 1; min-width: 0; font-family: var(--mono); overflow-wrap: anywhere; }
  .altname .where { font-family: var(--font); }
  .pairbar { display: flex; gap: var(--space-2); margin-top: var(--space-1); }
  .act { min-height: 24px; min-width: 24px; padding: 0 var(--space-2); font: inherit; color: var(--text); background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius); cursor: pointer; }
  .act:hover { background: var(--accent-soft); }
  .act:focus-visible { outline: none; border-color: var(--accent); box-shadow: var(--focus-ring); }
</style>
