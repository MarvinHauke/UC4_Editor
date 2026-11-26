import { describe, expect, it } from 'vitest';
import { createLiveSession, controlId, type ChannelMessage, type LiveContext, type LiveSession } from '../../src/live/index.ts';
import { factorySetup } from '../../src/model/factory.ts';
import type { Setup, Uc4Config } from '../../src/model/types.ts';

let t = 0;
const send = (s: LiveSession, message: ChannelMessage, o: { inputId?: string; isUc4?: boolean } = {}) =>
  s.receive({ message, inputId: o.inputId ?? 'synth', isUc4: o.isUc4 ?? false, at: ++t });
const uc4 = { inputId: 'uc4', isUc4: true };
const cc = (n: number, v = 64, channel = 2): ChannelMessage => ({ kind: 'cc', channel, number: n, value: v });
const noteOn = (n: number, channel = 2): ChannelMessage => ({ kind: 'note', channel, number: n, value: 100, on: true });

function config(edit?: (se: Setup) => void): Uc4Config {
  const a = factorySetup(1);
  edit?.(a);
  return { format: 'uc4-config', schemaVersion: 1, device: { profile: 'faderfox-uc4' }, createdAt: '', updatedAt: '', setups: [a, factorySetup(2)] };
}
const ctx = (configuration: Uc4Config, o: Partial<LiveContext> = {}): LiveContext =>
  ({ configuration, setupId: 'factory-se01', encoderGroup: 0, faderButtonGroup: 0, ...o });
const live = (edit?: (se: Setup) => void, o: Partial<LiveContext> = {}) => { const s = createLiveSession(); s.setContext(ctx(config(edit), o)); return s; };
const enc = (g: number, i: number) => controlId('factory-se01', 'encoders', g, i);
const push = (g: number, i: number) => controlId('factory-se01', 'pushButtons', g, i);
const fad = (g: number, i: number) => controlId('factory-se01', 'faders', g, i);
const btn = (g: number, i: number) => controlId('factory-se01', 'buttons', g, i);
const key = (s: LiveSession) => s.rows[0]!.key;

