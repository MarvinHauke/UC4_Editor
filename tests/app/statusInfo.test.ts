import { describe, expect, it } from 'vitest';
import { showWarningItem, warningItem } from '../../src/app/statusInfo.ts';

const base = { offer: false, note: false, exportWarnings: 0 };
describe('the status bar holds one info at a time', () => {
  it('shows the warning count when nothing else is shown', () => { expect(showWarningItem(base)).toBe(true); });
  it('hides it while the switch offer shows', () => { expect(showWarningItem({ ...base, offer: true })).toBe(false); });
  it('hides it while the "Switched to … · Back" note shows', () => { expect(showWarningItem({ ...base, note: true })).toBe(false); });
  it('hides it beside the exported-warnings note', () => {
    expect(showWarningItem({ ...base, exportWarnings: 1 })).toBe(false);
  });
});

describe('the warning item never goes away (decision 30)', () => {
  it('counts open warnings', () => {
    expect(warningItem(1, 5)).toEqual({ clear: false, text: '1 warning' });
    expect(warningItem(3, 0)).toEqual({ clear: false, text: '3 warnings' });
  });
  it('says no warnings, with how many are ignored', () => {
    expect(warningItem(0, 4)).toEqual({ clear: true, text: 'No warnings · 4 ignored' });
    expect(warningItem(0, 0)).toEqual({ clear: true, text: 'No warnings' });
  });
});
