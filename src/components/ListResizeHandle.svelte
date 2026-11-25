<script lang="ts">
  // The drag handle on the left edge of the setup list (drag left to widen): pointer drag, or arrow keys / Home / End when focused.
  import { LIST_WIDTH, clampWidth, widthForKey } from '../app/listWidth.ts';

  let { width, onresize, oncommit }: { width: number; onresize: (width: number) => void; oncommit: (width: number) => void } = $props();
  let drag: { x: number; width: number } | null = null;
  let dragging = $state(false);

  function down(e: PointerEvent & { currentTarget: HTMLElement }): void {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.focus();
    drag = { x: e.clientX, width };
    dragging = true;
  }
  function move(e: PointerEvent): void {
    if (drag) onresize(clampWidth(drag.width - (e.clientX - drag.x)));
  }
  function up(e: PointerEvent): void {
    if (!drag) return;
    const next = clampWidth(drag.width - (e.clientX - drag.x));
    drag = null; dragging = false;
    onresize(next); oncommit(next);
  }
  // A cancelled drag (clientX may be 0) keeps the last width shown.
  function cancel(): void {
    if (!drag) return;
    drag = null; dragging = false;
    oncommit(width);
  }
  function key(e: KeyboardEvent): void {
    const next = widthForKey(width, e.key, e.shiftKey);
    if (next === null) return;
    e.preventDefault();
    onresize(next); oncommit(next);
  }
</script>

<!-- A focusable separator is the ARIA window-splitter pattern. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
  class="handle" class:dragging role="separator" aria-orientation="vertical" tabindex="0" aria-label="Setup list width"
  aria-valuemin={LIST_WIDTH.min} aria-valuemax={LIST_WIDTH.max} aria-valuenow={width}
  data-help="Setup list width: for long setup names · drag this bar"
  onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={cancel} onkeydown={key}
></div>

<style>
  .handle { position: relative; cursor: col-resize; background: var(--border); touch-action: none; }
  /* The visible bar is thin; the click target is 24 px wide. */
  .handle::after { content: ''; position: absolute; inset: 0 -9px; }
  .handle:hover, .handle.dragging { background: var(--accent); }
  .handle:focus-visible { outline: none; background: var(--accent); box-shadow: var(--focus-ring); }
</style>
