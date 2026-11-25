import { describe, expect, it } from 'vitest';
import { nextControl } from '../../src/app/navigation.ts';
import { deviceHint } from '../../src/app/profile/uc4Hints.ts';
import { FIELDS } from '../../src/app/profile/uc4Properties.ts';
import { printedGroupName } from '../../src/app/printedNames.ts';
import { PRINTED_GROUP_NAMES } from '../../src/app/profile/uc4PrintedNames.ts';
import { factorySetup } from '../../src/model/index.ts';
import type { ControlArea } from '../../src/storage/index.ts';

describe('nextControl', () => {
  const go = (area: ControlArea, index: number, dir: 'left' | 'right' | 'up' | 'down') => nextControl({ area, index }, dir);
  it('moves along a row of encoders and stops at the edge', () => {
    expect(go('encoders', 0, 'right')).toEqual({ area: 'encoders', index: 1 });
    expect(go('encoders', 3, 'right')).toBeNull();
    expect(go('encoders', 0, 'left')).toBeNull();
  });
  it('goes from an encoder down to its push button, then to the next row', () => {
    expect(go('encoders', 0, 'down')).toEqual({ area: 'pushButtons', index: 0 });
    expect(go('pushButtons', 0, 'down')).toEqual({ area: 'encoders', index: 4 });
    expect(go('pushButtons', 4, 'up')).toEqual({ area: 'encoders', index: 4 });
  });
  it('crosses from the upper area to the faders and on to the green buttons', () => {
    expect(go('pushButtons', 4, 'down')?.area).toBe('faders');
    expect(go('faders', 0, 'right')).toEqual({ area: 'faders', index: 1 });
    expect(go('faders', 8, 'down')?.area).toBe('buttons');
    expect(go('buttons', 0, 'up')?.area).toBe('faders');
  });
  it('reaches every control from encoder 1 by arrows', () => {
    const seen = new Set<string>(['encoders:0']);
    const queue = [{ area: 'encoders' as ControlArea, index: 0 }];
    while (queue.length > 0) {
      const at = queue.pop()!;
      for (const d of ['left', 'right', 'up', 'down'] as const) {
        const n = nextControl(at, d);
        if (n && !seen.has(`${n.area}:${n.index}`)) { seen.add(`${n.area}:${n.index}`); queue.push(n); }
      }
    }
    expect(seen.size).toBe(33);
  });
});

describe('device hints', () => {
  it('has a hint for every property of every kind, naming the control and the printed encoder label', () => {
    for (const [area, fields] of Object.entries(FIELDS) as [ControlArea, (typeof FIELDS)[ControlArea]][]) {
      for (const f of fields) {
        const hint = deviceHint(area, 2, f.key);
        expect(hint, `${area} ${f.key}`).toContain('encoder 1');
        expect(hint).toContain(f.device); // the label printed on the panel
      }
    }
    expect(deviceHint('faders', 2, 'type')).toContain('FAd3');
    expect(deviceHint('pushButtons', 0, 'type')).toContain('Pbt1');
  });
});

describe('printed group names', () => {
  it('has the 16 names, for SE17 and SE18 only', () => {
    expect(PRINTED_GROUP_NAMES.encoder).toEqual(['Send 1', 'Send 2', 'Send 3', 'Send 4', 'Track', 'Rack', 'Pan', 'Global']);
    expect(PRINTED_GROUP_NAMES.faderButton).toEqual(['Launch', 'Stop', 'Active', 'Solo', 'Record', 'Monitor', 'Track', 'Select']);
    expect(PRINTED_GROUP_NAMES.slots).toEqual([17, 18]);
  });
  it.each([17, 18])('shows every group name in a factory SE%i', (slot) => {
    const setup = factorySetup(slot);
    for (let g = 0; g < 8; g++) {
      expect(printedGroupName(PRINTED_GROUP_NAMES, setup, 'encoder', g)).toBe(PRINTED_GROUP_NAMES.encoder[g]);
      expect(printedGroupName(PRINTED_GROUP_NAMES, setup, 'faderButton', g)).toBe(PRINTED_GROUP_NAMES.faderButton[g]);
    }
  });
  it('drops the name once any control of the group differs, but not for a label or a renamed group', () => {
    const setup = factorySetup(17);
    const changed = structuredClone(setup);
    changed.encoderGroups[0]!.encoders[3]!.number = 99;
    expect(printedGroupName(PRINTED_GROUP_NAMES, changed, 'encoder', 0)).toBeUndefined();
    expect(printedGroupName(PRINTED_GROUP_NAMES, changed, 'encoder', 1)).toBe('Send 2');
    const relabelled = structuredClone(setup);
    relabelled.encoderGroups[0]!.encoders[3]!.label = 'Cutoff';
    relabelled.encoderGroups[0]!.name = 'abcd';
    expect(printedGroupName(PRINTED_GROUP_NAMES, relabelled, 'encoder', 0)).toBe('Send 1');
    const fader = structuredClone(setup);
    fader.faderButtonGroups[2]!.faders[8]!.upper = 100;
    expect(printedGroupName(PRINTED_GROUP_NAMES, fader, 'faderButton', 2)).toBeUndefined();
  });
  it('shows nothing in other setups or without a slot', () => {
    expect(printedGroupName(PRINTED_GROUP_NAMES, factorySetup(3), 'encoder', 0)).toBeUndefined();
    expect(printedGroupName(PRINTED_GROUP_NAMES, { ...factorySetup(17), slot: undefined }, 'encoder', 0)).toBeUndefined();
  });
});
