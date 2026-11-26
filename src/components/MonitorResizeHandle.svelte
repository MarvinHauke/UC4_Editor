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
  .handle { position: relative; height: var(--space-2); margin-bottom: 2px; cursor: row-resize; background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius); touch-action: none; }
  /* The grip: three short dots, so the bar reads as something to drag. */
  .handle::before { content: ''; position: absolute; left: 50%; top: 50%; width: 18px; height: 2px; transform: translate(-50%, -50%); background: radial-gradient(circle, var(--text-muted) 1px, transparent 1.5px) 0 0 / 6px 2px repeat-x; }
  /* The visible bar is thin; the click target is 24 px high. */
  .handle::after { content: ''; position: absolute; inset: -10px 0; }
  .handle:hover { background: var(--accent-soft); }
  .handle.dragging { background: var(--accent-soft); border-color: var(--accent); }
  .handle:focus-visible { outline: none; border-color: var(--accent); box-shadow: var(--focus-ring); }
</style>
