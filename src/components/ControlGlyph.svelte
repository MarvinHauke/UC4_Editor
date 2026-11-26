<script lang="ts">
  import { flashOn } from '../app/flash.ts';
  import { matchKey } from '../app/keyTable.ts';
  import { useCopyHold } from '../app/copyHold.svelte.ts';
  // One drawn control: its shape, "type number" text, a mark when it has problems. A button for mouse and keyboard.
  import type { ControlArea } from '../storage/index.ts';
  import { GEOMETRY } from '../app/profile/uc4Geometry.ts';
  import type { Direction } from '../app/navigation.ts';
  import { AREA_NAMES, controlNumber } from '../app/profile/uc4Properties.ts';

  interface Props {
    area: ControlArea;
    index: number;
    type: string;
    number: number;
    selected: boolean;
    /** A guide points at this control: the accent on its own outline. */
    lit?: boolean;
    /** A copy of this kind is held: the control dims slightly and shows the Paste icon (plan 0006 decision 30). */
    pasteTarget?: boolean;
    onpaste?: () => void;
    problemCount: number;
    /** Warnings that name this control (plan 0008): an amber triangle beside the problem mark; nothing is blocked. */
    warningCount?: number;
    /** `shift`: Shift was held (click or Enter): on encoders and green buttons that picks the group, as on the UC4. */
    onselect: (shift: boolean) => void;
    /** For encoders and green buttons: the group a Shift-click shows ("encoder group 3 · Send 3"). */
    shiftTarget?: string;
    /** Roving focus: only one control of the panel is a tab stop; the arrows move between them. */
    tabStop: boolean;
    onarrow: (direction: Direction) => void;
    onfocused: () => void;
  }
  const copy = useCopyHold(); // needs COPY_CONTEXT, which App sets // needs COPY_CONTEXT (AreaView's parent sets it)
  let { area, index, type, number, selected, lit = false, pasteTarget = false, onpaste, problemCount, warningCount = 0, onselect, shiftTarget, tabStop, onarrow, onfocused }: Props = $props();

  const shape = $derived(GEOMETRY[area][index]!);
  const name = $derived(`${AREA_NAMES[area].singular} ${controlNumber(index)}`);
  // The paste icon (30 units, 24 px at the smallest scale) sits on the control's own rim, the same spot on every control of a kind (decision 44):
  // discs at 45° top right, pills at their top right corner (the label stays readable), faders at the top (the horizontal fader 9 at the top of its right end).
  const pasteAt = $derived.by((): { x: number; y: number } => {
    if (shape.shape === 'disc') { const d = shape.r * Math.SQRT1_2; return { x: shape.cx + d, y: shape.cy - d }; }
    if (shape.shape === 'pill') return { x: shape.x + shape.width, y: shape.y };
    return shape.horizontal ? { x: shape.x + shape.width - 20, y: shape.y } : { x: shape.x + shape.width / 2, y: shape.y };
  });
  const kindWord = $derived(AREA_NAMES[area].singular.toLowerCase());
  const kindClass = $derived(area === 'encoders' || area === 'pushButtons' ? 'enc' : 'fb');
  // Schema (decision 39): what it is · the one way · UC4. On encoders and green buttons the one way is Shift + click.
  const help = $derived(
    `${name}: ${type} ${number}${problemCount > 0 ? ` · ${problemCount} problem${problemCount === 1 ? '' : 's'}` : ''}${warningCount > 0 ? ` · ${warningCount} warning${warningCount === 1 ? '' : 's'}` : ''} · ${shiftTarget ? `Shift + click: ${shiftTarget}` : 'click to edit'}${shiftTarget ? ' · UC4: Shift + press' : ''}`,
  );
  function key(e: KeyboardEvent): void {
    const move = matchKey(e, ['controlMove']);
    if (move) { e.preventDefault(); onarrow(move.press.dirName!); return; }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onselect(e.shiftKey && e.key === 'Enter'); }
  }
  // Centre of the text block; faders put it under the track, the others inside the shape.
  const cx = $derived(shape.shape === 'disc' ? shape.cx : shape.x + shape.width / 2);
  const cy = $derived(shape.shape === 'disc' ? shape.cy : shape.shape === 'pill' ? shape.y + shape.height / 2 : shape.y + shape.height);
  const mark = $derived(
    shape.shape === 'disc' ? { x: shape.cx + shape.r * 0.7, y: shape.cy - shape.r * 0.7 } : { x: shape.x + shape.width - 2, y: shape.y + 2 },
  );
</script>

<g
  class="control {kindClass}"
  class:selected
  class:lit
  class:paste-dim={pasteTarget}
  use:flashOn={{ flash: copy.flash, target: `control:${area}:${index}`, svg: true }}
  data-control="{area}:{index}"
  role="button"
  tabindex={tabStop ? 0 : -1}
  aria-pressed={selected}
  aria-label="{name}, {type} {number}{problemCount > 0 ? `, ${problemCount} problems` : ''}{warningCount > 0 ? `, ${warningCount} warnings` : ''}"
  data-help={help}
  onclick={(e) => { onselect(e.shiftKey); }}
  onkeydown={key}
  onfocus={onfocused}
