import { describe, expect, it, vi } from 'vitest';
import { createTour } from '../../src/app/tour.svelte.ts';
import { createWelcome } from '../../src/app/welcome.svelte.ts';
import { readSeen, shouldWelcome } from '../../src/app/tour.ts';

const memory = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } }; };
function setup() {
  const storage = memory();
  const tour = createTour(storage);
  const onget = vi.fn();
  return { storage, tour, onget, welcome: createWelcome(tour, onget) };
}

describe('first run', () => {
  it('shows the card, not the tour, and marks seen', () => {
    const { welcome, tour, storage } = setup();
    expect(shouldWelcome({ seen: tour.seen, keptDumps: 0, differsFromFactory: false })).toBe(true);
    welcome.show();
    expect(welcome.open).toBe(true);
    expect(tour.open).toBe(false);
    expect(readSeen(storage)).toBe(true);
    expect(shouldWelcome({ seen: tour.seen, keptDumps: 0, differsFromFactory: false })).toBe(false);
  });
});

describe('the three choices', () => {
  it('Take the tour closes the card and starts the tour at step 1', () => {
    const { welcome, tour, onget } = setup();
    welcome.show(); welcome.takeTour();
    expect(welcome.open).toBe(false);
    expect(tour.open).toBe(true);
    expect(tour.index).toBe(0);
    expect(onget).not.toHaveBeenCalled();
  });
  it('Get my setups closes the card and opens the dump overlay, no tour', () => {
    const { welcome, tour, onget } = setup();
    welcome.show(); welcome.getSetups();
    expect(welcome.open).toBe(false);
    expect(tour.open).toBe(false);
    expect(onget).toHaveBeenCalledOnce();
  });
  it('Not now closes the card and nothing else', () => {
    const { welcome, tour, onget } = setup();
    welcome.show(); welcome.dismiss();
    expect(welcome.open).toBe(false);
    expect(tour.open).toBe(false);
    expect(onget).not.toHaveBeenCalled();
  });
});

describe('Settings → Tour', () => {
  it('starts the tour directly, without the card', () => {
    const { welcome, tour } = setup();
    tour.start();
    expect(tour.open).toBe(true);
    expect(welcome.open).toBe(false);
  });
});
