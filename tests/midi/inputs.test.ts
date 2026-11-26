import { describe, expect, it } from 'vitest';
import { createDeviceConnection } from '../../src/midi/connection.ts';
import { createMidiInputs } from '../../src/midi/inputs.ts';
import type { ChannelEvent } from '../../src/live/messages.ts';
import { faderfoxUc4 } from '../../src/protocol/profiles/uc4.ts';
import { FakeAccess, FakeInput, fakeEnv } from './fakeMidi.ts';

const portName = faderfoxUc4.portName;
const uc4 = (id = 'in1') => new FakeInput(id, 'Faderfox UC4');
const synth = (id = 'in2') => new FakeInput(id, 'IAC Driver Bus 1');

async function started(setup?: (a: FakeAccess) => void, opts: Parameters<typeof fakeEnv>[0] = {}) {
  const { env, access, calls } = fakeEnv(opts);
  setup?.(access);
  const times = [1000, 1001, 1002, 1003, 1004, 1005];
  const inputs = createMidiInputs({ portName, env, now: () => times.shift() ?? 9999 });
  const events: ChannelEvent[] = [];
  inputs.onMessage((e) => events.push(e));
  await inputs.connect();
  return { inputs, access, events, calls };
}

describe('the input list', () => {
  it('lists every connected input with its name and whether it is the UC4', async () => {
    const { inputs } = await started((a) => { a.inputs.set('in1', uc4()); a.inputs.set('in2', synth()); a.inputs.set('in3', new FakeInput('in3', 'Old', 'disconnected')); });
    expect(inputs.inputs).toEqual([
      { id: 'in1', name: 'Faderfox UC4', isUc4: true },
      { id: 'in2', name: 'IAC Driver Bus 1', isUc4: false },
    ]);
  });

  it('follows plug and unplug and tells the subscribers', async () => {
    const { inputs, access } = await started();
    let changes = 0;
    inputs.subscribe(() => changes++);
    expect(inputs.status.kind).toBe('no-inputs');
    access.plug(uc4());
    expect(inputs.inputs.map((i) => i.id)).toEqual(['in1']);
    expect(inputs.status.kind).toBe('listening');
    access.unplug('in1');
    expect(inputs.inputs).toEqual([]);
    expect(inputs.status.kind).toBe('no-inputs');
    expect(changes).toBe(3 - 1); // plug and unplug; the first status was set before the subscription
  });
});

describe('messages', () => {
  it('delivers channel messages from all inputs with input id, UC4 flag and time', async () => {
    const a = uc4(); const b = synth();
    const { events } = await started((x) => { x.inputs.set('in1', a); x.inputs.set('in2', b); });
    a.emit(0xb7, 8, 100); // CC 8 ch 8
    b.emit(0x90, 60, 127);
    expect(events).toEqual([
      { message: { kind: 'cc', channel: 8, number: 8, value: 100 }, inputId: 'in1', isUc4: true, at: 1000 },
      { message: { kind: 'note', channel: 1, number: 60, value: 127, on: true }, inputId: 'in2', isUc4: false, at: 1001 },
    ]);
  });

  it('reads every kind: note-off, poly and channel aftertouch, program change, pitch bend (14 bit)', async () => {
    const a = uc4();
    const { events } = await started((x) => x.inputs.set('in1', a));
    a.emit(0x80, 64, 0); a.emit(0xa1, 60, 30); a.emit(0xd2, 55); a.emit(0xc3, 9); a.emit(0xef, 0x00, 0x40);
    expect(events.map((e) => e.message)).toEqual([
      { kind: 'note', channel: 1, number: 64, value: 0, on: false },
      { kind: 'polyAftertouch', channel: 2, number: 60, value: 30 },
      { kind: 'aftertouch', channel: 3, number: null, value: 55 },
      { kind: 'program', channel: 4, number: 9, value: 0 },
      { kind: 'pitchBend', channel: 16, number: null, value: 8192 },
    ]);
  });

  it('treats note-on with velocity 0 as off, and honours running status', async () => {
    const a = uc4();
    const { events } = await started((x) => x.inputs.set('in1', a));
    a.emit(0x90, 60, 0, 61, 100);
    expect(events.map((e) => e.message)).toEqual([
      { kind: 'note', channel: 1, number: 60, value: 0, on: false },
      { kind: 'note', channel: 1, number: 61, value: 100, on: true },
    ]);
  });

  it('listens to the chosen input only, and picks "all" again', async () => {
    const a = uc4(); const b = synth();
    const { inputs, events } = await started((x) => { x.inputs.set('in1', a); x.inputs.set('in2', b); });
    inputs.select('in2');
    a.emit(0xb0, 1, 1); b.emit(0xb0, 2, 2);
    expect(events.map((e) => e.inputId)).toEqual(['in2']);
    expect(a.listenerCount).toBe(0);
    inputs.select('all');
    a.emit(0xb0, 3, 3);
    expect(events.map((e) => e.inputId)).toEqual(['in2', 'in1']);
  });

  it('keeps a chosen input that is unplugged, says so, and resumes when it comes back', async () => {
    const b = synth();
    const { inputs, access, events } = await started((x) => { x.inputs.set('in1', uc4()); x.inputs.set('in2', b); });
    inputs.select('in2');
    access.unplug('in2');
    expect(inputs.status.kind).toBe('input-missing');
    expect(inputs.selection).toBe('in2');
    access.plug(b);
    expect(inputs.status.kind).toBe('listening');
    b.emit(0xb0, 1, 1);
    expect(events).toHaveLength(1);
  });

  it('does not attach twice to one input across state changes', async () => {
    const a = uc4();
    const { access } = await started((x) => x.inputs.set('in1', a));
    access.plug(synth());
    access.plug(synth('in3'));
    expect(a.listenerCount).toBe(1);
    expect(a.opened).toBe(1);
  });

  it('survives a message with no data and an unplugged input going quiet', async () => {
    const a = uc4();
    const { access, events } = await started((x) => x.inputs.set('in1', a));
    a.emitData(null);
    access.unplug('in1');
    a.emit(0xb0, 1, 1);
    expect(events).toEqual([]);
  });
});

