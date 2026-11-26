import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSwitchNote, offerShort, sameWhere, switchedText } from '../../src/app/switchNote.svelte.ts';
import type { SwitchOffer } from '../../src/live/index.ts';

const offer = (changes: SwitchOffer['changes']): SwitchOffer => ({
  target: { setupId: 's2', setupName: 'SE05', encoderGroup: 2, faderButtonGroup: 1 }, changes, text: '',
});
const where = { setupId: 's2', encoderGroup: 2, faderButtonGroup: 1 };
const cfg = { setups: [] };

describe('switchedText', () => {
  it('names only what changed, groups numbered 1–8', () => {
    expect(switchedText(offer(['encoderGroup']))).toBe('Switched to encoder group 3');
    expect(switchedText(offer(['setup', 'encoderGroup', 'faderButtonGroup']))).toBe('Switched to SE05, encoder group 3, fader/button group 2');
  });
});

describe('offerShort', () => {
  it('is the status bar form of what would change', () => {
    expect(offerShort(offer(['encoderGroup']))).toBe('EG3?');
    expect(offerShort(offer(['setup', 'encoderGroup', 'faderButtonGroup']))).toBe('SE05 EG3 FG2?');
  });
});

describe('the note', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });
  it('stays for a while, then goes', () => {
    const n = createSwitchNote({ ms: 1000 });
    n.show(offer(['encoderGroup']), cfg);
    expect(n.note?.text).toBe('Switched to encoder group 3');
    vi.advanceTimersByTime(999);
    expect(n.note).not.toBeNull();
    vi.advanceTimersByTime(2);
    expect(n.note).toBeNull();
  });
  it('goes at the next selection change, but not at the switch itself', () => {
    const n = createSwitchNote();
    n.show(offer(['encoderGroup']), cfg);
    n.changed(where, cfg);
    expect(n.note).not.toBeNull();
    n.changed({ ...where, encoderGroup: 5 }, cfg);
    expect(n.note).toBeNull();
  });
  it('goes when an edit changed the configuration, because Back would undo the edit', () => {
    const n = createSwitchNote();
    n.show(offer(['encoderGroup']), cfg);
    n.changed(where, { edited: true });
    expect(n.note).toBeNull();
  });
  it('compares places', () => { expect(sameWhere(where, { ...where })).toBe(true); expect(sameWhere(where, { ...where, encoderGroup: 0 })).toBe(false); });
});
