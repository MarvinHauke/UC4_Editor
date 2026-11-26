<script lang="ts">
  // The UC4's panel: the upper area and the lower area, scaled to fit the column (never below the
  // scale where a click target is still 24 px; below that the column scrolls). Nothing but the panel:
  // the groups are shown the device's way (the display's name, the LED above green button n), and
  // stepped with one ‹ and one › beside each area, the keys `( )` `{ }`, Option + ← / →, or Shift-click.
  import { tick } from 'svelte';
  import type { Store } from '../app/libraryStore.svelte.ts';
  import { groupAction, stepGroup, type GroupKind } from '../app/carousel.ts';
  import { AREA_FIT } from '../app/profile/uc4Geometry.ts';
  import { nextControl, type ControlRef, type Direction } from '../app/navigation.ts';
  import { printedGroupName } from '../app/printedNames.ts';
  import { PRINTED_GROUP_NAMES } from '../app/profile/uc4PrintedNames.ts';
  import { selectedSetup } from '../app/selectors.ts';
  import { useActiveArea } from '../app/activeArea.svelte.ts';
  import AreaView from './AreaView.svelte';
  import GuideCard from './GuideCard.svelte';
  import ListenCard from './ListenCard.svelte';
  import { useGuide } from '../app/guide.svelte.ts';

  let { store }: { store: Store } = $props();
  const active = useActiveArea();
  const guide = useGuide();
  let direction = $state<1 | -1>(1);
  // Shift-click jumps to the group; ‹ › and the keys slide (plan 0006 decision 20).
  let instant = $state(false);
  const setup = $derived(selectedSetup(store.state).setup);
  const eg = $derived(store.state.selection.encoderGroup);
  const fg = $derived(store.state.selection.faderButtonGroup);

  // Roving focus: one control of the panel is the tab stop (the one last focused, else the selected one).
  let roving = $state<string | null>(null);
  const activeKey = $derived(roving ?? (store.state.selection.control ? `${store.state.selection.control.area}:${store.state.selection.control.index}` : 'encoders:0'));
  function moveFocus(from: ControlRef, direction: Direction): void {
    const to = nextControl(from, direction);
    if (!to) return;
    const key = `${to.area}:${to.index}`;
    roving = key;
    const candidates = [...document.querySelectorAll<SVGElement>(`[data-control="${key}"]`)];
    (candidates.filter((c) => !c.closest('[inert]')).at(-1) ?? candidates.at(-1))?.focus();
  }

  const AREAS: Record<GroupKind, string[]> = { encoder: ['encoders', 'pushButtons'], faderButton: ['faders', 'buttons'] };
  // The arrows' help names the group they go to (and its printed name in SE17/SE18).
  function arrowHelp(kind: GroupKind, delta: 1 | -1): string {
    const target = stepGroup(kind === 'encoder' ? eg : fg, delta);
    const printed = printedGroupName(PRINTED_GROUP_NAMES, setup, kind, target);
    const to = `${kind === 'encoder' ? 'encoder' : 'fader/button'} group ${target + 1}${printed ? ` (${printed})` : ''}`;
    // Braces are written in script, so the markup doesn't read them as an expression.
    const keys = kind === 'encoder' ? ['(', ')'] : ['{', '}'];
    const device = kind === 'encoder' ? 'UC4: Shift + press an encoder' : 'UC4: Shift + press a green button';
    return `${delta === 1 ? 'Next' : 'Previous'} ${to} · key ${keys[delta === 1 ? 1 : 0]} · ${device}`;
  }

  // A group change rebuilds the glyphs; keep the keyboard focus on the same control of the new group.
  async function change(kind: GroupKind, group: number): Promise<void> {
    const focused = document.activeElement?.closest('[data-control]')?.getAttribute('data-control') ?? null;
    // Stepping a group brings its section forward in the groups area; a focused reset button follows to the new section's.
    const onReset = document.activeElement?.closest('[data-group-reset]') != null;
    active.setSection(kind);
    store.selectGroup(kind, group);
    if (onReset) void tick().then(() => { document.querySelector<HTMLElement>('[data-group-reset]')?.focus(); });
    // The jump is drawn once the group has changed; later changes (undo, a problem, another setup) slide again.
    void tick().then(() => { instant = false; });
    if (!focused || !AREAS[kind].includes(focused.split(':')[0]!)) return;
    await tick();
    const candidates = [...document.querySelectorAll<SVGElement>(`[data-control="${focused}"]`)];
    (candidates.filter((c) => !c.closest('[inert]')).at(-1) ?? candidates.at(-1))?.focus();
  }
  function go(kind: GroupKind, group: number): void {
    const current = kind === 'encoder' ? eg : fg;
    if (group === current) return;
    direction = group > current ? 1 : -1;
    instant = true;
    void change(kind, group);
  }
  function step(kind: GroupKind, delta: 1 | -1): void {
    direction = delta;
    instant = false;
    void change(kind, stepGroup(kind === 'encoder' ? eg : fg, delta));
  }
  function key(e: KeyboardEvent): void {
    const target = e.target;
    if (target instanceof HTMLElement && target.matches('input, select, textarea, [contenteditable]')) return;
    if (e.defaultPrevented) return;
    if (target instanceof Element && target.closest('dialog')) return;
    const action = groupAction(e, store.state.selection.control?.area ?? null);
    if (!action) return;
    e.preventDefault();
    step(action.kind, action.delta);
  }
