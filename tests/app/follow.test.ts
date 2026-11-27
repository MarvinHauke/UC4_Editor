import { describe, expect, it } from 'vitest';
import { FOLLOW_KEY, followTarget, loadFollow, saveFollow, shouldFollow } from '../../src/app/follow.ts';

const memory = () => { const m = new Map<string, string>(); return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } }; };
const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };

describe('follow', () => {
  it('is on until switched off, and remembered', () => {
    const s = memory();
    expect(loadFollow(s)).toBe(true);
    saveFollow(false, s);
    expect(s.m.get(FOLLOW_KEY)).toBe('0');
    expect(loadFollow(s)).toBe(false);
    saveFollow(true, s);
    expect(loadFollow(s)).toBe(true);
  });
  it('survives blocked storage', () => {
    expect(loadFollow(blocked)).toBe(true);
    expect(() => { saveFollow(true, blocked); }).not.toThrow();
  });
  it('selects only when on, not armed and not typing', () => {
    expect(shouldFollow({ on: true, armed: false, fieldFocused: false })).toBe(true);
    expect(shouldFollow({ on: false, armed: false, fieldFocused: false })).toBe(false);
    expect(shouldFollow({ on: true, armed: true, fieldFocused: false })).toBe(false);
    expect(shouldFollow({ on: true, armed: false, fieldFocused: true })).toBe(false);
  });
});

describe('followTarget', () => {
  const control = (o: object = {}) => ({ id: 'x', setupId: 's1', setupName: 'A', area: 'encoders', group: 2, index: 3, name: 'Enc4', ...o }) as never;
  const sel = (o: object = {}) => ({ setupId: 's1', encoderGroup: 2, faderButtonGroup: 5, control: { area: 'encoders', index: 3 }, ...o });
  it('is null when the control is already selected', () => { expect(followTarget(sel(), control())).toBeNull(); });
  it('selects a control of the other group half or another group', () => {
    expect(followTarget(sel(), control({ area: 'faders', group: 5, index: 1 }))?.control.index).toBe(1);
    expect(followTarget(sel({ encoderGroup: 0 }), control())).not.toBeNull();
    expect(followTarget(sel({ control: null }), control())).not.toBeNull();
  });
  it('selects a control of another setup', () => { expect(followTarget(sel(), control({ setupId: 's2' }))).not.toBeNull(); });
});
