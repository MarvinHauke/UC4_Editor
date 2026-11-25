import { describe, expect, it } from 'vitest';
import { areaOf, createActiveArea } from '../../src/app/activeArea.svelte.ts';

const inside = (name: string | null) => ({ closest: () => (name === null ? null : { getAttribute: () => name }) });

describe('active area', () => {
  it('names the area a target is in, and nothing for the rest', () => {
    expect(areaOf(inside('setups'))).toBe('setups');
    expect(areaOf(inside('device'))).toBe('device');
    expect(areaOf(inside(null))).toBeNull();
    expect(areaOf(inside('toolbar'))).toBeNull();
    expect(areaOf(null)).toBeNull();
    expect(areaOf({})).toBeNull();
  });
  it('keeps the last area when a click lands outside every area', () => {
    const a = createActiveArea();
    expect(a.current).toBeNull();
    a.note(inside('setups'));
    expect(a.current).toBe('setups');
    a.note(inside(null));
    expect(a.current).toBe('setups');
    a.note(inside('device'));
    expect(a.current).toBe('device');
  });
});

describe('section of the groups area', () => {
  it('starts on the encoder group and keeps what was set', () => {
    const a = createActiveArea();
    expect(a.section).toBe('encoder');
    a.setSection('faderButton');
    expect(a.section).toBe('faderButton');
  });
});
