import { describe, expect, it } from 'vitest';
import { GEOMETRY } from '../../src/app/profile/uc4Geometry.ts';
import { sendGuide } from '../../src/app/profile/uc4Guides.ts';
import { createDumpGuide } from '../../src/app/dumpGuide.svelte.ts';
import { listenStatus } from '../../src/app/dumpGuide.ts';

const text = (c: { lines: readonly (readonly (string | { key: string })[])[] }): string => c.lines.flat().map((x) => (typeof x === 'string' ? x : x.key)).join('');

describe('send guide callouts', () => {
  it('SndA: Shift, Edit twice, hold encoder 8, numbered without a gap', () => {
    const g = sendGuide('all');
    expect(g.callouts.map((c) => c.n)).toEqual([1, 2, 3]);
    expect(text(g.callouts[2]!)).toContain("encoder 8's push button");
    expect(g.lit).toContainEqual({ area: 'pushButtons', index: 7 });
  });
  it('Sndc: adds turning encoder 1, then holds encoder 4', () => {
    const g = sendGuide('one');
    expect(g.callouts.map((c) => c.n)).toEqual([1, 2, 3, 4]);
    expect(text(g.callouts[2]!)).toBe('Turn encoder 1 to the setup');
    expect(text(g.callouts[3]!)).toContain("encoder 4's push button");
  });
  it.each(['one', 'all'] as const)('%s: no callout over another or below the faders\' edge', (choice) => {
    const cs = sendGuide(choice).callouts;
    for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
      const a = cs[i]!, b = cs[j]!;
      if (a.part !== b.part) continue;
      expect(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y).toBe(true);
    }
    const f = GEOMETRY.faders[0] as { y: number; height: number };
    for (const c of cs.filter((x) => x.part === 'lower')) expect(c.y + c.height).toBeLessThanOrEqual(f.y + f.height);
  });
});

describe('dump guide state', () => {
  it('defaults to SndA; a dump arriving closes it; Close ends it', () => {
    const d = createDumpGuide();
    expect(d.choice).toBe('all');
    d.show(); expect(d.open).toBe(true);
    d.dumpArrived(); expect(d.open).toBe(false);
    d.show(); d.close(); expect(d.open).toBe(false);
  });
  it('a dump with the guide closed changes nothing', () => {
    const d = createDumpGuide(); d.dumpArrived(); expect(d.open).toBe(false);
  });
  it('says waiting only when connected, else offers Connect', () => {
    expect(listenStatus({ kind: 'connected', port: { id: '1', name: 'p' } }, 'UC4').waiting).toBe(true);
    expect(listenStatus({ kind: 'not-connected', access: false, message: '' }, 'UC4').connect).toBe('connect');
  });
});

import { createGuide } from '../../src/app/guide.svelte.ts';
describe('guide ownership', () => {
  it('clear(owner) leaves another dialog\'s guide alone', () => {
    const g = createGuide();
    const mine = {}, theirs = {};
    g.show(sendGuide('all'), mine as never);
    g.show(sendGuide('one'), theirs as never);
    g.clear(mine);
    expect(g.card).toBe(theirs);
    g.clear(theirs);
    expect(g.card).toBeNull();
  });
});
