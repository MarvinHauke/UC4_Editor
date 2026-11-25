// Run: npm test. Only the schema module's public interface (plan 0002, test seam).
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { factorySetup, load, save, validate, FORMAT, SCHEMA_VERSION } from '../../src/model/index.ts';
import type { Uc4Config } from '../../src/model/index.ts';

const config = (slots: number[]): Uc4Config => ({
  format: FORMAT, schemaVersion: SCHEMA_VERSION, device: { profile: 'faderfox-uc4' },
  createdAt: '2026-11-13T10:00:00Z', updatedAt: '2026-11-13T10:00:00Z', setups: slots.map(factorySetup),
});
const clone = (c: Uc4Config): Uc4Config => JSON.parse(JSON.stringify(c)) as Uc4Config;

// --- factory table (docs/reference/uc4-device.md) ---
const encoderBase = [8, 16, 24, 32, 72, 80, 88, 96];
const pushBase = [0, 8, 16, 24, 32, 40, 48, 56];
const buttonBase = [64, 72, 80, 88, 96, 104, 112, 120];
const faderBase = [32, 40, 48, 56, 104, 104, 104, 104];

for (let slot = 1; slot <= 16; slot++) {
  test(`SE${String(slot).padStart(2, '0')} factory setup matches every row of the reference table`, () => {
    const s = factorySetup(slot);
    assert.equal(s.slot, slot);
    assert.equal(s.encoderGroups.length, 8);
    assert.equal(s.faderButtonGroups.length, 8);
    for (let g = 0; g < 8; g++) {
      const eg = s.encoderGroups[g]!;
      assert.equal(eg.name, `grp${g + 1}`);
      eg.encoders.forEach((e, i) => {
        assert.deepEqual(e, { display: 'Std', type: 'CCAb', mode: 'Acc3', channel: slot, number: encoderBase[g]! + i, lower: 0, upper: 127 });
      });
      eg.pushButtons.forEach((p, i) => {
        assert.deepEqual(p, { type: 'notE', mode: 'btn', channel: slot, number: pushBase[g]! + i, lower: 0, upper: 127 });
      });
      const fg = s.faderButtonGroups[g]!;
      assert.equal(fg.faders.length, 9);
      fg.faders.forEach((f, i) => {
        assert.deepEqual(f, { display: 'Std', type: 'CCAb', mode: 'JMP', channel: slot, number: i === 8 ? 112 : faderBase[g]! + i, lower: 0, upper: 127 });
      });
      fg.buttons.forEach((b, i) => {
        assert.deepEqual(b, { display: 'Std', type: 'notE', mode: 'btn', channel: slot, number: buttonBase[g]! + i, lower: 0, upper: 127 });
      });
    }
    assert.deepEqual(validate(config([slot])), []);
  });
}

// --- load refusals ---
const refusals: [string, string, RegExp][] = [
  ['text that is not JSON', 'not json {', /not valid JSON/],
  ['JSON that is not a configuration', '[1,2]', /not a uc4-config/],
  ['another format', JSON.stringify({ format: 'other', schemaVersion: 1 }), /not a uc4-config/],
  ['a newer schema version', JSON.stringify({ format: FORMAT, schemaVersion: SCHEMA_VERSION + 1 }), /version 2/],
  ['a schemaVersion that is no integer', JSON.stringify({ format: FORMAT, schemaVersion: '1' }), /schemaVersion/],
  ['a file whose setups are no list', JSON.stringify({ format: FORMAT, schemaVersion: 1, setups: 5 }), /list of setups/],
];
for (const [situation, text, reason] of refusals) {
  test(`a file with ${situation} is refused with what to do`, () => {
    const r = load(text);
    assert.equal(r.status, 'refused');
    if (r.status === 'refused') {
      assert.match(r.reason, reason);
      assert.ok(r.whatToDo.length > 0);
    }
  });
}

test('a file whose setups, groups or controls are not objects and lists is refused', () => {
  const broken = [
    { setups: [null] },
    { setups: [{ encoderGroups: [null] }] },
    { setups: [{ encoderGroups: [], faderButtonGroups: [{ faders: 'x', buttons: [] }] }] },
  ];
  for (const b of broken) {
    const r = load(JSON.stringify({ format: FORMAT, schemaVersion: 1, ...b }));
    assert.equal(r.status, 'refused');
  }
});