>
  {#if shape.shape === 'disc'}
    <circle class="hit" cx={shape.cx} cy={shape.cy} r={shape.r} />
  {:else if shape.shape === 'pill'}
    <rect class="hit" x={shape.x} y={shape.y} width={shape.width} height={shape.height} rx="6" />
  {:else}
    <rect class="hit hitbox" x={shape.x} y={shape.y} width={shape.width} height={shape.height} rx="8" />
    {#if shape.horizontal}
      <line class="track" x1={shape.x + 10} y1={shape.y + shape.height / 2 - 6} x2={shape.x + shape.width - 10} y2={shape.y + shape.height / 2 - 6} />
      <rect class="handle" x={cx - 14} y={shape.y + 2} width="28" height="44" rx="3" />
      <text class="idx" x={cx} y={shape.y + 29}>{controlNumber(index)}</text>
    {:else}
      <line class="track" x1={cx} y1={shape.y + 6} x2={cx} y2={shape.y + shape.height - 6} />
      <rect class="handle" x={cx - 13} y={shape.y + 76} width="26" height="36" rx="3" />
      <text class="idx" x={cx} y={shape.y + 98}>{controlNumber(index)}</text>
    {/if}
  {/if}

  {#if shape.shape === 'disc'}
    <text class="idx" x={cx} y={cy - 13}>{controlNumber(index)}</text>
    <text class="type" x={cx} y={cy + 3}>{type}</text>
    <text class="num" x={cx} y={cy + 18}>{number}</text>
  {:else if shape.shape === 'pill'}
    <text class="type" x={cx} y={cy + 4}>{type} {number}</text>
  {:else}
    <text class="type" x={cx} y={cy + 16}>{type}</text>
    <text class="num" x={cx} y={cy + 30}>{number}</text>
  {/if}

  {#if problemCount > 0}
    <circle class="problem" cx={mark.x} cy={mark.y} r="6" />
    <text class="problem-text" x={mark.x} y={mark.y + 4}>!</text>
  {/if}
  {#if warningCount > 0}
    <!-- Beside the problem mark (14 units to its left when there is one), so both can show. -->
    {@const wx = mark.x - (problemCount > 0 ? 16 : 0)}
    <path class="warn" d="M{wx} {mark.y - 7} L{wx + 8} {mark.y + 6} L{wx - 8} {mark.y + 6} Z" />
  {/if}
  <!-- Drawn last: the badge stays on top of the problem mark and takes the click. -->
  {#if pasteTarget}
    <g class="paste" role="button" tabindex="-1" aria-label="Paste here: {name}" data-help="Paste the copied {kindWord} onto {name}, one undo step · click the icon"
      onclick={(e) => { e.stopPropagation(); onpaste?.(); }} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onpaste?.(); } }}>
      <circle cx={pasteAt.x} cy={pasteAt.y} r="15" />
      <g transform="translate({pasteAt.x - 8} {pasteAt.y - 8})" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true">
        <rect x="3" y="3" width="10" height="11" rx="1.5" /><path d="M6 3V2h4v1" /><path d="M6 8h4M6 11h4" />
      </g>
    </g>
  {/if}
</g>

<style>
  .control { cursor: pointer; outline: none; }
  .hit { fill: var(--surface-2); stroke: var(--encoder); stroke-width: 2; }
  .fb .hit { stroke: var(--fader); }
  .hitbox { fill: transparent; stroke: transparent; }
  .control:hover .hit { fill: var(--accent-soft); }
  .control:hover .hitbox { stroke: var(--border); }
  .control.paste-dim > :not(.paste) { opacity: 0.8; }
  .paste { cursor: pointer; color: var(--accent); }
  .paste circle { fill: var(--surface-2); stroke: var(--accent); stroke-width: 1.5; }
  .paste:hover circle { fill: var(--accent-soft); }
  .control.lit .hit { stroke: var(--accent); stroke-width: 4; }
  .control.selected .hit { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 4; }
  .control.selected .hitbox { stroke: var(--accent); stroke-width: 3; }
  .control:focus-visible .hit { stroke: var(--accent); stroke-width: 4; stroke-dasharray: 6 3; }
  .track { stroke: var(--text-muted); stroke-width: 4; stroke-linecap: round; pointer-events: none; }
  .handle { fill: var(--surface-2); stroke: var(--fader); stroke-width: 2; pointer-events: none; }
  text { fill: var(--text); user-select: none; font: 600 14px var(--font); text-anchor: middle; pointer-events: none; }
  .idx { fill: var(--text-muted); font-weight: 400; font-size: 14px; }
  .type { font-family: var(--mono); }
  .num { font-family: var(--mono); font-weight: 400; }
  .problem { fill: var(--danger); pointer-events: none; }
  .warn { fill: var(--warn); stroke: var(--surface-2); stroke-width: 1; stroke-linejoin: round; pointer-events: none; }
  .problem-text { fill: var(--on-danger); font-size: 14px; }
</style>
