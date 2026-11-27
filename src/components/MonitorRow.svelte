<script lang="ts">
  // One monitor row (plan 0008 decision 34). Closed: UC4 chip · message · channel · value · "→" once mapped · [Map] (hover, focus, last moved).
  // Click on the row, or Enter on its message button, opens it: the control name(s) with Show and Pin, the input, a pair's parts, ✕.
  import type { LiveRow, Match } from '../live/index.ts';
  import { whereWord } from '../app/liveView.ts';
  import { rowLabel, rowText } from '../app/monitorRows.ts';

  interface Props {
    row: LiveRow; source: string; open?: boolean;
    ontoggle?: () => void; onselect: (match: Match) => void; onpin: (controlId: string | null) => void;
    /** Map (steps 7, 8): this row is the armed one; the next row to map; the Map button. */
    armed?: boolean; next?: boolean; onmap?: () => void;
    /** Decision 26: set only when this row's mapped target is in a warning; the ✕ puts that control back to factory. */
    onreset?: () => void;
  }
  let { row, source, open = false, ontoggle, onselect, onpin, armed = false, next = false, onmap, onreset }: Props = $props();
  const t = $derived(rowText(row));
  const full = $derived(row.mappedTo ? `Mapped: sent by ${row.mappedTo.name}` : '');
  /** The open row's parts as plain text: "MSB 64 · LSB 0" for a CCAh pair, "last on 127 · last off 0" for a note; a part never seen is left out. */
  const partsText = $derived.by(() => {
    const parts = row.pair?.parts;
    if (!parts) return '';
    const items = 'msb' in parts
      ? [parts.msb !== null && `MSB ${parts.msb}`, parts.lsb !== null && `LSB ${parts.lsb}`]
      : [parts.lastOn !== null && `last on ${parts.lastOn}`, parts.lastOff !== null && `last off ${parts.lastOff}`];
    return items.filter((x) => x !== false).join(' · ');
  });

  // A click anywhere on the row opens it; the buttons inside (Map, Show, Pin, ✕) do their own thing.
  function rowClick(e: MouseEvent): void {
    if ((e.target as Element).closest('button, a, select, .details')) return;
    ontoggle?.();
  }
</script>