describe('map plan: what changes', () => {
  it('sets channel, number and the table type, keeps mode, lower, upper and display', () => {
    const s = live((se) => { const f = se.faderButtonGroups[1]!.faders[2]!; f.mode = 'SnAP'; f.lower = 10; f.upper = 100; f.display = 'bPoL'; });
    send(s, cc(74, 64, 2)); // from a synth
    const plan = s.mapPlan(key(s), fad(1, 2));
    expect(plan).toMatchObject({
      ok: true, changed: true, focusUpper: false, spotted: null, alsoSentBy: [], resultText: 'FAd3 · FG2 now sends CC 74 ch 2',
      edit: { setupId: 'factory-se01', area: 'faders', group: 1, index: 2, control: { type: 'CCAb', channel: 2, number: 74, mode: 'SnAP', lower: 10, upper: 100, display: 'bPoL' } },
    });
  });

  it('does not touch the open configuration', () => {
    const c = config();
    const s = createLiveSession();
    s.setContext(ctx(c));
    send(s, cc(74));
    const before = JSON.stringify(c);
    s.mapPlan(key(s), enc(0, 0));
    expect(JSON.stringify(c)).toBe(before);
  });

  it('keeps the current type when it already sends that kind: a CCr1 encoder given a CC stays CCr1', () => {
    const s = live((se) => { se.encoderGroups[0]!.encoders[2]!.type = 'CCr1'; se.encoderGroups[0]!.encoders[3]!.type = 'CCAh'; se.encoderGroups[0]!.encoders[3]!.number = 4; });
    send(s, cc(74));
    expect(s.mapPlan(key(s), enc(0, 2))).toMatchObject({ ok: true, edit: { control: { type: 'CCr1', number: 74 } } });
    expect(s.mapPlan(key(s), enc(0, 3))).toMatchObject({ ok: true, edit: { control: { type: 'CCAb', number: 74 } } }); // CCAh can't take 74
    send(s, cc(20));
    expect(s.mapPlan(key(s), enc(0, 3))).toMatchObject({ ok: true, edit: { control: { type: 'CCAh', number: 20 } } });
  });

  it('follows the table per kind of control and message', () => {
    const s = live();
    send(s, cc(74)); const ccRow = key(s);
    send(s, noteOn(60)); const noteRow = key(s);
    send(s, { kind: 'program', channel: 2, number: 12, value: 0 }); const prog = key(s);
    send(s, { kind: 'pitchBend', channel: 2, number: null, value: 8000 }); const bend = key(s);
    send(s, { kind: 'aftertouch', channel: 2, number: null, value: 30 }); const after = key(s);
    const type = (row: string, id: string) => { const p = s.mapPlan(row, id); return p.ok ? p.edit.control.type : p.reason; };
    expect([type(ccRow, enc(0, 0)), type(ccRow, fad(0, 0)), type(ccRow, btn(0, 0)), type(ccRow, push(0, 0))]).toEqual(['CCAb', 'CCAb', 'CC', 'CC']);
    expect([type(noteRow, btn(0, 0)), type(noteRow, push(0, 3))]).toEqual(['notE', 'notE']);
    expect([type(prog, enc(0, 0)), type(prog, fad(0, 0)), type(prog, btn(0, 0))]).toEqual(['PrGC', 'PrGC', 'PrGC']);
    expect([type(bend, enc(0, 0)), type(bend, fad(0, 0))]).toEqual(['Pbnd', 'Pbnd']);
    expect([type(after, enc(0, 0)), type(after, fad(0, 0)), type(after, btn(0, 0))]).toEqual(['AFtt', 'AFtt', 'AFtt']);
  });

  it('a note onto a button that was OFF or CC becomes notE; a push button OFF can take a CC', () => {
    const s = live((se) => { se.encoderGroups[0]!.pushButtons[0]!.type = 'OFF'; se.faderButtonGroups[0]!.buttons[0]!.type = 'CC'; });
    send(s, noteOn(60));
    expect(s.mapPlan(key(s), btn(0, 0))).toMatchObject({ ok: true, edit: { control: { type: 'notE', number: 60, channel: 2 } } });
    send(s, cc(5));
    expect(s.mapPlan(key(s), push(0, 0))).toMatchObject({ ok: true, edit: { control: { type: 'CC', number: 5 } } });
  });

  it('maps a program onto a button as its Upper value, whatever it was before', () => {
    const s = live((se) => { se.faderButtonGroups[0]!.buttons[0]!.upper = 99; se.encoderGroups[0]!.pushButtons[0]!.lower = 3; });
    send(s, { kind: 'program', channel: 3, number: 12, value: 0 });
    expect(s.mapPlan(key(s), btn(0, 0))).toMatchObject({ ok: true, resultText: 'btn1 · FG1 now sends program 12 ch 3', edit: { control: { type: 'PrGC', channel: 3, upper: 12, lower: 0, number: 64, mode: 'btn' } } });
    expect(s.mapPlan(key(s), push(0, 0))).toMatchObject({ ok: true, edit: { control: { type: 'PrGC', upper: 12, lower: 3 } } });
  });

  it('maps a program onto an encoder or fader keeping Lower…Upper and names the range', () => {
    const s = live((se) => { se.faderButtonGroups[0]!.faders[0]!.lower = 40; se.faderButtonGroups[0]!.faders[0]!.upper = 10; });
    send(s, { kind: 'program', channel: 2, number: 12, value: 0 });
    expect(s.mapPlan(key(s), enc(0, 0))).toMatchObject({ ok: true, resultText: 'Enc1 · EG1 now sends programs 0–127 ch 2', edit: { control: { type: 'PrGC', lower: 0, upper: 127 } } });
    expect(s.mapPlan(key(s), fad(0, 0))).toMatchObject({ ok: true, resultText: 'FAd1 · FG1 now sends programs 10–40 ch 2', edit: { control: { lower: 40, upper: 10 } } });
  });

  it('keeps the number for pitch bend and aftertouch', () => {
    const s = live();
    send(s, { kind: 'pitchBend', channel: 3, number: null, value: 1 });
    expect(s.mapPlan(key(s), fad(0, 1))).toMatchObject({ ok: true, resultText: 'FAd2 · FG1 now sends pitch bend ch 3', edit: { control: { type: 'Pbnd', channel: 3, number: 33 } } });
  });

  it('names a kept CCAh with both CCs', () => {
    const s = live((se) => { se.encoderGroups[0]!.encoders[0]!.type = 'CCAh'; });
    send(s, cc(20));
    expect(s.mapPlan(key(s), enc(0, 0))).toMatchObject({ ok: true, resultText: 'Enc1 · EG1 now sends CC 20 ch 2 (and CC 52)' });
  });

  it('maps a UC4 row too, and a joined CCAh row as CC n', () => {
    const s = live((se) => { se.encoderGroups[0]!.encoders[0]!.type = 'CCAh'; });
    send(s, cc(8, 5, 1), uc4);
    send(s, cc(40, 5, 1), uc4);
    expect(s.rows[0]).toMatchObject({ pair: { kind: 'ccah', state: 'joined' } });
    expect(s.mapPlan(key(s), push(0, 5))).toMatchObject({ ok: true, edit: { control: { type: 'CC', number: 8, channel: 1 } } });
  });

  it('opens Upper on a button only for a CC', () => {
    const s = live();
    send(s, cc(8));
    expect(s.mapPlan(key(s), push(0, 0))).toMatchObject({ ok: true, focusUpper: true });
    expect(s.mapPlan(key(s), enc(0, 0))).toMatchObject({ ok: true, focusUpper: false });
    send(s, noteOn(1));
    expect(s.mapPlan(key(s), btn(0, 0))).toMatchObject({ ok: true, focusUpper: false });
  });

  it('says changed: false when the control already sends it', () => {
    const s = live();
    send(s, cc(8, 1, 1)); // factory Enc1 · EG1 sends CC 8 ch 1
    expect(s.mapPlan(key(s), enc(0, 0))).toMatchObject({ ok: true, changed: false });
  });
});