</script>

<svelte:window onkeydown={key} />

{#snippet arrow(kind: GroupKind, delta: 1 | -1)}
  <button
    type="button"
    class="arrow"
    aria-label="{delta === 1 ? 'Next' : 'Previous'} {kind === 'encoder' ? 'encoder' : 'fader/button'} group"
    data-help={arrowHelp(kind, delta)}
    onclick={() => { step(kind, delta); }}
  >{delta === 1 ? '›' : '‹'}</button>
{/snippet}

<div class="device" style:--fit-height={AREA_FIT.units}>
  {#if guide.card}{#if 'choices' in guide.card}<ListenCard card={guide.card} />{:else}<GuideCard card={guide.card} />{/if}{/if}
  <div class="row">
    {@render arrow('encoder', -1)}
    <AreaView {store} part="upper" {direction} {instant} ongroup={go} {activeKey} onarrow={moveFocus} onfocused={(k) => { roving = k; }} />
    {@render arrow('encoder', 1)}
  </div>
  <div class="row">
    {@render arrow('faderButton', -1)}
    <AreaView {store} part="lower" {direction} {instant} ongroup={go} {activeKey} onarrow={moveFocus} onfocused={(k) => { roving = k; }} />
    {@render arrow('faderButton', 1)}
  </div>
</div>

<style>
  .device {
    --arrow: 24px;
    --side: calc(2 * (var(--arrow) + 2px));
    /* The panel's width follows the column's width and height (container units of .centre), at least MIN_SCALE × 560. */
    --panel: max(448px, min(100cqw - var(--side), 640px, calc((100cqh - var(--space-1)) * 560 / var(--fit-height))));
    position: relative; display: flex; flex-direction: column; gap: var(--space-1); margin: 0 auto;
    width: calc(var(--panel) + var(--side));
  }
  .row { display: grid; grid-template-columns: var(--arrow) minmax(0, 1fr) var(--arrow); gap: 2px; align-items: center; }
  .arrow {
    width: var(--arrow); min-height: 48px; padding: 0; font-size: 20px; line-height: 1; color: var(--text);
    background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius); cursor: pointer;
  }
  .arrow:hover { background: var(--accent-soft); }
  .arrow:focus-visible { outline: none; border-color: var(--accent); box-shadow: var(--focus-ring); }
</style>
