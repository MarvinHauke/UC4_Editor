import { describe, expect, it } from 'vitest';
import { canPasteControl, copyKey, isHeldControl, levelOf, levelOfHeld } from '../../src/app/copyPaste.ts';

describe('canPasteControl', () => {
  it('pastes onto the same kind only', () => {
    expect(canPasteControl({ area: 'encoders', index: 0 }, { area: 'encoders', index: 5 })).toBe(true);
    expect(canPasteControl({ area: 'encoders', index: 0 }, { area: 'pushButtons', index: 0 })).toBe(false);
    expect(canPasteControl({ area: 'buttons', index: 1 }, { area: 'faders', index: 1 })).toBe(false);
  });
  it('keeps fader 9 apart from faders 1–8', () => {
    expect(canPasteControl({ area: 'faders', index: 8 }, { area: 'faders', index: 8 })).toBe(true);
    expect(canPasteControl({ area: 'faders', index: 8 }, { area: 'faders', index: 2 })).toBe(false);
    expect(canPasteControl({ area: 'faders', index: 2 }, { area: 'faders', index: 8 })).toBe(false);
    expect(canPasteControl({ area: 'faders', index: 2 }, { area: 'faders', index: 3 })).toBe(true);
  });
});

describe('held', () => {
  it('knows the held control and its level', () => {
    const held = { kind: 'control', setupId: 's', area: 'encoders', group: 1, index: 2 } as const;
    expect(isHeldControl(held, 's', 'encoders', 1, 2)).toBe(true);
    expect(isHeldControl(held, 's', 'encoders', 1, 3)).toBe(false);
    expect(isHeldControl(null, 's', 'encoders', 1, 2)).toBe(false);
    expect(levelOfHeld(held)).toBe('control');
    expect(levelOfHeld({ kind: 'setup', setupId: 's' })).toBe('setup');
    expect(levelOfHeld({ kind: 'faderButtonGroup', setupId: 's', group: 0 })).toBe('group');
  });
});

describe('keys', () => {
  const key = (k: string, over: object = {}) => ({ key: k, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...over });
  it('Cmd/Ctrl-C and -V always', () => {
    expect(copyKey(key('c', { metaKey: true }), false)).toBe('copy');
    expect(copyKey(key('V', { ctrlKey: true }), false)).toBe('paste');
    expect(copyKey(key('c', { metaKey: true, shiftKey: true }), false)).toBeNull();
  });
  it('y and p only with Vim keys, and never with a modifier', () => {
    expect(copyKey(key('y'), false)).toBeNull();
    expect(copyKey(key('y'), true)).toBe('copy');
    expect(copyKey(key('p'), true)).toBe('paste');
    expect(copyKey(key('p', { altKey: true }), true)).toBeNull();
  });
});

describe('levelOf', () => {
  const at = (level: string) => ({ closest: () => ({ getAttribute: () => level }) });
  it('takes the level from the area that has the focus', () => {
    expect(levelOf(at('setup'), true)).toBe('setup');
    expect(levelOf(at('group'), true)).toBe('group');
    expect(levelOf(at('control'), true)).toBe('control');
    expect(levelOf(at('control'), false)).toBe('group');
    expect(levelOf({ closest: () => null }, true)).toBeNull();
  });
});
