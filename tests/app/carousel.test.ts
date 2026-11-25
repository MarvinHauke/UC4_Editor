import { describe, expect, it } from 'vitest';
import { groupAction, stepGroup } from '../../src/app/carousel.ts';

describe('stepGroup', () => {
  it.each([[0, 1, 1], [7, 1, 0], [0, -1, 7], [3, -1, 2]])('from %i by %i gives %i', (from, delta, to) => {
    expect(stepGroup(from, delta)).toBe(to);
  });
});
const press = (key: string, o: Partial<{ altKey: boolean; shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }> = {}) =>
  ({ key, altKey: false, shiftKey: false, metaKey: false, ctrlKey: false, ...o });

describe('groupAction (one key per action, decision 42)', () => {
  it('steps the encoder groups with ( ) and the fader/button groups with { }, with or without a selection', () => {
    for (const selected of [null, 'encoders', 'faders']) {
      expect(groupAction(press('('), selected)).toEqual({ kind: 'encoder', delta: -1 });
      expect(groupAction(press(')'), selected)).toEqual({ kind: 'encoder', delta: 1 });
      expect(groupAction(press('{'), selected)).toEqual({ kind: 'faderButton', delta: -1 });
      expect(groupAction(press('}'), selected)).toEqual({ kind: 'faderButton', delta: 1 });
    }
  });
  it('works as the German Mac layout sends it: { } with Option held, ( ) with Shift held', () => {
    expect(groupAction(press('{', { altKey: true }), null)).toEqual({ kind: 'faderButton', delta: -1 });
    expect(groupAction(press('}', { altKey: true }), 'encoders')).toEqual({ kind: 'faderButton', delta: 1 });
    expect(groupAction(press('(', { shiftKey: true }), null)).toEqual({ kind: 'encoder', delta: -1 });
  });
  it('no longer reacts to [ ] or Shift + arrows', () => {
    expect(groupAction(press('['), null)).toBeNull();
    expect(groupAction(press(']'), null)).toBeNull();
    for (const k of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) expect(groupAction(press(k, { shiftKey: true }), 'faders')).toBeNull();
  });
  it('steps the group of the selected control with Option + ← →', () => {
    expect(groupAction(press('ArrowRight', { altKey: true }), 'encoders')).toEqual({ kind: 'encoder', delta: 1 });
    expect(groupAction(press('ArrowLeft', { altKey: true }), 'pushButtons')).toEqual({ kind: 'encoder', delta: -1 });
    expect(groupAction(press('ArrowRight', { altKey: true }), 'faders')).toEqual({ kind: 'faderButton', delta: 1 });
    expect(groupAction(press('ArrowLeft', { altKey: true }), 'buttons')).toEqual({ kind: 'faderButton', delta: -1 });
  });
  it('does nothing for Option + arrows without a selection, a crossfader, plain arrows or Cmd', () => {
    expect(groupAction(press('ArrowRight', { altKey: true }), null)).toBeNull();
    expect(groupAction(press('ArrowRight', { altKey: true }), 'crossfader')).toBeNull();
    expect(groupAction(press('ArrowLeft'), 'faders')).toBeNull();
    expect(groupAction(press('(', { metaKey: true }), null)).toBeNull();
  });
});
