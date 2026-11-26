import { describe, expect, it } from 'vitest';
import { MONITOR_SIZE_KEY, loadSize, parseSize, saveSize } from '../../src/app/monitorSize.ts';
import { SESSION_STATE_KEY, loadSessionState, saveSessionState } from '../../src/app/liveSessionState.ts';

const memory = () => { const m = new Map<string, string>(); return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } }; };
const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };

describe('monitor size', () => {
  it('defaults, and ignores an old stored height', () => {
    expect(parseSize(null)).toEqual({ oneLine: false });
    expect(parseSize('{nope')).toEqual({ oneLine: false });
    expect(parseSize('{"height":300,"oneLine":true}')).toEqual({ oneLine: true });
    expect(parseSize('{"oneLine":1}')).toEqual({ oneLine: false });
  });
  it('round-trips and survives blocked storage', () => {
    const s = memory();
    saveSize({ oneLine: true }, s);
    expect(s.m.has(MONITOR_SIZE_KEY)).toBe(true);
    expect(loadSize(s)).toEqual({ oneLine: true });
    expect(loadSize(blocked)).toEqual({ oneLine: false });
    expect(() => { saveSize({ oneLine: false }, blocked); }).not.toThrow();
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
