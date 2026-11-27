import { describe, expect, it } from 'vitest';
import { matchLabel, relativeAngle, ringPath, selectMatch, stateText, whereWord } from '../../src/app/liveView.ts';
import type { Match } from '../../src/live/index.ts';

const match = (tier: 1 | 2 | 3, setupId = 's1', area: 'encoders' | 'faders' = 'faders'): Match => ({
  tier, via: 'message',
  control: { id: `${setupId}|${area}|1|2`, setupId, setupName: 'SE05', area, group: 1, index: 2, name: 'FAd3 · FG2' },
});

describe('matchLabel', () => {
  it('names the best match with the others counted and where it is when not in the open groups', () => {
    expect(matchLabel({ best: match(1), more: 2 })).toEqual({ name: 'FAd3 · FG2', more: 2, where: null });
    expect(whereWord(match(2))).toBe('other group');
    expect(whereWord(match(3))).toBe('SE05');
    expect(matchLabel({ best: null, more: 0 })).toBeNull();
  });
});

describe('selectMatch', () => {
  const calls = () => { const log: string[] = []; return { log, c: {
    selectSetup: (id: string) => log.push(`setup ${id}`),
    selectGroup: (k: string, g: number) => log.push(`group ${k} ${g}`),
    selectControl: (x: { area: string; index: number }) => log.push(`control ${x.area} ${x.index}`),
  } }; };
  it('shows the group and the control; the setup only when it is another one', () => {
    const a = calls(); selectMatch(a.c, match(1), 's1');
    expect(a.log).toEqual(['group faderButton 1', 'control faders 2']);
    const b = calls(); selectMatch(b.c, match(3, 's9', 'encoders'), 's1');
    expect(b.log).toEqual(['setup s9', 'group encoder 1', 'control encoders 2']);
  });
});

describe('ringPath and relativeAngle', () => {
  it('draws nothing at zero and a large arc past half', () => {
    expect(ringPath(0, 0, 10, 0)).toBe('');
    expect(ringPath(0, 0, 10, 0.4)).toContain(' 0 0 1 ');
    expect(ringPath(0, 0, 10, 1)).toContain(' 0 1 1 ');
  });
  it('starts bottom left (7:30) and sweeps clockwise to bottom right', () => {
    expect(ringPath(0, 10, 10, 0.5)).toBe('M-7.07 17.07 A10 10 0 0 1 0.00 0.00');
    expect(ringPath(0, 0, 10, 1)).toMatch(/^M-7\.07 7\.07 A10 10 0 1 1 7\.07 7\.07$/);
  });
  it('turns 13.5° per net tick on the 270° sweep and wraps both ways', () => {
    expect(relativeAngle(0)).toBe(-135);
    expect(relativeAngle(5)).toBe(-67.5);
    expect(relativeAngle(-1)).toBe(121.5);
    expect(relativeAngle(20)).toBe(-135);
  });
});

describe('stateText', () => {
  it('says nothing for unknown and words for each kind', () => {
    expect(stateText(undefined)).toBeNull();
    expect(stateText({ kind: 'absolute', value: 64, fraction: 0.5039, at: 0 })).toBe('64 · 50%');
    expect(stateText({ kind: 'absolute', value: 64, fraction: null, at: 0 })).toBe('last sent 64');
    expect(stateText({ kind: 'relative', delta: -1, total: 3, at: 0 })).toBe('−1 · net +3');
    expect(stateText({ kind: 'button', on: true, at: 0 })).toBe('on');
    expect(stateText({ kind: 'trigger', count: 2, value: 5, at: 0 })).toBe('pressed 2×');
  });
});