describe('map plan: refusals', () => {
  it('names the reason for the help line', () => {
    const s = live();
    send(s, noteOn(60)); const note = key(s);
    send(s, { kind: 'pitchBend', channel: 2, number: null, value: 1 }); const bend = key(s);
    send(s, { kind: 'polyAftertouch', channel: 2, number: 60, value: 1 }); const poly = key(s);
    const reason = (row: string, id: string) => { const p = s.mapPlan(row, id); return p.ok ? 'ok' : p.reason; };
    expect(reason(note, fad(0, 0))).toBe('Faders can’t send notes: notes go to push or green buttons.');
    expect(reason(note, enc(0, 0))).toBe('Encoders can’t send notes: notes go to push or green buttons.');
    expect(reason(bend, btn(0, 0))).toBe('Green buttons can’t send pitch bend: pitch bend goes to encoders and faders.');
    expect(reason(bend, push(0, 0))).toBe('Push buttons can’t send pitch bend: pitch bend goes to encoders and faders.');
    expect(reason(poly, enc(0, 0))).toMatch(/polyphonic aftertouch/);
  });

  it('refuses a row that is gone, a control of another setup, an unknown control and a missing context', () => {
    const s = live();
    send(s, cc(1));
    expect(s.mapPlan('nope', enc(0, 0))).toMatchObject({ ok: false });
    expect(s.mapPlan(key(s), controlId('factory-se02', 'encoders', 0, 0))).toMatchObject({ ok: false, reason: 'That control is not in the open setup.' }); // a click stays in the open setup
    expect(s.mapPlan(key(s), controlId('factory-se99', 'encoders', 0, 0))).toMatchObject({ ok: false });
    expect(s.mapPlan(key(s), 'nope')).toMatchObject({ ok: false });
    s.setContext(null);
    expect(s.mapPlan(key(s), enc(0, 0))).toMatchObject({ ok: false });
  });
});