describe('real-time and system messages', () => {
  it('drops clock and active sensing, counts them, notifies once per kind, and keeps a message intact around them', async () => {
    const a = uc4();
    const { inputs, events } = await started((x) => x.inputs.set('in1', a));
    let changes = 0;
    inputs.subscribe(() => changes++);
    a.emit(0xf8); a.emit(0xf8); a.emit(0xfe); a.emit(0xfa); a.emit(0xfb); a.emit(0xfc);
    a.emit(0xb0, 8, 0xf8, 77); // a clock byte inside a CC message
    expect(events.map((e) => e.message)).toEqual([{ kind: 'cc', channel: 1, number: 8, value: 77 }]);
    expect(inputs.ignored).toEqual({ clock: 3, activeSensing: 1, other: 3 });
    expect(changes).toBe(3);
    inputs.resetIgnored();
    expect(inputs.ignored).toEqual({ clock: 0, activeSensing: 0, other: 0 });
    expect(changes).toBe(4); // the reset tells the UI, so "MIDI clock ignored" goes away
    inputs.resetIgnored();
    expect(changes).toBe(4);
  });

  it('drops system-common messages (song position) and their data bytes', async () => {
    const a = uc4();
    const { inputs, events } = await started((x) => x.inputs.set('in1', a));
    a.emit(0xf2, 5, 6);
    a.emit(0xb0, 1, 2);
    expect(events).toHaveLength(1);
    expect(inputs.ignored.other).toBe(1);
  });
});

describe('SysEx', () => {
  it('stays off the monitor and on the dump path, with both listening to the same input', async () => {
    const a = uc4();
    const { env, access } = fakeEnv();
    access.inputs.set('in1', a);
    const conn = createDeviceConnection({ portName, env, checkSendable: () => ({ ok: true }) });
    const inputs = createMidiInputs({ portName, env });
    const events: ChannelEvent[] = [];
    inputs.onMessage((e) => events.push(e));
    const dumps: number[][] = [];
    conn.onSysex((m) => dumps.push([...m.bytes]));
    await conn.connect();
    await inputs.connect();
    a.emit(0xf0, 0x00, 0x20, 0x6d, 0x01, 0xf7);
    a.emit(0xb0, 1, 2);
    a.emitData(Uint8Array.from([0xf0, 1, 2]));
    a.emitData(Uint8Array.from([3, 0xf7, 0xb0, 4, 5]));
    expect(dumps).toEqual([[0xf0, 0x00, 0x20, 0x6d, 0x01, 0xf7], [0xf0, 1, 2, 3, 0xf7]]);
    expect(events.map((e) => e.message.number)).toEqual([1, 4]);
  });
});

describe('access, permission and listening only', () => {
  it('is unsupported with a message, and asks for nothing on creation', async () => {
    const { env, calls } = fakeEnv({ supported: false });
    const i = createMidiInputs({ portName, env });
    expect(i.status.kind).toBe('unsupported');
    await i.connect();
    expect(i.status.kind).toBe('unsupported');
    expect(calls.requests).toBe(0);
  });

  it('is denied with what to do, and any other failure becomes a message, never a throw', async () => {
    const d = createMidiInputs({ portName, env: fakeEnv({ denyWith: 'SecurityError' }).env });
    await d.connect();
    expect(d.status.kind).toBe('denied');
    const o = createMidiInputs({ portName, env: fakeEnv({ denyWith: 'InvalidStateError' }).env });
    await expect(o.connect()).resolves.toBeUndefined();
    expect(o.status.kind).toBe('not-started');
  });

  it('reconnect starts only with a granted permission and never prompts otherwise', async () => {
    const granted = fakeEnv({ permission: 'granted' });
    const g = createMidiInputs({ portName, env: granted.env });
    await g.reconnect();
    expect(granted.calls.requests).toBe(1);
    const prompt = fakeEnv({ permission: 'prompt' });
    const p = createMidiInputs({ portName, env: prompt.env });
    await p.reconnect();
    expect(prompt.calls.requests).toBe(0);
    expect(p.status.kind).toBe('not-started');
    const denied = createMidiInputs({ portName, env: fakeEnv({ permission: 'denied' }).env });
    await denied.reconnect();
    expect(denied.status.kind).toBe('denied');
  });

  it('asks the browser once when connect and reconnect overlap', async () => {
    const { env, calls } = fakeEnv({ permission: 'granted' });
    const i = createMidiInputs({ portName, env });
    await Promise.all([i.reconnect(), i.connect(), i.connect()]);
    expect(calls.requests).toBe(1);
  });

  it('sends nothing, ever', async () => {
    const a = uc4();
    const { inputs, access } = await started((x) => x.inputs.set('in1', a));
    a.emit(0xb0, 1, 2); a.emit(0xf8);
    inputs.select('in1'); inputs.select('all');
    access.plug(synth());
    expect(access.sent).toEqual([]);
  });

  it('dispose stops listening', async () => {
    const a = uc4();
    const { inputs, events } = await started((x) => x.inputs.set('in1', a));
    inputs.dispose();
    a.emit(0xb0, 1, 2);
    expect(events).toEqual([]);
    expect(a.listenerCount).toBe(0);
  });
});
