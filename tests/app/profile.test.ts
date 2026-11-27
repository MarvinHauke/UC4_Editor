import { describe, expect, it } from 'vitest';
import { controlPathOf, factorySetup } from '../../src/model/index.ts';
import { GEOMETRY } from '../../src/app/profile/uc4Geometry.ts';
import { COMMAND_TYPES, FIELDS, VALUE_WORDS, commandTypeLine } from '../../src/app/profile/uc4Properties.ts';
import { problemsOf } from '../../src/app/controlProblems.ts';
import type { ControlArea } from '../../src/storage/index.ts';

const COUNTS: Record<ControlArea, number> = { encoders: 8, pushButtons: 8, faders: 9, buttons: 8 };
const AREAS = Object.keys(COUNTS) as ControlArea[];

describe('device profile data', () => {
  it.each(AREAS)('has geometry for every %s', (area) => {
    expect(GEOMETRY[area]).toHaveLength(COUNTS[area]);
  });

  it.each(AREAS)('lists exactly the properties a %s has, in the device order', (area) => {
    const setup = factorySetup(1);
    const sample = area === 'encoders' || area === 'pushButtons' ? setup.encoderGroups[0]![area][0]! : setup.faderButtonGroups[0]![area][0]!;
    const keys = FIELDS[area].map((f) => f.key);
    expect([...keys].sort()).toEqual(Object.keys(sample).filter((k) => k !== 'label').sort());
    const order = ['display', 'type', 'mode', 'channel', 'number', 'lower', 'upper'];
    expect(keys).toEqual(order.filter((k) => keys.includes(k as never)));
  });

  it('has no display scale for push buttons', () => {
    expect(FIELDS.pushButtons.some((f) => f.key === 'display')).toBe(false);
  });

  it('gives every choice friendly words', () => {
    for (const area of AREAS) for (const f of FIELDS[area]) if (f.input === 'choice') for (const c of f.choices) expect(VALUE_WORDS[c], c).toBeTruthy();
  });
});

describe('problemsOf', () => {
  it('finds the problems of one control by path', () => {
    const path = controlPathOf(0, 'encoders', 2, 3);
    expect(path).toBe('setups[0].encoderGroups[2].encoders[3]');
    const found = problemsOf([
      { path: `${path}.number`, message: 'bad' },
      { path: 'setups[0].encoderGroups[2].encoders[4].number', message: 'other' },
      { path: 'setups[0].encoderGroups[2].encoders[30].number', message: 'prefix trap' },
    ], path);
    expect(found).toEqual([{ property: 'number', message: 'bad' }]);
  });
});

describe('svg text size', () => {
  it('stays at least 11 px at the smallest scale', async () => {
    const { readFileSync } = await import('node:fs');
    const { MIN_SCALE } = await import('../../src/app/profile/uc4Geometry.ts');
    for (const file of ['ControlGlyph', 'AreaView']) {
      const css = readFileSync(`src/components/${file}.svelte`, 'utf8').split('<style>')[1] ?? '';
      const sizes = [...css.matchAll(/font(?:-size)?:[^;}]*?(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]));
      expect(sizes.length, file).toBeGreaterThan(0);
      for (const size of sizes) expect(size * MIN_SCALE, `${file} ${size}`).toBeGreaterThanOrEqual(11);
    }
  });
});

describe('7-segment glyphs', () => {
  it('has a glyph for every character a group name may hold', async () => {
    const { NAME_CHARS } = await import('../../src/model/index.ts');
    const { GLYPHS, UNSEEN_GLYPHS } = await import('../../src/app/profile/uc4Segments.ts');
    for (const ch of NAME_CHARS) expect(GLYPHS[ch], `"${ch}"`).toBeDefined();
    expect(Object.keys(GLYPHS).sort()).toEqual([...NAME_CHARS].sort());
    for (const ch of UNSEEN_GLYPHS) expect(NAME_CHARS.has(ch)).toBe(true);
  });
  it('draws z like 2, x like H, blank as nothing, and the symbols as documented', async () => {
    const { GLYPHS } = await import('../../src/app/profile/uc4Segments.ts');
    expect(GLYPHS.z).toEqual(GLYPHS['2']);
    expect([...GLYPHS.u!].sort().join('')).toBe('bcdef'); // code 1D: the device draws a big U
    expect([...GLYPHS.x!].sort().join('')).toBe('bcefg');
    expect(GLYPHS.o).toEqual(GLYPHS['0']); // the big O, checked on the device (SE17 GLOb)
    expect(GLYPHS[' ']).toEqual([]);
    expect(GLYPHS['=']!.join('')).toBe('dg');
    expect(GLYPHS['-']!.join('')).toBe('g');
    expect(GLYPHS._!.join('')).toBe('d');
  });
});

describe('reset confirmations', () => {
  it('name what is lost', async () => {
    const { resetSetupTexts, resetEncoderGroupTexts, resetFaderButtonGroupTexts } = await import('../../src/app/resetTexts.ts');
    expect(resetSetupTexts(5, 'My setup').title).toContain('SE05');
    expect(resetSetupTexts(5, 'My setup').body.join(' ')).toMatch(/label.*note/);
    expect(resetEncoderGroupTexts(2, 'bass', 'S').body[0]).toContain('bass');
    expect(resetFaderButtonGroupTexts(0, 'S').body[0]).toContain('crossfader');
  });
});

describe('command types', () => {
  it('has a line for every type a field offers, with the DAW names for the relative types', () => {
    for (const area of AREAS) for (const f of FIELDS[area]) if (f.key === 'type' && f.input === 'choice') for (const c of f.choices) expect(COMMAND_TYPES[c], c).toBeTruthy();
    expect(commandTypeLine('CCr1')).toBe("CCr1: relative, 1 = up, 127 = down (Ableton: Relative (2's Comp.))");
    expect(commandTypeLine('CCr2')).toBe('CCr2: relative, 65 = up, 63 = down (Ableton: Relative (Binary Offset))');
    expect(commandTypeLine('CCAh')).toContain('number + 32 = fine');
    expect(commandTypeLine('nope')).toBeNull();
  });
});