// Every character the device can show is accepted in a group name (`=` is the symbol bottom + middle, code 25).
test('every allowed group-name character is accepted', () => {
  for (const ch of [...'0123456789abcdefghijlmnopqrstuxyz-_\'"= ']) {
    const c = config([1]);
    c.setups[0]!.encoderGroups[0]!.name = `a${ch}bc`;
    assert.deepEqual(validate(c), [], `character "${ch}"`);
  }
});
test('18 setups, a 3-character name with a trailing blank and four blanks are accepted', () => {
  const c = config([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]);
  c.setups[0]!.encoderGroups[0]!.name = 'rac ';
  c.setups[1]!.encoderGroups[0]!.name = '    ';
  assert.deepEqual(validate(c), []);
});
test('a name that repeats a bad character reports it once', () => {
  const c = config([1]);
  c.setups[0]!.encoderGroups[0]!.name = 'kkkk';
  assert.equal(validate(c).length, 1);
});
test('a fader of type CCAh has one problem, the type', () => {
  const c = config([1]);
  const f = c.setups[0]!.faderButtonGroups[0]!.faders[0]! as { type: string; number: number };
  f.type = 'CCAh'; f.number = 100;
  assert.deepEqual(validate(c).map((p) => p.path), ['setups[0].faderButtonGroups[0].faders[0].type']);
});
test('a CCAh number up to 31 is fine and a push button with number 100 is fine', () => {
  const c = config([1]);
  const e = c.setups[0]!.encoderGroups[0]!.encoders[0]!;
  e.type = 'CCAh'; e.number = 31;
  assert.deepEqual(validate(c), []);
  c.setups[0]!.encoderGroups[0]!.pushButtons[0]!.number = 100;
  assert.deepEqual(validate(c), []);
});
test('the problem for a bad group name says why', () => {
  const c = config([1]);
  c.setups[0]!.encoderGroups[0]!.name = 'kicV';
  assert.deepEqual(validate(c).map((p) => p.message), ['"k" cannot be shown on the UC4: the UC4 has no "k"', '"V" cannot be shown on the UC4: the UC4 shows "v" as "u"; write "u"']);
});
test('an upper case letter the device has in lower case is told to be lower case', () => {
  const c = config([1]);
  c.setups[0]!.encoderGroups[0]!.name = 'snaR';
  assert.deepEqual(validate(c).map((p) => p.message), ['"R" must be lower case ("r")']);
});
test('a file with several problems lists each at its own path', () => {
  const c = config([1]);
  c.setups[0]!.encoderGroups[0]!.encoders[0]!.channel = 0;
  c.setups[0]!.encoderGroups[7]!.pushButtons[7]!.number = -1;
  assert.deepEqual(validate(c).map((p) => p.path), ['setups[0].encoderGroups[0].encoders[0].channel', 'setups[0].encoderGroups[7].pushButtons[7].number']);
});

