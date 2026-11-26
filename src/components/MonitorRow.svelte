<script lang="ts">
  // One monitor row (plan 0008 decisions 3, 8, 12, 24, 25). One line: U mark · message · channel · value · the best match in
  // muted text ("FAd7 · FG1 +1", or "→ Enc1 · EG1" once mapped) · the Map arrow (shown on the hovered, focused or open row).
  // Click on the row, or Enter on its message button, opens the details: the other matches with Pin, Split or Join, the input.
  // Click on the match text itself shows that control in the editor, so the two clicks never clash.
  import type { LiveRow, Match } from '../live/index.ts';
  import { matchLabel, whereWord } from '../app/liveView.ts';
  import { matchText, rowLabel, rowText } from '../app/monitorRows.ts';

  interface Props {
    row: LiveRow; source: string; open?: boolean;
    ontoggle?: () => void; onselect: (match: Match) => void; onpin: (controlId: string | null) => void;
    onsplit: () => void; onjoin: () => void;
    /** Map (steps 7, 8): this row is the armed one; the next row to map; the Map button. */
    armed?: boolean; next?: boolean; onmap?: () => void;
    /** Decision 26: set only when this row's mapped target is in a warning; the ✕ puts that control back to factory. */
    onreset?: () => void;
  }
  let { row, source, open = false, ontoggle, onselect, onpin, onsplit, onjoin, armed = false, next = false, onmap, onreset }: Props = $props();
  const t = $derived(rowText(row));
  const label = $derived(row.isUc4 ? matchLabel(row) : null);
  const text = $derived(matchText(row));
  const full = $derived(row.mappedTo ? `Mapped: sent by ${row.mappedTo.name}` : label ? `${label.name}${label.more > 0 ? ` and ${label.more} more` : ''}${label.where ? ` · ${label.where}` : ''}` : '');
  const pair = $derived(row.pair && row.pair.state !== 'waiting' ? row.pair : null);
  /** A split pair's single message is drawn indented, named by its role ("MSB 8", "on 64"); its place and key stay when the pair is split or joined. */
  const half = $derived(pair?.state === 'split' && pair.role !== null ? pair.role : null);
  // A CCAh half names its role in the message cell; a note half keeps "Note 64" (the value already says on/off), the indent shows it is a half.
  const message = $derived(half === 'msb' || half === 'lsb' ? `${half === 'msb' ? 'MSB' : 'LSB'} ${row.number ?? ''}`.trim() : t.message);
  const roleWord = $derived(half === null ? '' : { msb: ', MSB of a pair', lsb: ', LSB of a pair', on: ', note on half of a pair', off: ', note off half of a pair' }[half]);

  // A click anywhere on the row opens it; the buttons inside (match, Map) do their own thing.
  function rowClick(e: MouseEvent): void {
    if ((e.target as Element).closest('button, a, select, .details')) return;
    ontoggle?.();
  }
</script>