{#snippet cells()}
  <span class="mark" title={row.isUc4 ? 'From the UC4' : undefined} aria-hidden="true">{row.isUc4 ? 'UC4' : ''}</span>
  <span class="msg">{t.message}</span>
  <span class="ch">ch{t.channel}</span>
  <span class="val">{row.valueText}</span>
{/snippet}

{#snippet mapBtn()}
  {#if onmap}
    <button type="button" class="map" class:on={armed} aria-pressed={armed} aria-label={armed ? 'Cancel Map' : 'Map to a control'}
      data-help={armed ? 'Map is armed: click a control, or move one on the UC4 · Esc or this button cancels' : 'Map: then click a control, or move one on the UC4, and it sends this message'} onclick={onmap}>{armed ? 'Cancel' : 'Map'}</button>
  {/if}
{/snippet}

<!-- The row's own click is a mouse shortcut for the message button, which is the keyboard's way in. -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<div class="row" class:moved={row.lastMoved} class:armed class:next class:open role="listitem" aria-label={rowLabel(row, source)}
  data-help={`${rowLabel(row, source)}${row.lastMoved ? ' · moved last' : ''}`} onclick={rowClick}>
  <button type="button" class="pick" aria-expanded={open} data-help={open ? 'Close the details of this row' : 'Details: the other matches, Pin and the input'}
    onclick={() => { ontoggle?.(); }}>{@render cells()}</button>
  {#if row.mappedTo}<span class="mapped" title={full} aria-hidden="true">→</span>{/if}
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
      {#if row.mappedTo}
        <p class="mapline">
          <span class="altname"><span class="where">Mapped:</span>&#32;<span class="nm">{row.mappedTo.name}</span></span>
          {#if onreset}
            <button type="button" class="act reset" aria-label={`Reset ${row.mappedTo.name} to factory`}
              data-help={`Reset ${row.mappedTo.name} to factory: the whole control goes back to its factory settings, one undo step · it collides with another control`} onclick={onreset}>✕</button>
          {/if}
        </p>
      {/if}
      {#if partsText}<p class="parts where">{partsText}</p>{/if}
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
  /* One line: chip and message cells, the "→" once mapped, [Map] over the right end. The row is one target (a click anywhere opens it);
     the band of the row that moved last spans the whole row, behind [Map] too. The 30px chip column fits "UC4" at --text-sm. */
  .row { position: relative; display: grid; grid-template-columns: calc(30px + 18ch + 3 * var(--space-1)) minmax(0, auto); column-gap: var(--space-2); align-items: center; padding: 0 var(--space-1); border-left: 3px solid transparent; border-bottom: 1px solid var(--border); font-family: var(--mono); font-size: var(--text-sm); cursor: pointer; }
  .row.moved { background-color: var(--accent-soft); border-left-color: var(--accent); }
  .row.open:not(.moved) { background-color: var(--surface); }
  .row:hover { background-image: linear-gradient(color-mix(in srgb, var(--text) 8%, transparent), color-mix(in srgb, var(--text) 8%, transparent)); }
  .row.armed { outline: 2px solid var(--accent); outline-offset: -2px; }
  .row.next:not(.armed) { border-left: 3px dashed var(--accent); }
  .pick { display: grid; grid-template-columns: 30px minmax(0, 8ch) 4ch 6ch; column-gap: var(--space-1); align-items: center; min-width: 0; min-height: 28px; margin: 0; padding: 0; font: inherit; color: inherit; text-align: left; background: none; border: 0; border-radius: 0; cursor: pointer; }
  button.pick:focus-visible { outline: none; box-shadow: inset 0 0 0 2px var(--accent); }
  .mark { display: grid; place-items: center; height: var(--space-4); font-size: var(--text-sm); font-weight: 600; line-height: 1; color: var(--on-accent); background: var(--accent); border-radius: 3px; }
  .mark:empty { background: none; }
  .msg { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ch { color: var(--text-muted); white-space: nowrap; }
  .val { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .mapped { color: var(--text); font-family: var(--font); }
  .mapline { display: grid; grid-template-columns: minmax(0, 1fr) 46px; align-items: center; gap: var(--space-2); min-height: 28px; margin: 0; }
  .reset { flex: none; min-width: 24px; padding: 0 var(--space-1); font-family: var(--font); }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  /* [Map] is a text button over the right end of the row (the band runs behind it); on the hovered, focused, armed and last-moved row. */
  .map { position: absolute; top: 2px; right: var(--space-1); box-sizing: border-box; height: 24px; min-width: 46px; padding: 0 var(--space-1); font: inherit; font-family: var(--font); color: var(--text); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); cursor: pointer; opacity: 0; }
  .map:hover { background: var(--accent-soft); }
  .map.on { color: var(--on-accent); background: var(--accent); border-color: var(--accent); }
  .map:focus-visible { outline: none; border-color: var(--accent); box-shadow: var(--focus-ring); }
  .row:hover .map, .row:has(:focus-visible) .map, .row.moved .map, .row.armed .map, .row.next .map, .map:focus-visible { opacity: 1; }
  @media (prefers-reduced-motion: no-preference) { .map { transition: opacity 120ms; } }
  .details { grid-column: 1 / -1; padding: var(--space-1) 0 var(--space-2) var(--space-1); font-family: var(--font); cursor: default; }
  .src { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); min-height: 28px; margin: 0; overflow: hidden; white-space: nowrap; }
  .src .mapbtn { flex: none; width: 46px; padding: 0 var(--space-1); }
  .src .mapbtn.on { color: var(--on-accent); background: var(--accent); border-color: var(--accent); }
  .where { color: var(--text-muted); }
  .parts { margin: 0; font-family: var(--mono); font-variant-numeric: tabular-nums; }
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