// --- refusals for wrong shape (the user decided: wrong list lengths are refused, 2026-11-13) ---
const lengthRefusals: [string, (c: Uc4Config) => void, RegExp][] = [
  ['19 setups', (c) => { c.setups = Array.from({ length: 19 }, () => c.setups[0]!); }, /setups must hold 1 to 18 setups, has 19/],
  ['no setup', (c) => { c.setups = []; }, /setups must hold 1 to 18 setups, has 0/],
  ['7 encoders', (c) => { c.setups[0]!.encoderGroups[1]!.encoders.pop(); }, /setups\[0\]\.encoderGroups\[1\]\.encoders must have exactly 8/],
  ['10 faders', (c) => { c.setups[0]!.faderButtonGroups[0]!.faders.push(c.setups[0]!.faderButtonGroups[0]!.faders[0]!); }, /faders must have exactly 9 entries, has 10/],
  ['7 push buttons', (c) => { c.setups[0]!.encoderGroups[4]!.pushButtons.length = 7; }, /pushButtons must have exactly 8/],
  ['9 green buttons', (c) => { c.setups[0]!.faderButtonGroups[7]!.buttons.push(c.setups[0]!.faderButtonGroups[7]!.buttons[0]!); }, /buttons must have exactly 8/],
  ['7 encoder groups', (c) => { c.setups[0]!.encoderGroups.pop(); }, /encoderGroups must have exactly 8/],
  ['9 fader/button groups', (c) => { c.setups[0]!.faderButtonGroups.push(c.setups[0]!.faderButtonGroups[0]!); }, /faderButtonGroups must have exactly 8/],
  ['faders that are no list', (c) => { (c.setups[0]!.faderButtonGroups[0]! as unknown as Record<string, unknown>).faders = 'x'; }, /faders is not a list/],
];
for (const [situation, edit, reason] of lengthRefusals) {
  test(`a file with ${situation} is refused and says where`, () => {
    const c = clone(config([1]));
    edit(c);
    const r = load(JSON.stringify(c));
    assert.equal(r.status, 'refused');
    if (r.status === 'refused') assert.match(r.reason, reason);
  });
}

// --- save / load ---
test('a saved and reloaded configuration is exactly what was saved, and a resave is identical', () => {
  const c = config([1, 2, 16]);
  c.setups[0]!.notes = 'for the club';
  c.setups[1]!.encoderGroups[2]!.label = 'Mix';
  c.setups[2]!.faderButtonGroups[0]!.faders[3]!.label = 'Cutoff';
  const text = save(c);
  const r = load(text);
  assert.equal(r.status, 'loaded');
  if (r.status !== 'loaded') return;
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.configuration, c);
  assert.equal(save(r.configuration), text);
});

test('save writes stable key order whatever the order of the input', () => {
  const c = config([3]);
  const shuffled = JSON.parse(JSON.stringify(c, ['setups', 'updatedAt', 'createdAt', 'device', 'profile', 'schemaVersion', 'format', 'id', 'name', 'slot', 'faderButtonGroups', 'encoderGroups', 'encoders', 'pushButtons', 'faders', 'buttons', 'upper', 'lower', 'number', 'channel', 'mode', 'type', 'display'])) as Uc4Config;
  assert.equal(save(shuffled), save(c));
});

test('a saved file starts with format and schemaVersion and keeps a control on one line', () => {
  const lines = save(config([1])).split('\n');
  assert.equal(lines[1], '  "format": "uc4-config",');
  assert.equal(lines[2], '  "schemaVersion": 1,');
  assert.ok(lines.some((l) => l.includes('{ "display": "Std", "type": "CCAb", "mode": "Acc3", "channel": 1, "number": 8')));
});

// --- migration: a file of every older version loads. Schema 1 is the first version, so there is none yet.
test('a file of the current version needs no migration', () => {
  const r = load(save(config([5])));
  assert.equal(r.status, 'loaded');
});

