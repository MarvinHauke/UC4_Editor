import { describe, expect, it } from 'vitest';
import { GEOMETRY } from '../../src/app/profile/uc4Geometry.ts';
import { RECEIVE_GUIDE } from '../../src/app/profile/uc4Guides.ts';

describe('receive guide', () => {
  it('has three numbered callouts of at most two lines, as the manual says', () => {
    expect(RECEIVE_GUIDE.callouts.map((c) => c.n)).toEqual([1, 2, 3]);
    for (const c of RECEIVE_GUIDE.callouts) expect(c.lines.length).toBeLessThanOrEqual(2);
    const text = (n: number): string => RECEIVE_GUIDE.callouts[n - 1]!.lines.flat().map((x) => (typeof x === 'string' ? x : x.key)).join('');
    expect(text(1)).toBe('Hold Shift');
    expect(text(2)).toBe('Press Edit twice:Setup LED on');
    expect(text(3)).toContain('Hold encoder 7: rEc,');
    expect(text(3)).toContain('until rc00');
  });
  it('lights the Setup LED and shows rEc on the display', () => {
    expect(RECEIVE_GUIDE.cues).toContainEqual({ kind: 'setupLed' });
    expect(RECEIVE_GUIDE.cues).toContainEqual({ kind: 'display', text: 'rEc' });
  });
  it('keeps no callout over another', () => {
    const cs = RECEIVE_GUIDE.callouts;
    for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
      const a = cs[i]!, b = cs[j]!;
      if (a.part !== b.part) continue;
      const apart = a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
      expect(apart).toBe(true);
    }
  });
  it('keeps lower callouts above the faders\' bottom edge, so no fader label is covered', () => {
    const f = GEOMETRY.faders[0] as { y: number; height: number };
    for (const c of RECEIVE_GUIDE.callouts.filter((x) => x.part === 'lower')) expect(c.y + c.height).toBeLessThanOrEqual(f.y + f.height);
  });
});
