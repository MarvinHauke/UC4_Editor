import { describe, expect, it } from 'vitest';
import { parseControlPath, relocateWarning, setupWarnings, warningKey, warningsOf } from '../../src/app/warningMarks.ts';
import { factorySetup } from '../../src/model/index.ts';
import type { Uc4Config, Warning } from '../../src/model/index.ts';

const w = (a: string, b: string, number = 10): Warning => ({ setupId: 's', controls: [a, b], key: { kind: 'cc', channel: 1, number }, message: 'm' });

describe('parseControlPath', () => {
  it('reads a control path', () => {
    expect(parseControlPath('setups[2].encoderGroups[0].encoders[3]')).toEqual({ setupIndex: 2, group: 0, area: 'encoders', index: 3 });
    expect(parseControlPath('setups[0].faderButtonGroups[7].buttons[1]')).toEqual({ setupIndex: 0, group: 7, area: 'buttons', index: 1 });
  });
  it('refuses a path that is not a whole control', () => {
    expect(parseControlPath('setups[0].encoderGroups[0].encoders[3].number')).toBeNull();
    expect(parseControlPath('setups[0].name')).toBeNull();
  });
});

describe('warnings of one control', () => {
  it('finds a warning from either of its two controls', () => {
    const list = [w('a', 'b'), w('c', 'a', 11), w('d', 'e')];
    expect(warningsOf(list, 'a')).toHaveLength(2);
    expect(warningsOf(list, 'e')).toHaveLength(1);
    expect(warningsOf(list, 'z')).toEqual([]);
  });
});

describe('relocateWarning', () => {
  it('keeps the place of the same warning and starts over otherwise', () => {
    const list = [w('a', 'b'), w('c', 'd')];
    expect(relocateWarning(list, 0, warningKey(list[1]!))).toBe(1);
    expect(relocateWarning(list, 0, 'gone')).toBe(-1);
    expect(relocateWarning(list, -1, warningKey(list[0]!))).toBe(-1);
    expect(relocateWarning([], 0, 'x')).toBe(-1);
  });
});

describe('setupWarnings', () => {
  it('lists only the open setup, and the factory layout collides by design', () => {
    const first = factorySetup(1);
    const config: Uc4Config = { format: 'uc4-config', schemaVersion: 1, device: { profile: 'faderfox-uc4' }, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', setups: [first] };
    const list = setupWarnings(config, first.id);
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((x) => x.setupId === first.id)).toBe(true);
    expect(parseControlPath(list[0]!.controls[0])?.setupIndex).toBe(0);
  });
});
