import { describe, expect, it } from 'vitest';
import { factorySetup, type Uc4Config, type Warning } from '../../src/model/index.ts';
import { factoryControl, factoryReset, isWarned } from '../../src/app/factoryControl.ts';

const config = (): Uc4Config => ({ setups: [{ ...factorySetup(1), id: 'a' }, { ...factorySetup(3), id: 'b' }] }) as unknown as Uc4Config;

describe('factoryControl', () => {
  it('is the control of that slot, group and index', () => {
    expect(factoryControl(1, 'faders', 0, 0)).toMatchObject({ type: 'CCAb', channel: 1, number: 32 });
    expect(factoryControl(3, 'faders', 0, 0)).toMatchObject({ channel: 3, number: 32 });
    expect(factoryControl(1, 'encoders', 1, 2)).toMatchObject({ number: 18 });
    expect(factoryControl(1, 'buttons', 0, 0)).toMatchObject({ type: 'notE', number: 64 });
  });
  it('is null for no slot, a slot out of range or a place that does not exist', () => {
    expect(factoryControl(undefined, 'faders', 0, 0)).toBeNull();
    expect(factoryControl(19, 'faders', 0, 0)).toBeNull();
    expect(factoryControl(1, 'faders', 9, 0)).toBeNull();
  });
});

describe('factoryReset', () => {
  it('names what the control sends again', () => {
    const r = factoryReset(config(), { setupId: 'b', area: 'faders', group: 0, index: 0 }, 'FAd1 · FG1');
    expect(r?.text).toBe('FAd1 · FG1 back to factory: CCAb 32 ch3');
  });
  it('is null for an unknown setup', () => {
    expect(factoryReset(config(), { setupId: 'zz', area: 'faders', group: 0, index: 0 }, 'x')).toBeNull();
  });
});

describe('isWarned', () => {
  const w = { setupId: 'b', controls: ['setups[1].faderButtonGroups[0].faders[0]', 'setups[1].encoderGroups[0].encoders[0]'], key: { kind: 'cc', channel: 3, number: 32 }, message: '' } as unknown as Warning;
  it('is true for either control of a warning, in its own setup only', () => {
    expect(isWarned(config(), [w], { setupId: 'b', area: 'faders', group: 0, index: 0 })).toBe(true);
    expect(isWarned(config(), [w], { setupId: 'b', area: 'encoders', group: 0, index: 0 })).toBe(true);
    expect(isWarned(config(), [w], { setupId: 'a', area: 'faders', group: 0, index: 0 })).toBe(false);
    expect(isWarned(config(), [w], { setupId: 'b', area: 'faders', group: 0, index: 1 })).toBe(false);
    expect(isWarned(config(), [], { setupId: 'b', area: 'faders', group: 0, index: 0 })).toBe(false);
  });
});