// --- validation of the shape ---
function problemsOf(edit: (c: Uc4Config) => void): { path: string; message: string }[] {
  const c = clone(config([1, 2]));
  edit(c);
  const r = load(JSON.stringify(c));
  assert.equal(r.status, 'loaded');
  return r.status === 'loaded' ? r.problems : [];
}
const bad: [string, (c: Uc4Config) => void, string][] = [
  ['channel 17', (c) => { c.setups[1]!.encoderGroups[0]!.encoders[3]!.channel = 17; }, 'setups[1].encoderGroups[0].encoders[3].channel'],
  ['number 200', (c) => { c.setups[0]!.faderButtonGroups[2]!.buttons[7]!.number = 200; }, 'setups[0].faderButtonGroups[2].buttons[7].number'],
  ['a fader with CCr1', (c) => { (c.setups[0]!.faderButtonGroups[0]!.faders[0]! as { type: string }).type = 'CCr1'; }, 'setups[0].faderButtonGroups[0].faders[0].type'],
  ['a green button with OFF', (c) => { (c.setups[0]!.faderButtonGroups[0]!.buttons[0]! as { type: string }).type = 'OFF'; }, 'setups[0].faderButtonGroups[0].buttons[0].type'],
  ['a push button with a display', (c) => { (c.setups[0]!.encoderGroups[0]!.pushButtons[0]! as unknown as Record<string, unknown>).display = 'Std'; }, 'setups[0].encoderGroups[0].pushButtons[0].display'],
  ['a 5-character group name', (c) => { c.setups[0]!.encoderGroups[0]!.name = 'snare'; }, 'setups[0].encoderGroups[0].name'],
  ['a group name with k', (c) => { c.setups[0]!.encoderGroups[0]!.name = 'kick'; }, 'setups[0].encoderGroups[0].name'],
  ['a group name with w', (c) => { c.setups[1]!.encoderGroups[7]!.name = 'wow1'; }, 'setups[1].encoderGroups[7].name'],
  ['a group name in upper case', (c) => { c.setups[0]!.encoderGroups[2]!.name = 'grP3'; }, 'setups[0].encoderGroups[2].name'],
  ['a group name with a lone upper case letter', (c) => { c.setups[0]!.encoderGroups[2]!.name = 'snaR'; }, 'setups[0].encoderGroups[2].name'],
  ['a group name with v', (c) => { c.setups[0]!.encoderGroups[2]!.name = 'viol'; }, 'setups[0].encoderGroups[2].name'],
  ['CCAh and number 100', (c) => { const e = c.setups[0]!.encoderGroups[3]!.encoders[2]!; e.type = 'CCAh'; e.number = 100; }, 'setups[0].encoderGroups[3].encoders[2].number'],
  ['two setups with one id', (c) => { c.setups[1]!.id = c.setups[0]!.id; }, 'setups[1].id'],
  ['a createdAt that is no date', (c) => { c.createdAt = 'yesterday'; }, 'createdAt'],
  ['a profile of another device', (c) => { (c.device as { profile: string }).profile = 'ec4'; }, 'device.profile'],
  ['a lower value of 128', (c) => { c.setups[1]!.faderButtonGroups[1]!.faders[8]!.lower = 128; }, 'setups[1].faderButtonGroups[1].faders[8].lower'],
  ['a fractional channel', (c) => { c.setups[0]!.encoderGroups[0]!.pushButtons[0]!.channel = 1.5; }, 'setups[0].encoderGroups[0].pushButtons[0].channel'],
  ['a label that is no text', (c) => { (c.setups[0]!.faderButtonGroups[0]! as unknown as Record<string, unknown>).label = 5; }, 'setups[0].faderButtonGroups[0].label'],
  ['two setups in one slot', (c) => { c.setups[1]!.slot = 1; }, 'setups[1].slot'],
  ['a slot 19', (c) => { c.setups[0]!.slot = 19; }, 'setups[0].slot'],
  ['no createdAt', (c) => { delete (c as unknown as Record<string, unknown>).createdAt; }, 'createdAt'],
  ['an unknown field', (c) => { (c.setups[0]! as unknown as Record<string, unknown>).colour = 'red'; }, 'setups[0].colour'],
];
for (const [situation, edit, path] of bad) {
  test(`a file with ${situation} loads with one problem at ${path}`, () => {
    const problems = problemsOf(edit);
    assert.deepEqual(problems.map((p) => p.path), [path]);
  });
}

test('validate never throws on junk', () => {
  for (const junk of [null, 5, 'x', [], {}, { setups: [null, 3, { encoderGroups: 'x' }] }]) {
    assert.ok(validate(junk).length > 0);
  }
});

