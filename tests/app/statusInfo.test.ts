import { describe, expect, it } from 'vitest';
import { showWarningCount } from '../../src/app/statusInfo.ts';

const base = { warnings: 2, offer: false, note: false, exportWarnings: 0 };
describe('the status bar holds one info at a time', () => {
  it('shows the warning count when nothing else is shown', () => { expect(showWarningCount(base)).toBe(true); });
  it('hides it while the switch offer shows', () => { expect(showWarningCount({ ...base, offer: true })).toBe(false); });
  it('hides it while the "Switched to … · Back" note shows', () => { expect(showWarningCount({ ...base, note: true })).toBe(false); });
  it('hides it beside the exported-warnings note, and with no warnings', () => {
    expect(showWarningCount({ ...base, exportWarnings: 1 })).toBe(false);
    expect(showWarningCount({ ...base, warnings: 0 })).toBe(false);
  });
});
