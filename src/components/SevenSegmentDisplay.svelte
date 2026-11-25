<script lang="ts">
  // The UC4's 4-digit display, drawn as a group inside an SVG: frame, dim unlit segments, lit segments.
  import { DIGIT, GLYPHS, SEGMENT_ORDER, SEGMENT_POINTS } from '../app/profile/uc4Segments.ts';

  interface Props { lit?: boolean; name: string; x?: number; y?: number; width?: number; height?: number }
  let { lit = false, name, x = 0, y = 0, width = 160, height = 46 }: Props = $props();
  // Upper-case characters (edit-mode texts like `CCAb`) use the lower-case glyph: a stand-in until the user's look list says how the UC4 draws them.
  const chars = $derived([...name.padEnd(4, ' ')].slice(0, 4));
  const left = $derived((width - (3 * DIGIT.pitch + DIGIT.width)) / 2);
  const top = $derived((height - DIGIT.height) / 2);
</script>

<g transform="translate({x} {y})" role="img" aria-label="Display: {name.trim() || 'blank'}">
  <rect class="frame" class:lit {width} {height} rx="6" />
  {#each chars as ch, i (i)}
    <g transform="translate({left + i * DIGIT.pitch} {top})">
      {#each SEGMENT_ORDER as seg (seg)}
        <polygon points={SEGMENT_POINTS[seg]} class="seg" class:lit={(GLYPHS[ch] ?? GLYPHS[ch.toLowerCase()])?.includes(seg)} />
      {/each}
    </g>
  {/each}
</g>

<style>
  .frame { fill: var(--display-bg); }
  .frame.lit { stroke: var(--accent); stroke-width: 4; }
  .seg { fill: var(--display-off); }
  .seg.lit { fill: var(--display-fg); }
</style>