// --- SE17/SE18: every row of the reference table's 17/18 columns, plus what the factory SndA adds ---
// `a/b` = channel in SE17 / SE18. Rows the table prints as "—" are `OFF` push buttons.
const abletonEncoderCc = [0, 8, 16, 24, 56, 48, 32, 56];
// SE18 G6 is 13, not 14: a typo in the manual, confirmed by the factory SndA.
const abletonEncoderCh = [[13, 14], [13, 14], [13, 14], [13, 14], [14, 14], [13, 13], [13, 14], [13, 13]];
const abletonButtonNote = [64, 72, 104, 96, 80, 88, 120, 56];
const abletonButtonCh = [[13, 14], [13, 14], [13, 14], [13, 14], [13, 14], [13, 14], [14, 14], [13, 14]];
const abletonNames = ['snd1', 'snd2', 'snd3', 'snd4', 'trac', 'rac ', 'pan ', 'glob'];
// Not in the manual's table; from dumps/2026-11-13-SndA-after-rESA.syx (g, n counted from 1).
const rel = { type: 'CCr1', mode: 'Acc0' };
const encoderExceptions: Record<string, object> = {
  '5.4': rel, '5.5': rel, '8.1': rel, '8.2': rel, '8.4': rel, '8.5': rel,
  '5.6': { display: 'bPoL' }, '5.7': { display: 'bPoL' },
  ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8].map((n) => [`7.${n}`, { display: 'bPoL' }])),
};
const pushExceptions: Record<string, object> = {
  '5.3': { type: 'notE', number: 122, upper: 127 },
  '5.4': { type: 'notE', number: 123, upper: 127 },
  ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8].map((n) => [`7.${n}`, { lower: 64, upper: 64 }])),
  ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8].map((n) => [`8.${n}`, { type: 'notE', number: 119 + n, upper: 127 }])),
};
const group7ButtonNumbers = [123, 122, 127, 126, 124, 125, 120, 121];

for (const slot of [17, 18]) {
  const i = slot - 17;
  test(`SE${slot} factory setup matches the reference table and the factory SndA`, () => {
    const s = factorySetup(slot);
    assert.equal(s.slot, slot);
    assert.deepEqual(validate(config([slot])), []);
    s.encoderGroups.forEach((eg, g) => {
      assert.equal(eg.name, abletonNames[g]);
      const ch = abletonEncoderCh[g]![i]!;
      eg.encoders.forEach((e, n) => {
        const expected = { display: 'Std', type: 'CCAb', mode: 'Acc3', channel: ch, number: abletonEncoderCc[g]! + n, lower: 0, upper: 127, ...encoderExceptions[`${g + 1}.${n + 1}`] };
        assert.deepEqual(e, expected, `encoder g${g + 1}/${n + 1}`);
      });
      eg.pushButtons.forEach((p, n) => {
        // "—": OFF, keeping the number the encoder has, upper 0
        const expected = { type: 'OFF', mode: 'btn', channel: ch, number: abletonEncoderCc[g]! + n, lower: 0, upper: 0, ...pushExceptions[`${g + 1}.${n + 1}`] };
        assert.deepEqual(p, expected, `push g${g + 1}/${n + 1}`);
      });
    });
    s.faderButtonGroups.forEach((fg, g) => {
      fg.buttons.forEach((b, n) => {
        const number = g === 6 ? group7ButtonNumbers[n]! : abletonButtonNote[g]! + n;
        assert.deepEqual(b, { display: 'EXt', type: 'notE', mode: 'btn', channel: abletonButtonCh[g]![i], number, lower: 0, upper: 127 }, `button g${g + 1}/${n + 1}`);
      });
      fg.faders.slice(0, 8).forEach((f, n) => {
        assert.deepEqual(f, { display: 'Std', type: 'CCAb', mode: 'SnAP', channel: slot - 4, number: 40 + n, lower: 0, upper: 127 }, `fader g${g + 1}/${n + 1}`);
      });
      assert.deepEqual(fg.faders[8], { display: 'Std', type: 'CCAb', mode: 'JMP', channel: 14, number: 48, lower: 0, upper: 127 }, `fader 9 g${g + 1}`);
    });
    assert.deepEqual([...group7ButtonNumbers].sort(), [120, 121, 122, 123, 124, 125, 126, 127]);
  });
}

test('SE17 and SE18 differ only in the channels the table prints as 13/14', () => {
  const strip = (x: object): string => JSON.stringify(x, (k, v: unknown) => (k === 'channel' ? undefined : v));
  const a = factorySetup(17), b = factorySetup(18);
  assert.equal(strip({ ...a, id: 0, name: 0, slot: 0 }), strip({ ...b, id: 0, name: 0, slot: 0 }));
});

test('a slot outside 1–18 has no factory setup', () => {
  assert.throws(() => factorySetup(19), RangeError);
  assert.throws(() => factorySetup(0), RangeError);
});
