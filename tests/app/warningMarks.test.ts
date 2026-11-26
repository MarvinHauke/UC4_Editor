import { describe, expect, it } from 'vitest';
import { parseControlPath, warningsOf } from '../../src/app/warningMarks.ts';
import type { Warning } from '../../src/model/index.ts';

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
