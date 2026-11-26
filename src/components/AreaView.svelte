<script lang="ts">
  // One area of the panel as SVG: the upper (encoders, push buttons, display) or the lower (faders,
  // crossfader, green buttons, Edit/Shift). Shows the selected group of its carousel; a group change slides.
  import { fade, fly } from 'svelte/transition';
  import type { Store } from '../app/libraryStore.svelte.ts';
  import type { ControlArea } from '../storage/index.ts';
  import { slideDuration, useSettings } from '../app/settings.svelte.ts';
  import { kindOfArea } from '../app/carousel.ts';
  import { editDisplayText } from '../app/profile/uc4Display.ts';
  import type { PropertyKey } from '../app/profile/uc4Properties.ts';
  import { useActiveArea } from '../app/activeArea.svelte.ts';
  import { useCopyHold } from '../app/copyHold.svelte.ts';
  import { flashOn } from '../app/flash.ts';
  import { canPasteControl, isHeldControl } from '../app/copyPaste.ts';
  import { useGuide } from '../app/guide.svelte.ts';
  import { FRAMES, GROUP_LED, groupPitch, CROSSFADER, GROUP_LED_X, VIEWS } from '../app/profile/uc4Geometry.ts';
  import { controlPath, problemsOf } from '../app/controlProblems.ts';
  import { warningsOf } from '../app/warningMarks.ts';
  import { useLive } from '../app/liveStore.svelte.ts';
  import { useMap } from '../app/mapFlow.svelte.ts';
  import { controlId } from '../live/index.ts';
  import { controlAt, groupOf, selectedSetup } from '../app/selectors.ts';
  import { printedGroupName } from '../app/printedNames.ts';
  import { PRINTED_GROUP_NAMES } from '../app/profile/uc4PrintedNames.ts';
  import type { ControlRef, Direction } from '../app/navigation.ts';
  import ControlGlyph from './ControlGlyph.svelte';
  import SevenSegmentDisplay from './SevenSegmentDisplay.svelte';

  interface Props {
    store: Store;
    part: 'upper' | 'lower';
    direction: 1 | -1;
    /** The group change that just happened is a jump: no slide. */
    instant: boolean;
    ongroup: (kind: 'encoder' | 'faderButton', group: number) => void;
    /** The one control that is a tab stop (`area:index`). */
    activeKey: string;
    onarrow: (from: ControlRef, direction: Direction) => void;
    onfocused: (key: string) => void;
  }
  let { store, part, direction, instant, ongroup, activeKey, onarrow, onfocused }: Props = $props();

  const view = $derived.by(() => {
    const state = store.state;
    const { setup, index: setupIndex } = selectedSetup(state);
    return { state, setup, setupIndex, eg: state.selection.encoderGroup, fg: state.selection.faderButtonGroup };
  });
  const group = $derived(part === 'upper' ? view.eg : view.fg);
  type Shown = { type: string; number: number; label?: string };
  const shown = $derived<[ControlArea, Shown[]][]>(
    part === 'upper'
      ? [['encoders', view.setup.encoderGroups[view.eg]!.encoders], ['pushButtons', view.setup.encoderGroups[view.eg]!.pushButtons]]
      : [['faders', view.setup.faderButtonGroups[view.fg]!.faders], ['buttons', view.setup.faderButtonGroups[view.fg]!.buttons]],
  );
  const name = $derived(view.setup.encoderGroups[view.eg]!.name);
  const selected = $derived(view.state.selection.control);
  const count = (area: ControlArea, index: number): number =>
    problemsOf(view.state.problems, controlPath(view.setupIndex, area, groupOf(view.state, area), index)).length;
  const live = useLive();
  const map = useMap();
  const idOf = (area: ControlArea, index: number): string => controlId(view.setup.id, area, groupOf(view.state, area), index);
  const warned = (area: ControlArea, index: number): number =>
    warningsOf(store.warnings, controlPath(view.setupIndex, area, groupOf(view.state, area), index)).length;
  // The slide's length is a setting (0–400 ms); with less motion asked for by the system it is off unless the user set a speed.
  const settings = useSettings();
  const active = useActiveArea();
  // A guide on show (the Send and Restore dialogs' rEc callouts) dims the panel except a few controls, and sets the Setup LED and the display.
  const guide = useGuide();
  // A held control copy: controls of the same kind dim slightly and show the Paste icon (plan 0006 decision 30).
  const copy = useCopyHold();
  const pasteable = (area: ControlArea, index: number): boolean => {
    const h = copy.held;
    return h?.kind === 'control' && canPasteControl(h, { area, index }) && !isHeldControl(h, view.setup.id, area, groupOf(view.state, area), index);
  };
  const guided = $derived(guide.data !== null);
  // Nothing behind the dim takes focus or clicks while the guide is on.
  let glyphs = $state<SVGGElement | null>(null);
  $effect(() => { if (guided) glyphs?.setAttribute('inert', ''); else glyphs?.removeAttribute('inert'); });
  const cued = (kind: string): boolean => guide.data?.cues.some((c) => c.kind === kind) ?? false;
  const callouts = $derived((guide.data?.callouts ?? []).filter((c) => c.part === part));
  const spots = $derived((guide.data?.spots ?? []).filter((c) => c.part === part));
  const cuedDisplay = $derived(guide.data?.cues.find((c) => c.kind === 'display'));
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isCrossfader = (area: ControlArea, index: number): boolean => area === 'faders' && index === CROSSFADER;
  const pitch = $derived(groupPitch(part));
  const duration = $derived(instant ? 0 : slideDuration(settings.slideMs, reduced));
  // Plain click selects the control; Shift-click (or Shift + Enter) on encoder n or green button n shows group n.
  function select(area: ControlArea, index: number, shift: boolean): void {
    // While Map is armed a click maps the control; one that can't take the message does nothing (its reason is in the help line).
    if (map.flow.armed !== null) { if (map.targets.get(idOf(area, index))?.ok) map.flow.click(area, index); return; }
    if (shift && area === 'encoders') ongroup('encoder', index);
    else if (shift && area === 'buttons') ongroup('faderButton', index);
    else { const kind = kindOfArea(area); if (kind) active.setSection(kind); store.selectControl({ area, index }); }
  }
  // What Shift-click on encoder n or green button n would show: group n and, in SE17/SE18, its printed name.
  function shiftTarget(area: ControlArea, index: number): string | undefined {
    const kind = area === 'encoders' ? 'encoder' : area === 'buttons' ? 'faderButton' : null;
    if (!kind) return undefined;
    const printed = printedGroupName(PRINTED_GROUP_NAMES, view.setup, kind, index);
    return `${kind === 'encoder' ? 'encoder' : 'fader/button'} group ${index + 1}${printed ? ` · ${printed}` : ''}`;
  }
  // In edit mode the display shows what the UC4's edit mode shows (decision 26): the picked control's name, or the focused property's value.
  const display = $derived.by(() => {
    if (cuedDisplay) return { text: cuedDisplay.text, editing: false };
    const sel = selected;
    if (!sel) return { text: name, editing: false };
    const control = controlAt(view.state.configuration, view.setup.id, sel.area, groupOf(view.state, sel.area), sel.index);
    return { text: control ? editDisplayText(sel.area, sel.index, control, active.property as PropertyKey | null) : name, editing: true };
  });
  const ledPrinted = $derived(printedGroupName(PRINTED_GROUP_NAMES, view.setup, 'faderButton', view.fg));
  const frame = $derived(part === 'upper' ? VIEWS.upper : VIEWS.lower);
