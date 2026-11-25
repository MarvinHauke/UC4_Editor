import { describe, expect, it } from 'vitest';
import { badgeSide, nextIndex, placeCard, prevIndex, readSeen, shouldWelcome, TOUR_SEEN_KEY, writeSeen } from '../../src/app/tour.ts';
import { createTour } from '../../src/app/tour.svelte.ts';
import { TOUR_STEPS } from '../../src/app/profile/uc4Tour.ts';

const memory = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } }; };
const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };

describe('first-run rule', () => {
  it('starts when nothing was received or imported and it was not seen', () => {
    expect(shouldWelcome({ seen: false, keptDumps: 0, differsFromFactory: false })).toBe(true);
  });
  it.each([
    { seen: true, keptDumps: 0, differsFromFactory: false },
    { seen: false, keptDumps: 1, differsFromFactory: false },
    { seen: false, keptDumps: 0, differsFromFactory: true },
  ])('does not start for %o', (o) => { expect(shouldWelcome(o)).toBe(false); });
});

describe('seen', () => {
  it('is kept and read back', () => {
    const s = memory();
    expect(readSeen(s)).toBe(false);
    writeSeen(s);
    expect(s.getItem(TOUR_SEEN_KEY)).toBe('1');
    expect(readSeen(s)).toBe(true);
  });
  it('blocked storage reads as not seen and never throws', () => {
    expect(readSeen(blocked)).toBe(false);
    expect(() => { writeSeen(blocked); }).not.toThrow();
    expect(readSeen(null)).toBe(false);
  });
});

describe('the tour store', () => {
  it('pages through the steps in order and stops at both ends', () => {
    const t = createTour(memory());
    t.start();
    expect(t.step.title).toBe('Toolbar');
    t.back();
    expect(t.index).toBe(0);
    const titles: string[] = [];
    for (let i = 0; i < TOUR_STEPS.length + 2; i++) { titles.push(t.step.title); t.next(); }
    expect(titles.slice(0, 7)).toEqual(TOUR_STEPS.map((s) => s.title));
    expect(t.isLast).toBe(true);
    expect(t.index).toBe(6);
  });
  it('starting marks it seen, and a start from the beginning each time', () => {
    const s = memory();
    const t = createTour(s);
    expect(t.seen).toBe(false);
    t.start(); t.next(); t.end();
    expect(t.open).toBe(false);
    expect(t.seen).toBe(true);
    expect(readSeen(s)).toBe(true);
    t.start();
    expect(t.index).toBe(0);
  });
  it('with blocked storage it is still seen for this page load', () => {
    const t = createTour(blocked);
    expect(t.seen).toBe(false);
    t.start();
    expect(t.seen).toBe(true);
  });
  it('index helpers clamp', () => {
    expect(nextIndex(6, 7)).toBe(6);
    expect(prevIndex(0)).toBe(0);
  });
});

describe('card placement', () => {
  const view = { width: 1024, height: 700 };
  const card = { width: 320, height: 200 };
  it('goes right of a box with room, beside it', () => {
    const p = placeCard({ left: 48, top: 40, width: 288, height: 600 }, card, view);
    expect(p.left).toBe(48 + 288 + 16);
  });
  it('goes below a wide top box and above a wide bottom box', () => {
    expect(placeCard({ left: 0, top: 0, width: 1024, height: 40 }, card, view).top).toBe(56);
    expect(placeCard({ left: 0, top: 664, width: 1024, height: 36 }, card, view).top).toBe(664 - 16 - 200);
  });
  it('at 1024 px the device box gets the card over the wider dimmed strip, not over the box', () => {
    const device = { left: 336, top: 40, width: 500, height: 624 }; // props side 336 wide, list side 188 wide
    const p = placeCard(device, { width: 340, height: 230 }, view);
    expect(p.left).toBe(8);
    expect(p.left + 340).toBeLessThanOrEqual(device.left + 16);
  });
  it('sits inside the box when both dimmed strips are narrow, and inside the window', () => {
    const p = placeCard({ left: 100, top: 40, width: 820, height: 624 }, card, view);
    expect(p.left).toBeGreaterThanOrEqual(336);
    expect(p.left + 320).toBeLessThanOrEqual(1024);
    expect(p.top + 200).toBeLessThanOrEqual(700);
  });
  it('centres without a box', () => {
    expect(placeCard(null, card, view)).toEqual({ left: 352, top: 250 });
  });
});

describe('badgeSide', () => {
  const b = (left: number, top: number) => ({ left, top, width: 300, height: 40 });
  it('sits above the corner when there is room', () => { expect(badgeSide(b(100, 60))).toBe('above'); });
  it('sits inside the corner for a box at the window top, wherever it starts', () => { expect(badgeSide(b(200, 0))).toBe('inside'); expect(badgeSide(b(0, 0))).toBe('inside'); });
});