{#snippet cells()}
  <span class="mark" title={row.isUc4 ? 'From the UC4' : undefined} aria-hidden="true">{row.isUc4 ? 'U' : ''}</span>
  <span class="msg">{message}</span>
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
<div class="row" class:moved={row.lastMoved} class:armed class:next class:open class:half={half !== null} role="listitem" aria-label={`${rowLabel(row, source)}${roleWord}`}
  data-help={`${rowLabel(row, source)}${row.lastMoved ? ' · moved last' : ''}`} onclick={rowClick}>
  <button type="button" class="pick" aria-expanded={open} data-help={open ? 'Close the details of this row' : 'Details: the other matches, Pin, Split or Join, and the input'}
    onclick={() => { ontoggle?.(); }}>{@render cells()}</button>
  {#if open && pair}
    <!-- Open pair: the switch takes the match's place on the first line (the details below name the control, with Show). Pressed while split. -->
    <button type="button" class="act split" aria-pressed={pair.state !== 'joined'}
      data-help={pair.state === 'joined' ? (pair.kind === 'ccah' ? 'Split: shows the two CCs of this pair as separate rows, until the tab closes' : 'Split: shows the note on and the note off as separate rows, until the tab closes') : 'Join: shows the pair as one row again'}
      onclick={pair.state === 'joined' ? onsplit : onjoin}>Split</button>
  {:else if row.best && !row.mappedTo}
    <button type="button" class="match" title={full} data-help={`Show ${row.best.control.name} in the editor`} onclick={() => { onselect(row.best!); }}>
      <span class="mtext">{row.best.control.name}</span>{#if row.more > 0}<span class="more">+{row.more}</span>{/if}{#if row.pinned}<span class="pin" title="Pinned" aria-hidden="true">◆</span><span class="sr">pinned</span>{/if}
    </button>
  {:else}
    <span class="mrow">
      <span class="match plain" class:mapped={row.mappedTo !== null} title={full || undefined}>{text || (row.isUc4 ? 'no match' : '')}</span>
      {#if open && row.mappedTo && onreset}
        <button type="button" class="act reset" aria-label={`Reset ${row.mappedTo.name} to factory`}
          data-help={`Reset ${row.mappedTo.name} to factory: the whole control goes back to its factory settings, one undo step · it collides with another control`} onclick={onreset}>✕</button>
      {/if}
    </span>
  {/if}
  {#if !open}{@render mapBtn()}{/if}

  {#if open}
    <div class="details">
      <p class="src">
        <span><span class="where">From</span>&#32;{row.isUc4 ? 'the UC4' : source}</span>
        {#if onmap}
          <button type="button" class="act mapbtn" class:on={armed} aria-pressed={armed} aria-label={armed ? 'Cancel Map' : 'Map to a control'}
            data-help={armed ? 'Map is armed: click a control, or move one on the UC4 · Esc or this button cancels' : 'Map: then click a control, or move one on the UC4, and it sends this message'} onclick={onmap}>{armed ? 'Cancel' : 'Map'}</button>
        {/if}
      </p>
      {#if row.matches.length > 0}
        <ul class="alts" class:single={row.matches.length === 1} aria-label="Controls that send this message">
          {#each row.matches as m, i (m.control.id)}
            {@const w = m.tier === 3 ? whereWord(m) : null}
            <li>
              <span class="altname">{#if i === 0 && row.pinned}<span class="pinmark" title="Pinned" aria-hidden="true">◆</span><span class="sr">pinned </span>{/if}<span class="nm">{m.control.name}</span>{#if w}<span class="where"> · {w}</span>{/if}</span>
              <button type="button" class="act show" data-help="Show {m.control.name} in the editor" onclick={() => { onselect(m); }}>Show</button>
              {#if row.matches.length > 1}
                {#if i === 0 && row.pinned}
                  <button type="button" class="act pinbtn" data-help="Unpin: the editor ranks this row again" onclick={() => { onpin(null); }}>Unpin</button>
                {:else}
                  <button type="button" class="act pinbtn" data-help="Pin: this is the control the row means, until you open another setup" onclick={() => { onpin(m.control.id); }}>Pin</button>
                {/if}
              {/if}
            </li>
          {/each}
        </ul>
      {:else if row.isUc4}
        <p class="where">No control sends this message.</p>
      {/if}
    </div>
  {/if}
</div>

<style>
  /* One line: message cells, the match, the Map arrow. The row is one target (a click anywhere opens it); the band of the row
     that moved last spans the whole row, behind the arrow too. The message column gives way first, never the match. */
  .row { position: relative; display: grid; grid-template-columns: calc(14px + 18ch + 3 * var(--space-1)) minmax(0, auto); column-gap: var(--space-2); align-items: center; padding: 0 var(--space-1); border-left: 3px solid transparent; border-bottom: 1px solid var(--border); font-family: var(--mono); font-size: var(--text-sm); cursor: pointer; }
  .row.half { padding-left: calc(var(--space-1) + var(--space-2)); }
  .row.moved { background-color: var(--accent-soft); border-left-color: var(--accent); }
  .row.open:not(.moved) { background-color: var(--surface); }
  .row:hover { background-image: linear-gradient(color-mix(in srgb, var(--text) 8%, transparent), color-mix(in srgb, var(--text) 8%, transparent)); }
  .row.armed { outline: 2px solid var(--accent); outline-offset: -2px; }
  .row.next:not(.armed) { border-left: 3px dashed var(--accent); }
  .pick { display: grid; grid-template-columns: 14px minmax(0, 8ch) 4ch 6ch; column-gap: var(--space-1); align-items: center; min-width: 0; min-height: 28px; margin: 0; padding: 0; font: inherit; color: inherit; text-align: left; background: none; border: 0; border-radius: 0; cursor: pointer; }
  button.pick:focus-visible { outline: none; box-shadow: inset 0 0 0 2px var(--accent); }
  .mark { display: grid; place-items: center; height: var(--space-4); font-size: var(--text-sm); font-weight: 600; line-height: 1; color: var(--on-accent); background: var(--accent); border-radius: 3px; }
  .mark:empty { background: none; }
  .msg { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ch { color: var(--text-muted); white-space: nowrap; }
  .val { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  /* The match: muted text; a button of its own that shows the control (a click on it does not open the row). Underlined on hover. */
  .match { display: flex; align-items: center; gap: var(--space-1); min-height: 24px; margin: 0; padding: 0 2px; font: inherit; font-family: var(--font); white-space: nowrap; text-align: left; color: var(--text-muted); background: none; border: 0; border-radius: var(--radius); }
  button.match { cursor: pointer; }
  button.match:hover { color: var(--text); text-decoration: underline; text-underline-offset: 3px; }
  button.match:focus-visible { outline: none; color: var(--text); box-shadow: var(--focus-ring); }
  .match.mapped { color: var(--text); }
  .mtext { white-space: nowrap; }
  .pin, .more { flex: none; }
  .mrow { display: flex; align-items: center; gap: var(--space-2); min-width: 0; }
  .reset { flex: none; min-width: 24px; padding: 0 var(--space-1); font-family: var(--font); }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .icon { display: grid; place-items: center; width: 24px; height: 24px; padding: 0; color: var(--text); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); cursor: pointer; }
  .icon:hover { background: var(--accent-soft); }
  .icon.on { color: var(--on-accent); background: var(--accent); border-color: var(--accent); }
  .icon:focus-visible { outline: none; border-color: var(--accent); box-shadow: var(--focus-ring); }
  /* The arrow sits over the right end of the row (the band runs behind it); it shows only where the pointer or focus is. */
  .map { position: absolute; top: 2px; right: 1px; opacity: 0; }
  .row:hover .map, .row:focus-within .map, .row.open .map, .row.armed .map, .row.next .map, .map:focus-visible { opacity: 1; }
  @media (prefers-reduced-motion: no-preference) { .map { transition: opacity 120ms; } }
  .split { justify-self: start; font-family: var(--font); font-size: var(--text-sm); }
  .split[aria-pressed='true'] { color: var(--on-accent); background: var(--accent); border-color: var(--accent); }
  .details { grid-column: 1 / -1; padding: var(--space-1) 0 var(--space-2) calc(14px + var(--space-1)); font-family: var(--font); cursor: default; }
  .src { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); min-height: 28px; margin: 0; overflow: hidden; white-space: nowrap; }
  .src .mapbtn { flex: none; width: 46px; padding: 0 var(--space-1); }
  .src .mapbtn.on { color: var(--on-accent); background: var(--accent); border-color: var(--accent); }
  .where { color: var(--text-muted); }
  .alts { margin: 0; padding: 0; list-style: none; }
  /* Actions in fixed right-aligned columns: Show and Pin/Unpin always stand in the same place. */
  .alts li { display: grid; grid-template-columns: minmax(0, 1fr) 46px 46px; align-items: center; gap: var(--space-2); min-height: 28px; }
  .alts .show { grid-column: 2; } .alts .pinbtn { grid-column: 3; }
  /* One match has nothing to pin: Show is the rightmost button, on the same edge as Map. */
  .alts.single li { grid-template-columns: minmax(0, 1fr) 46px; }
  .pinmark { margin-right: var(--space-1); color: var(--text-muted); }
  .altname { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .alts .act { padding: 0 var(--space-1); }
  .act { box-sizing: border-box; height: 24px; min-width: 24px; padding: 0 var(--space-2); font: inherit; color: var(--text); background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius); cursor: pointer; }
  .act:hover { background: var(--accent-soft); }
  .act:focus-visible { outline: none; border-color: var(--accent); box-shadow: var(--focus-ring); }
</style>
