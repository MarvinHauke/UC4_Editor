// Dims the page except the marked areas, then draws numbered circles and an accent outline into the page before a shot,
// in the editor's own tokens (src/app/tokens.css: --accent, --on-accent, --radius). Calm: one outline per target, a numbered circle
// outside it, left of the outline, so no text is covered. A selector may match several elements
// (each is outlined and carries the number).
import type { Page } from 'playwright';

export interface Marker {
  selector: string;
  n: number;
  /** One box around all matched elements together (for example a label and its select), not one box each. */
  union?: boolean;
  /** Where the number sits: left of the outline (default), or straddling its top edge at the right end when there is no room on the left. */
  dot?: 'left' | 'top-right';
}

export interface MarkerOptions {
  /** Dim everything except the marked elements (default true); false for a shot that needs the whole page readable. */
  dim?: boolean;
}

export async function addMarkers(page: Page, markers: Marker[], options: MarkerOptions = {}): Promise<void> {
  await page.evaluate(({ list, dim }) => {
    const layer = document.createElement('div');
    layer.setAttribute('data-guide-markers', '');
    layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647';
    const DOT = 36, GAP = 4;
    const radius = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--radius')) || 6;
    const holes: { x: number; y: number; w: number; h: number; r: number }[] = [];
    for (const m of list) {
      const els = [...document.querySelectorAll(m.selector)];
      if (els.length === 0) throw new Error(`marker ${m.n}: no element for ${m.selector}`);
      // Only the part of an element that is visible: clipped by every scrolling or clipping ancestor.
      const visible = els.map((el) => {
        const box = el.getBoundingClientRect();
        let left = box.left, top = box.top, right = box.right, bottom = box.bottom;
        for (let a = el.parentElement; a; a = a.parentElement) {
          if (getComputedStyle(a).overflow === 'visible') continue;
          const b = a.getBoundingClientRect();
          left = Math.max(left, b.left); top = Math.max(top, b.top); right = Math.min(right, b.right); bottom = Math.min(bottom, b.bottom);
        }
        return { el, left, top, right, bottom };
      });
      const boxes = m.union
        ? [{ el: els[0]!, left: Math.min(...visible.map((v) => v.left)), top: Math.min(...visible.map((v) => v.top)), right: Math.max(...visible.map((v) => v.right)), bottom: Math.max(...visible.map((v) => v.bottom)) }]
        : visible;
      boxes.forEach(({ el, left, top, right, bottom }) => {
        const w = right - left, h = bottom - top;
        const round = el instanceof SVGElement && Math.abs(w - h) < 0.05 * w;
        const PAD = 6; // 7 or more would run into the push button label under an encoder
        const outline = document.createElement('div');
        outline.style.cssText =
          `position:absolute;left:${left - PAD}px;top:${top - PAD}px;width:${w + 2 * PAD}px;height:${h + 2 * PAD}px;` +
          `box-sizing:border-box;border:2px solid var(--accent);border-radius:${round ? '50%' : 'var(--radius)'}`;
        outline.setAttribute('data-guide-box', '');
        layer.append(outline);
        holes.push({ x: left - PAD, y: top - PAD, w: w + 2 * PAD, h: h + 2 * PAD, r: round ? (w + 2 * PAD) / 2 : radius });
        // Left of the outline, centred; above it when there is no room on the left.
        const fitsLeft = left - PAD - GAP - DOT >= 0;
        const corner = m.dot === 'top-right';
        const dx = corner ? right + PAD - DOT - 4 : fitsLeft ? left - PAD - GAP - DOT : left - PAD;
        const dy = corner ? top - PAD - DOT / 2 : fitsLeft ? top + h / 2 - DOT / 2 : top - PAD - GAP - DOT;
        const dot = document.createElement('div');
        dot.setAttribute('data-guide-box', '');
        dot.textContent = String(m.n);
        dot.style.cssText =
          `position:absolute;left:${dx}px;top:${dy}px;width:${DOT}px;height:${DOT}px;border-radius:50%;` +
          'background:var(--accent);color:var(--on-accent);font:700 21px/36px var(--font);text-align:center;' +
          'box-shadow:0 0 0 3px var(--surface-2)';
        layer.append(dot);
      });
    }
    if (dim) {
      // One overlay, about 68% black, with a hole for every outline; numbers and outlines stay above it.
      const NS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('width', '100%'); svg.setAttribute('height', '100%');
      svg.style.cssText = 'position:absolute;inset:0';
      const mask = document.createElementNS(NS, 'mask');
      mask.id = 'guide-dim';
      const white = document.createElementNS(NS, 'rect');
      white.setAttribute('width', '100%'); white.setAttribute('height', '100%'); white.setAttribute('fill', 'white');
      mask.append(white);
      for (const h of holes) {
        const hole = document.createElementNS(NS, 'rect');
        for (const [k, v] of Object.entries({ x: h.x, y: h.y, width: h.w, height: h.h, rx: h.r, ry: h.r, fill: 'black' })) hole.setAttribute(k, String(v));
        mask.append(hole);
      }
      const veil = document.createElementNS(NS, 'rect');
      veil.setAttribute('width', '100%'); veil.setAttribute('height', '100%');
      veil.setAttribute('fill', 'black'); veil.setAttribute('fill-opacity', '0.68'); veil.setAttribute('mask', 'url(#guide-dim)');
      svg.append(mask, veil);
      layer.prepend(svg);
    }
    document.body.append(layer);
  }, { list: markers, dim: options.dim ?? true });
}