</script>

{#snippet glyph(area: ControlArea, index: number, control: Shown)}
  <ControlGlyph
    {area}
    {index}
    pasteTarget={pasteable(area, index)}
    onpaste={() => { copy.pasteControlOnto(area, index); }}
    lit={guide.data?.lit.some((l) => l.area === area && l.index === index) ?? false}
    type={control.type}
    number={control.number}
    selected={selected?.area === area && selected.index === index}
    problemCount={count(area, index)}
    warningCount={warned(area, index)}
    live={live.controlStates.get(idOf(area, index))}
    touched={live.lastTouched?.control.id === idOf(area, index)}
    mapState={map.flow.armed === null ? undefined : (map.targets.get(idOf(area, index)) ?? { ok: false, reason: 'This control is not in the open setup.' })}
    shiftTarget={shiftTarget(area, index)}
    tabStop={activeKey === `${area}:${index}`}
    onarrow={(d) => { onarrow({ area, index }, d); }}
    onfocused={() => { onfocused(`${area}:${index}`); }}
    onselect={(shift) => { select(area, index, shift); }}
  />
{/snippet}

<svg
  class="area-svg"
  use:flashOn={{ flash: copy.flash, target: `area:${part === 'upper' ? 'encoder' : 'faderButton'}` }}
  viewBox="{frame.x} {frame.y} {frame.width} {frame.height}"
  role="group"
  aria-label={part === 'upper'
    ? `Encoders and push buttons, encoder group ${view.eg + 1}`
    : `Faders and green buttons, fader/button group ${view.fg + 1}`}
>
  <defs>
    <clipPath id="clip-{part}"><rect {...part === 'upper' ? FRAMES.upperArea : FRAMES.lowerArea} rx="10" /></clipPath>
  </defs>
  <rect class="area" {...part === 'upper' ? FRAMES.upperArea : FRAMES.lowerArea} rx="10" />

  {#if part === 'upper'}
    <g data-help={display.editing ? `Display, edit mode: shows ${display.text}, the control or the property in focus · UC4: its display does the same while you edit` : `Display: the name of the encoder group (here ${name.trim() || 'blank'}) · Shift + click encoder n · UC4: Shift + press an encoder`}>
      <SevenSegmentDisplay lit={!!cuedDisplay} name={display.text} x={FRAMES.display.x} y={FRAMES.display.y} width={FRAMES.display.width} height={FRAMES.display.height} />
    </g>
  {:else}
    <g data-help="Group LED {view.fg + 1}{ledPrinted ? ` · ${ledPrinted}` : ''}: the fader/button group on show · Shift + click green button n · UC4: Shift + press a green button">
      {#each GROUP_LED_X as x, i (i)}
        <circle class="group-led" class:lit={i === view.fg} cx={x} cy={GROUP_LED.y} r={GROUP_LED.r} />
      {/each}
    </g>
    <g class="furniture">
      <text x={FRAMES.editSetup.ledAx} y="602" aria-hidden="true">Edit</text>
      <text x={FRAMES.editSetup.ledBx} y="602" aria-hidden="true">Setup</text>
      <!-- As on the UC4: the Edit LED is lit in edit mode (a control picked), the Setup LED while the setup list is the area at work. -->
      <circle class="led" class:lit={!!selected} data-help="Edit LED: lit in edit mode, while a control is selected · Esc leaves it · UC4: lit while you edit" cx={FRAMES.editSetup.ledAx} cy={FRAMES.editSetup.ledY} r="6" />
      <circle class="led" class:lit={active.current === 'setups' || cued('setupLed')} data-help="Setup LED: lit while you work in the setup list · UC4: lit in the setup menu" cx={FRAMES.editSetup.ledBx} cy={FRAMES.editSetup.ledY} r="6" />
      <!-- The drawn Edit/Setup button opens the editor's own settings (plan 0006 decision 14). -->
      <circle
        class="btn setup" role="button" tabindex="0" aria-label="Setup: open the editor's settings"
        cx={FRAMES.editSetup.cx} cy={FRAMES.editSetup.cy + 8} r={FRAMES.editSetup.r}
        data-help="Edit / Setup: opens the editor's settings · UC4: Shift + Edit twice is setup mode"
        class:cue={cued('edit')} data-settings-toggle
        onclick={() => { settings.toggle(); }}
        onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); settings.toggle(); } }}
      />
    </g>
    <g class="furniture" aria-hidden="true" data-help="Shift: this drawn button does nothing · Shift + click an encoder or green button n · UC4: hold Shift, press encoder or green button n">
      <text x={FRAMES.shift.cx} y="602">Shift</text>
      <circle class="btn" class:cue={cued('shift')} cx={FRAMES.shift.cx} cy={FRAMES.shift.cy + 8} r={FRAMES.shift.r} />
    </g>
  {/if}

  <g clip-path="url(#clip-{part})" bind:this={glyphs}>
    {#key group}
      <g
        onoutrostart={(e) => e.currentTarget.setAttribute('inert', '')}
        in:fly={{ x: -direction * pitch, duration }} out:fly={{ x: direction * pitch, duration }}>
        {#each shown as [area, controls] (area)}
          {#each controls as control, index (index)}
            {#if !isCrossfader(area, index)}{@render glyph(area, index, control)}{/if}
          {/each}
        {/each}
      </g>
    {/key}
    <!-- The crossfader is one wide control, not one of the eight: it fades in place (decision 46). -->
    {#if part === 'lower'}
      {#key group}
        <g onoutrostart={(e) => e.currentTarget.setAttribute('inert', '')} in:fade={{ duration }} out:fade={{ duration }}>
          {#each shown as [area, controls] (area)}
            {#each controls as control, index (index)}
              {#if isCrossfader(area, index)}{@render glyph(area, index, control)}{/if}
            {/each}
          {/each}
        </g>
      {/key}
    {/if}
  </g>

  {#if guided}
    <defs>
      <mask id="dim-{part}" maskUnits="userSpaceOnUse" x={frame.x} y={frame.y} width={frame.width} height={frame.height}>
        <rect x={frame.x} y={frame.y} width={frame.width} height={frame.height} fill="white" />
        {#each spots as sp, i (i)}<rect x={sp.x} y={sp.y} width={sp.width} height={sp.height} rx={sp.rx} fill="black" />{/each}
      </mask>
    </defs>
    <!-- The dim also stops clicks: nothing behind it is used while the guide asks for the UC4. -->
    <rect class="dim" x={frame.x} y={frame.y} width={frame.width} height={frame.height} mask="url(#dim-{part})" aria-hidden="true" />
    {#each callouts as c (c.n)}
      <g class="callout" role="group" aria-label="Step {c.n}: {c.lines.map((l) => l.map((x) => (typeof x === 'string' ? x : x.key)).join('')).join(' ')}">
        <line class="pointer" x1={c.pointer.x1} y1={c.pointer.y1} x2={c.pointer.x2} y2={c.pointer.y2} />
        <circle class="pointer-dot" cx={c.pointer.x2} cy={c.pointer.y2} r="4" />
        <foreignObject x={c.x} y={c.y} width={c.width} height={c.height}>
          <div class="callout-box">
            <span class="num" aria-hidden="true">{c.n}</span>
            <span class="lines">{#each c.lines as line, li (li)}<span class="line">{#each line as chunk, ci (ci)}{#if typeof chunk === 'string'}{chunk}{:else}<b>{chunk.key}</b>{/if}{/each}</span>{/each}</span>
          </div>
        </foreignObject>
      </g>
    {/each}
  {/if}
</svg>

<style>
  .area-svg { width: 100%; height: auto; display: block; user-select: none; }
  .area { fill: var(--surface); stroke: var(--text-muted); stroke-width: 1.5; }
  .furniture text { fill: var(--text-muted); font: 14px var(--font); text-anchor: middle; }
  .btn { fill: var(--surface-2); stroke: var(--border); stroke-width: 2; }
  .setup { cursor: pointer; }
  .setup:hover { fill: var(--accent-soft); }
  .setup:focus-visible { outline: none; stroke: var(--accent); stroke-width: 4; stroke-dasharray: 6 3; }
  .group-led { fill: var(--led-off); stroke: var(--border); stroke-width: 1.5; }
  .group-led.lit { fill: var(--group); stroke: var(--group); }
  .led { fill: var(--led-off); stroke: var(--border); stroke-width: 1.5; }
  /* The guide: the panel dimmed except the spots; callouts stand on the dim (decision 35). Appearing takes a short fade, off with reduced motion. */
  .dim { fill: var(--bg); fill-opacity: 0.62; animation: fade 160ms ease-out; }
  .pointer { stroke: var(--accent); stroke-width: 2.5; }
  .pointer-dot { fill: var(--accent); }
  /* A control the guide points at carries the accent on its own outline. */
  .btn.cue { stroke: var(--accent); stroke-width: 4; }
  .callout-box { box-sizing: border-box; width: 100%; height: 100%; display: flex; align-items: center; gap: 8px; padding: 4px 10px 4px 6px; font: 15px/1.3 var(--font); color: var(--text); background: var(--surface-2); border: 1.5px solid var(--accent); border-radius: 8px; animation: fade 160ms ease-out; }
  .num { flex: none; width: 22px; height: 22px; display: grid; place-items: center; font-weight: 700; font-size: 14px; color: var(--on-accent); background: var(--accent); border-radius: 50%; }
  .lines { display: flex; flex-direction: column; min-width: 0; }
  .line { white-space: nowrap; }
  b { font-weight: 700; color: var(--accent); }
  @keyframes fade { from { opacity: 0; } }
  @media (prefers-reduced-motion: reduce) { .dim, .callout-box { animation: none; } }
  .led.lit { fill: var(--led); stroke: var(--led-edge); }
</style>