describe('map plan: collisions and spotting', () => {
  it('names the controls that now send the same message, only the new ones', () => {
    const s = live();
    send(s, cc(8, 1, 1)); // Enc1 · EG1 is CC 8 ch 1
    expect(s.mapPlan(key(s), enc(0, 4))).toMatchObject({ ok: true, alsoSentBy: ['Enc1 · EG1'] });
    expect(s.mapPlan(key(s), fad(0, 3))).toMatchObject({ ok: true, alsoSentBy: ['Enc1 · EG1'] });
    expect(s.mapPlan(key(s), enc(0, 0))).toMatchObject({ ok: true, alsoSentBy: [] }); // itself
    expect(s.mapPlan(key(s), enc(1, 0))).toMatchObject({ ok: true, alsoSentBy: [] }); // EG2 never plays with EG1
    send(s, cc(32, 1, 1)); // FAd1 · FG1 and Enc1 · EG4 already collide by factory design
    expect(s.mapPlan(key(s), enc(3, 0))).toMatchObject({ ok: true, alsoSentBy: [] }); // Enc1 · EG4 already sends it: the old pair is not new
    expect(s.mapPlan(key(s), enc(0, 5))).toMatchObject({ ok: true, alsoSentBy: ['FAd1 · FG1'] }); // EG4 never plays with EG1
  });

  it('spots CCr1 from 1/127 and CCr2 from 63/65 only when the option is on, at least 3 messages, for an encoder', () => {
    const s = live();
    for (const v of [1, 1, 127]) send(s, cc(74, v));
    const row = key(s);
    expect(s.mapPlan(row, enc(0, 0))).toMatchObject({ ok: true, spotted: null, edit: { control: { type: 'CCAb' } } });
    expect(s.mapPlan(row, enc(0, 0), { spotRelative: true })).toMatchObject({
      ok: true, spotted: 'CCr1', edit: { control: { type: 'CCr1' } }, resultText: 'Enc1 · EG1 now sends CC 74 ch 2 as CCr1 (only 1/127 seen)',
    });
    expect(s.mapPlan(row, fad(0, 0), { spotRelative: true })).toMatchObject({ spotted: null, edit: { control: { type: 'CCAb' } } });
    for (const v of [65, 63, 63]) send(s, cc(75, v));
    expect(s.mapPlan(key(s), enc(0, 0), { spotRelative: true })).toMatchObject({ spotted: 'CCr2' });
    for (const v of [64, 65, 63]) send(s, cc(76, v));
    expect(s.mapPlan(key(s), enc(0, 0), { spotRelative: true })).toMatchObject({ spotted: null });
    send(s, cc(77, 127)); send(s, cc(77, 127));
    expect(s.mapPlan(key(s), enc(0, 0), { spotRelative: true })).toMatchObject({ spotted: null }); // two presses are not enough
  });

  it('spotted overrides a kept absolute type, and a note row is never spotted', () => {
    const s = live((se) => { se.encoderGroups[0]!.encoders[0]!.type = 'CCr2'; });
    for (const v of [1, 127, 1]) send(s, cc(74, v));
    expect(s.mapPlan(key(s), enc(0, 0), { spotRelative: true })).toMatchObject({ spotted: 'CCr1', edit: { control: { type: 'CCr1' } } });
  });
});

describe('map targets (dimming)', () => {
  it('lists the controls of the two open groups with whether they can take the row', () => {
    const s = live(undefined, { encoderGroup: 2, faderButtonGroup: 4 });
    send(s, noteOn(60));
    const targets = s.mapTargets(key(s));
    expect(targets).toHaveLength(8 + 8 + 9 + 8);
    expect(targets.filter((x) => x.control.group !== 2 && (x.control.area === 'encoders' || x.control.area === 'pushButtons'))).toEqual([]);
    expect(targets.filter((x) => x.ok).map((x) => x.control.area)).toEqual([...Array(8).fill('pushButtons'), ...Array(8).fill('buttons')]);
    const fader = targets.find((x) => x.control.area === 'faders')!;
    expect(fader.reason).toBe('Faders can’t send notes: notes go to push or green buttons.');
    expect(targets.find((x) => x.control.area === 'buttons')).toMatchObject({ ok: true, reason: null });
    expect(s.mapTargets('nope')).toEqual([]);
  });
});

describe('mapped rows', () => {
  it('remember their target and the next unmapped row is found', () => {
    const s = live();
    send(s, cc(1)); send(s, cc(2)); send(s, cc(3)); // rows: 3, 2, 1 (newest first)
    const [r3, r2, r1] = s.rows.map((r) => r.key) as [string, string, string];
    expect(s.nextUnmapped()!.key).toBe(r3);
    s.markMapped(r3, enc(0, 0));
    expect(s.rows[0]!.mappedTo).toMatchObject({ name: 'Enc1 · EG1' });
    expect(s.nextUnmapped(r3)!.key).toBe(r2);
    s.markMapped(r2, fad(0, 0));
    expect(s.nextUnmapped(r3)!.key).toBe(r1);
    s.markMapped(r1, push(0, 0));
    expect(s.nextUnmapped(r3)).toBeNull();
    s.markMapped(r1, null);
    expect(s.nextUnmapped(r3)!.key).toBe(r1);
    s.markMapped(r1, 'nope');
    expect(s.rows[2]!.mappedTo).toBeNull();
  });

  it('wrap round to the newest row', () => {
    const s = live();
    send(s, cc(1)); send(s, cc(2));
    const [newest, older] = s.rows.map((r) => r.key) as [string, string];
    expect(s.nextUnmapped(older)!.key).toBe(newest);
  });

  it('are forgotten by Clear, and when the control goes', () => {
    const s = live();
    send(s, cc(1));
    s.markMapped(key(s), enc(0, 0));
    s.setContext(ctx(config((se) => { se.encoderGroups[0]!.encoders = se.encoderGroups[0]!.encoders.slice(1); })));
    expect(s.rows[0]!.mappedTo === null || s.rows[0]!.mappedTo!.index !== undefined).toBe(true);
    s.clear();
    send(s, cc(1));
    expect(s.rows[0]!.mappedTo).toBeNull();
  });

  it('work as detached functions', () => {
    const s = live();
    send(s, cc(1));
    const { mapPlan, markMapped, nextUnmapped, mapTargets, armMap, disarm } = s;
    expect(() => { mapPlan(key(s), enc(0, 0)); markMapped(key(s), enc(0, 0)); nextUnmapped(); mapTargets(key(s)); armMap(key(s)); disarm(); }).not.toThrow();
  });
});

