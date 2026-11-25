import { describe, expect, it } from 'vitest';
import { factorySetup } from '../../src/model/index.ts';
import { describeChanges } from '../../src/storage/sendPlan.ts';
import { spellChange, spellName } from '../../src/app/profile/uc4Display.ts';

describe('spellName', () => {
  it('writes names the way the display shows them', () => {
    expect(spellName('grp1')).toBe('GrP1');
    expect(spellName('send')).toBe('SEnd');
    expect(spellName('filt')).toBe('FiLt');
    expect(spellName('snd1')).toBe('Snd1');
    expect(spellName('glob')).toBe('GLOb');
    expect(spellName('pan')).toBe('PAn');
    expect(spellName('trac')).toBe('trAC'); // the glyphs win over the manual's `traC`
  });
});

describe('spellChange against the real change list', () => {
  it('spells the name of a real describeChanges item', () => {
    const before = factorySetup(5);
    const after = structuredClone(before);
    after.encoderGroups[0]!.name = 'send';
    const diffs = [{ slot: 5, field: { what: 'groupName', group: 1, char: 1 }, address: 0, before: 0, after: 0, confidence: null }] as never;
    const { items } = describeChanges(diffs, 5, before, after);
    expect(items).toHaveLength(1);
    expect(items[0]!.name).toMatchObject({ group: 1, to: 'send' });
    expect(spellChange(items[0]!)).toBe('Encoder group 1: name GrP1 → SEnd');
    // The sentence is built here and in src/storage: pin them together.
    expect(spellChange(items[0]!).toLowerCase()).toBe(items[0]!.text.toLowerCase());
  });
  it('says (blank) for an empty name, never an empty space after the arrow', () => {
    expect(spellChange({ text: 't', name: { group: 1, from: 'grp1', to: '    ' } })).toBe('Encoder group 1: name GrP1 → (blank)');
    expect(spellChange({ text: 't', name: { group: 2, from: '    ', to: 'send' } })).toBe('Encoder group 2: name (blank) → SEnd');
    expect(spellChange({ text: 't', name: { group: 1, from: 'ab  ', to: 'cd  ' } })).toBe('Encoder group 1: name Ab → Cd');
  });
  it('shows trailing blanks when they are the only difference', () => {
    expect(spellChange({ text: 't', name: { group: 1, from: 'send', to: 'sen ' } })).not.toContain('SEnd → SEn →');
    expect(spellChange({ text: 't', name: { group: 1, from: 'ab  ', to: 'ab c' } })).toBe('Encoder group 1: name Ab → Ab C');
    expect(spellChange({ text: 't', name: { group: 1, from: 'ab  ', to: 'ab ' } })).toBe('Encoder group 1: name Ab·· → Ab·');
  });
  it('leaves other changes as they are', () => {
    expect(spellChange({ text: 'Enc1, encoder group 1: number 8 → 99' })).toBe('Enc1, encoder group 1: number 8 → 99');
  });
});
