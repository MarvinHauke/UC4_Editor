<script lang="ts">
  // The drag handle above the monitor's list (drag up to show more rows): pointer drag, or ↑ ↓ / Home / End when focused.
  import { MONITOR_HEIGHT, clampHeight, heightForKey } from '../app/monitorSize.ts';

  let { height, onresize, oncommit }: { height: number; onresize: (height: number) => void; oncommit: (height: number) => void } = $props();
  let drag: { y: number; height: number } | null = null;
  let dragging = $state(false);

  function down(e: PointerEvent & { currentTarget: HTMLElement }): void {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.focus();
    drag = { y: e.clientY, height };
    dragging = true;
  }
  function move(e: PointerEvent): void {
    if (drag) onresize(clampHeight(drag.height - (e.clientY - drag.y)));
  }
  function up(e: PointerEvent): void {
    if (!drag) return;
    const next = clampHeight(drag.height - (e.clientY - drag.y));
    drag = null; dragging = false;
    onresize(next); oncommit(next);
  }
  function cancel(): void {
    if (!drag) return;
    drag = null; dragging = false;
    oncommit(height);
  }
  function key(e: KeyboardEvent): void {
    const next = heightForKey(height, e.key, e.shiftKey);
    if (next === null) return;
    e.preventDefault();
    onresize(next); oncommit(next);
  }
</script>

<!-- A focusable separator is the ARIA window-splitter pattern. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
  class="handle" class:dragging role="separator" aria-orientation="horizontal" tabindex="0" aria-label="Monitor height"
  aria-valuemin={MONITOR_HEIGHT.min} aria-valuemax={MONITOR_HEIGHT.max} aria-valuenow={height}
  data-help="Monitor height: drag this bar up to show more rows, or use ↑ ↓"
  onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={cancel} onkeydown={key}
></div>

<style>
  .handle { position: relative; height: var(--space-1); margin-bottom: 2px; cursor: row-resize; background: var(--border); border-radius: 2px; touch-action: none; }
  /* The visible bar is thin; the click target is 24 px high. */
  .handle::after { content: ''; position: absolute; inset: -10px 0; }
  .handle:hover, .handle.dragging { background: var(--accent); }
  .handle:focus-visible { outline: none; background: var(--accent); box-shadow: var(--focus-ring); }
</style>
