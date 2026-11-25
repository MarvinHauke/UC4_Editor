import { describe, expect, it } from 'vitest';
import { faderfoxUc4 } from '../../src/protocol/profiles/uc4.ts';

describe('UC4 profile: steps to send a dump', () => {
  it('has ordered steps for Sndc and SndA that name the device functions', () => {
    const { one, all } = faderfoxUc4.sendSteps;
    expect(one.join(' ')).toMatch(/Sndc/);
    expect(one.join(' ')).toMatch(/encoder 1/);
    expect(all.join(' ')).toMatch(/SndA/);
    expect(all.join(' ')).toMatch(/encoder 8/);
    for (const steps of [one, all]) expect(steps[0]).toMatch(/Shift.*Edit twice/);
  });
});