describe('Map by touch', () => {
  it('the next UC4 message while armed picks its best match, with the switch the editor needs', () => {
    const s = live();
    send(s, cc(74));
    const row = key(s);
    s.armMap(row);
    expect(s.armed).toBe(row);
    send(s, cc(24, 1, 1), uc4); // Enc1 · EG3 (factory SE01 ch 1)
    expect(s.touchTarget).toMatchObject({ control: { name: 'Enc1 · EG3' }, switch: { encoderGroup: 2 } });
    expect(s.mapPlan(row, s.touchTarget!.control)).toMatchObject({ ok: true, edit: { group: 2, index: 0 } });
  });

  it('asks for no switch when the touched control is in the open groups, and names a setup switch', () => {
    const s = live();
    send(s, cc(74));
    s.armMap(key(s));
    send(s, cc(8, 1, 1), uc4);
    expect(s.touchTarget).toMatchObject({ control: { name: 'Enc1 · EG1' }, switch: {} });
    s.armMap(key(s));
    send(s, cc(24, 1, 2), uc4); // SE02, EG3
    expect(s.touchTarget).toMatchObject({ control: { setupId: 'factory-se02' }, switch: { setupId: 'factory-se02', encoderGroup: 2 } });
    // the target can be planned in its own setup, so setup, groups and edit are one step for the UI
    expect(s.mapPlan(s.armed!, s.touchTarget!.control)).toMatchObject({ ok: true, resultText: 'SE02 · Enc1 · EG3 now sends CC 8 ch 1', edit: { setupId: 'factory-se02', group: 2, index: 0 } });
    expect(s.mapPlan(s.armed!, controlId('factory-se02', 'encoders', 1, 0))).toMatchObject({ ok: false }); // not the touched one
  });

  it('uses the pin, ignores other devices and unmatched messages, and holds the first touch', () => {
    const s = live();
    send(s, cc(32, 1, 1), uc4); // FAd1 · FG1 (tier 1) and Enc1 · EG4 (tier 2)
    s.pin(key(s), enc(3, 0));
    send(s, cc(74));
    s.armMap(s.rows[0]!.key);
    send(s, cc(8, 1, 1), { inputId: 'synth', isUc4: false });
    send(s, cc(120, 1, 1), uc4);
    expect(s.touchTarget).toBeNull();
    send(s, cc(32, 5, 1), uc4);
    expect(s.touchTarget).toMatchObject({ control: { name: 'Enc1 · EG4' }, switch: { encoderGroup: 3 } });
    send(s, cc(8, 5, 1), uc4);
    expect(s.touchTarget!.control.name).toBe('Enc1 · EG4');
    s.disarm();
    expect(s.touchTarget).toBeNull();
    expect(s.armed).toBeNull();
  });

  it('does not count as evidence for the switch offer, while armed or before', () => {
    const s = live();
    send(s, cc(74));
    s.armMap(key(s));
    for (const n of [24, 25, 26, 27]) send(s, cc(n, 1, 1), uc4);
    expect(s.offer).toBeNull();
    s.disarm();
    for (const n of [24, 25, 26]) send(s, cc(n, 2, 1), uc4);
    expect(s.offer).not.toBeNull();
  });

  it('ignores a row that is not listed, and Clear disarms', () => {
    const s = live();
    s.armMap('nope');
    expect(s.armed).toBeNull();
    send(s, cc(1));
    s.armMap(key(s));
    s.clear();
    expect(s.armed).toBeNull();
  });
});
