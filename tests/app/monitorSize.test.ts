import { describe, expect, it } from 'vitest';
import { MONITOR_HEIGHT, MONITOR_SIZE_KEY, clampHeight, heightForKey, loadSize, parseSize, saveSize } from '../../src/app/monitorSize.ts';
import { SESSION_STATE_KEY, loadSessionState, saveSessionState } from '../../src/app/liveSessionState.ts';

const memory = () => { const m = new Map<string, string>(); return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } }; };
const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };

describe('monitor size', () => {
  it('clamps and defaults', () => {
    expect(clampHeight(10)).toBe(MONITOR_HEIGHT.min);
    expect(clampHeight(9999)).toBe(MONITOR_HEIGHT.max);
    expect(clampHeight(Number.NaN)).toBe(MONITOR_HEIGHT.default);
    expect(parseSize(null)).toEqual({ height: MONITOR_HEIGHT.default, oneLine: false });
    expect(parseSize('{nope')).toEqual({ height: MONITOR_HEIGHT.default, oneLine: false });
    expect(parseSize('{"height":300,"oneLine":true}')).toEqual({ height: 300, oneLine: true });
    expect(parseSize('{"height":"x","oneLine":1}')).toEqual({ height: MONITOR_HEIGHT.default, oneLine: false });
  });
  it('grows with the up key and shrinks with the down key', () => {
    expect(heightForKey(224, 'ArrowUp', false)).toBe(224 + MONITOR_HEIGHT.step);
    expect(heightForKey(224, 'ArrowDown', true)).toBe(224 - MONITOR_HEIGHT.bigStep);
    expect(heightForKey(224, 'Home', false)).toBe(MONITOR_HEIGHT.max);
    expect(heightForKey(224, 'x', false)).toBeNull();
  });
  it('round-trips and survives blocked storage', () => {
    const s = memory();
    saveSize({ height: 300, oneLine: true }, s);
    expect(s.m.has(MONITOR_SIZE_KEY)).toBe(true);
    expect(loadSize(s)).toEqual({ height: 300, oneLine: true });
    expect(loadSize(blocked)).toEqual({ height: MONITOR_HEIGHT.default, oneLine: false });
    expect(() => { saveSize({ height: 1, oneLine: false }, blocked); }).not.toThrow();
  });
});

describe('live session state', () => {
  it('round-trips, and anything wrong is "nothing saved"', () => {
    const s = memory();
    expect(loadSessionState(s)).toBeNull();
    const text = saveSessionState({ splits: ['a'], silenceOffers: true }, s);
    expect(s.m.get(SESSION_STATE_KEY)).toBe(text);
    expect(loadSessionState(s)).toEqual({ splits: ['a'], silenceOffers: true });
    s.m.set(SESSION_STATE_KEY, '{broken');
    expect(loadSessionState(s)).toBeNull();
    expect(loadSessionState(blocked)).toBeNull();
    expect(() => saveSessionState({}, blocked)).not.toThrow();
    expect(loadSessionState(null)).toBeNull();
  });
});
