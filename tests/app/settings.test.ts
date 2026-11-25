import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, SLIDE, slideDuration, SETTINGS_KEY, createSettings, parseSettings } from '../../src/app/settings.svelte.ts';

const fake = (initial: string | null = null) => {
  const store = new Map<string, string>(initial === null ? [] : [[SETTINGS_KEY, initial]]);
  return { store, getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } };
};

describe('keys setting', () => {
  it('defaults to standard, reads vim, and ignores anything else', () => {
    expect(DEFAULT_SETTINGS.keys).toBe('standard');
    expect(parseSettings('{"keys":"vim"}').keys).toBe('vim');
    expect(parseSettings('{"keys":"emacs"}').keys).toBe('standard');
  });
});

describe('parseSettings', () => {
  it('falls back to the defaults for nothing, garbage and wrong types', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('{nope')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('[]')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('{"theme":"purple","slideMs":"fast","open":1}')).toEqual(DEFAULT_SETTINGS);
  });
  it('keeps the valid fields', () => {
    expect(parseSettings('{"theme":"dark","slideMs":240,"open":true}')).toEqual({ theme: 'dark', slideMs: 240, open: true, keys: 'standard' });
  });
  it('migrates the old on/off checkbox: off becomes 0, on keeps the default', () => {
    expect(parseSettings('{"animate":false}').slideMs).toBe(0);
    expect(parseSettings('{"animate":true}').slideMs).toBeNull();
    expect(parseSettings('{"animate":false,"slideMs":100}').slideMs).toBe(100);
  });
  it('clamps a stored speed to 0–400', () => {
    expect(parseSettings('{"slideMs":9999}').slideMs).toBe(400);
    expect(parseSettings('{"slideMs":-5}').slideMs).toBe(0);
  });
});

describe('createSettings', () => {
  it('defaults to the dark theme', () => { expect(DEFAULT_SETTINGS.theme).toBe('dark'); });
  it('remembers its choices in storage', () => {
    const s = fake();
    const a = createSettings(s);
    a.setTheme('light'); a.setSlideMs(80); a.toggle();
    const b = createSettings(s);
    expect([b.theme, b.slideMs, b.open]).toEqual(['light', 80, true]);
  });
  it('works when storage is missing or throws', () => {
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    for (const storage of [null, broken]) {
      const s = createSettings(storage);
      expect(s.theme).toBe('dark'); // the default
      s.setTheme('light');
      expect(s.theme).toBe('light');
      expect(s.open).toBe(false);
    }
  });
});

describe('slideDuration', () => {
  it('uses the default, none under reduced motion, and the user\'s speed either way', () => {
    expect(slideDuration(null, false)).toBe(SLIDE.default);
    expect(slideDuration(null, true)).toBe(0);
    expect(slideDuration(0, false)).toBe(0);
    expect(slideDuration(240, true)).toBe(240);
  });
});
