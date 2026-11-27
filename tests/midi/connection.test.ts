import { describe, expect, it } from 'vitest';
import { createDeviceConnection, type ConnectionState } from '../../src/midi/connection.ts';
import { uc4Engine } from '../../src/protocol/engine.ts';
import { faderfoxUc4 } from '../../src/protocol/profiles/uc4.ts';
import { FakeInput, fakeEnv } from './fakeMidi.ts';

const portName = faderfoxUc4.portName;
/** The port logic is tested with a permissive guard (the dumps used are not UC4 dumps); the real guard has its own test in `sending`. */
const permissive = (): { ok: true } => ({ ok: true });
const uc4 = (id = 'in1') => new FakeInput(id, 'Faderfox UC4');

describe('device profile', () => {
  it('names the UC4 port as listed on 2026-11-15', () => expect(portName).toBe('Faderfox UC4'));
});

describe('no Web MIDI / permission', () => {
  it('is unsupported with a message that says which browser to use; files keep working', async () => {
    const { env } = fakeEnv({ supported: false });
    const c = createDeviceConnection({ portName, env, checkSendable: permissive });
    expect(c.state.kind).toBe('unsupported');
    if (c.state.kind === 'unsupported') expect(c.state.message).toMatch(/Chrome|Edge/);
    await c.connect();
    expect(c.state.kind).toBe('unsupported');
  });

  it('is denied when the user refuses, with what to do', async () => {
    const { env } = fakeEnv({ denyWith: 'SecurityError' });
    const c = createDeviceConnection({ portName, env, checkSendable: permissive });
    await c.connect();
    expect(c.state.kind).toBe('denied');
    if (c.state.kind === 'denied') expect(c.state.message).toMatch(/site settings|permission/i);
  });

  it('turns another failure into not-connected with a message, never a throw', async () => {
    const { env } = fakeEnv({ denyWith: 'InvalidStateError' });
    const c = createDeviceConnection({ portName, env, checkSendable: permissive });
    await expect(c.connect()).resolves.toBeUndefined();
    expect(c.state.kind).toBe('not-connected');
  });
});

describe('start and connect', () => {
  it('starts not-connected and asks nothing', () => {
    const { env, calls } = fakeEnv();
    const c = createDeviceConnection({ portName, env, checkSendable: permissive });
    expect(c.state).toMatchObject({ kind: 'not-connected', access: false });
    expect(calls.requests).toBe(0);
  });

  it('connects to the one UC4 port', async () => {
    const { env, access } = fakeEnv();
    access.inputs.set('in1', uc4());
    access.inputs.set('x', new FakeInput('x', 'IAC Driver Bus 1'));
    const c = createDeviceConnection({ portName, env, checkSendable: permissive });
    await c.connect();
    expect(c.state).toEqual({ kind: 'connected', port: { id: 'in1', name: 'Faderfox UC4' } });
  });

  it('asks for access once when connect is called twice', async () => {
    const { env, calls } = fakeEnv();
    const c = createDeviceConnection({ portName, env, checkSendable: permissive });
    await c.connect();
    await c.connect();
    expect(calls.requests).toBe(1);
  });

  it('is not-connected with access when no UC4 port is there, and finds it when plugged in', async () => {
    const { env, access } = fakeEnv();
    const c = createDeviceConnection({ portName, env, checkSendable: permissive });
    await c.connect();
    expect(c.state).toMatchObject({ kind: 'not-connected', access: true });
    access.plug(uc4());
    expect(c.state.kind).toBe('connected');
    access.unplug('in1');
    expect(c.state).toMatchObject({ kind: 'not-connected', access: true });
  });

  it('ignores disconnected ports', async () => {
    const { env, access } = fakeEnv();
    access.inputs.set('in1', new FakeInput('in1', 'Faderfox UC4', 'disconnected'));
    const c = createDeviceConnection({ portName, env, checkSendable: permissive });
    await c.connect();
    expect(c.state.kind).toBe('not-connected');
  });

  it('notifies state subscribers and stops after unsubscribe', async () => {
    const { env, access } = fakeEnv();
    const c = createDeviceConnection({ portName, env, checkSendable: permissive });
    const seen: ConnectionState['kind'][] = [];
    const off = c.subscribe((s) => seen.push(s.kind));
    await c.connect();
    access.plug(uc4());
    off();
    access.unplug('in1');
    expect(seen).toEqual(['not-connected', 'connected']);
  });
});

describe('several matching ports', () => {
  it('asks to choose, then connects to the chosen one', async () => {
    const { env, access } = fakeEnv();
    access.inputs.set('a', new FakeInput('a', 'Faderfox UC4'));
    access.inputs.set('b', new FakeInput('b', 'Faderfox UC4 2'));
    const c = createDeviceConnection({ portName, env, checkSendable: permissive });
    await c.connect();
    expect(c.state).toEqual({ kind: 'choose-port', candidates: [{ id: 'a', name: 'Faderfox UC4' }, { id: 'b', name: 'Faderfox UC4 2' }] });
    c.choosePort('b');
    expect(c.state).toEqual({ kind: 'connected', port: { id: 'b', name: 'Faderfox UC4 2' } });
    c.choosePort('nope');
    expect(c.state.kind).toBe('connected');
  });

  it('falls back to the single port left when the chosen one goes away', async () => {
    const { env, access } = fakeEnv();
    access.inputs.set('a', new FakeInput('a', 'Faderfox UC4'));
    access.inputs.set('b', new FakeInput('b', 'Faderfox UC4 2'));
    const c = createDeviceConnection({ portName, env, checkSendable: permissive });
    await c.connect();
    c.choosePort('b');
    access.unplug('b');
    expect(c.state.kind).toBe('connected'); // only 'a' is left: one candidate
    expect(c.state).toMatchObject({ port: { id: 'a' } });
  });
});

describe('silent reconnect', () => {
  it('connects without a click when the permission is granted', async () => {
    const { env, access, calls } = fakeEnv({ permission: 'granted' });
    access.inputs.set('in1', uc4());
    const c = createDeviceConnection({ portName, env, checkSendable: permissive });
    await c.reconnect();
    expect(c.state.kind).toBe('connected');
    expect(calls.requests).toBe(1);
  });

  it.each(['prompt', 'unsupported'] as const)('asks for nothing when the permission is %s', async (permission) => {
    const { env, calls } = fakeEnv({ permission });
    const c = createDeviceConnection({ portName, env, checkSendable: permissive });
    await c.reconnect();
    expect(c.state).toMatchObject({ kind: 'not-connected', access: false });
    expect(calls.requests).toBe(0);
  });

  it('shows denied when the permission is denied', async () => {
    const { env, calls } = fakeEnv({ permission: 'denied' });
    const c = createDeviceConnection({ portName, env, checkSendable: permissive });
    await c.reconnect();
    expect(c.state.kind).toBe('denied');
    expect(calls.requests).toBe(0);
  });
});

describe('SysEx from the UC4', () => {
  async function setup() {
    const { env, access } = fakeEnv();
    const input = uc4();
    access.inputs.set('in1', input);
    let t = 1000;
    const c = createDeviceConnection({ portName, env, checkSendable: permissive, now: () => t++ });
    // connecting reads the clock once (`connectedAt`), so the first message is stamped 1001
    const got: { bytes: number[]; at: number }[] = [];
    c.onSysex((m) => got.push({ bytes: [...m.bytes], at: m.receivedAt }));
    await c.connect();
    return { c, input, access, got };
  }

  it('hands over a complete message with its arrival time', async () => {
    const { input, got } = await setup();
    input.emit(0xf0, 0x00, 0x01, 0xf7);
    expect(got).toEqual([{ bytes: [0xf0, 0x00, 0x01, 0xf7], at: 1001 }]);
  });

  it('joins a message that arrives in pieces', async () => {
    const { input, got } = await setup();
    input.emit(0xf0, 1, 2);
    input.emit(3, 4);
    expect(got).toHaveLength(0);
    input.emit(5, 0xf7);
    expect(got.map((g) => g.bytes)).toEqual([[0xf0, 1, 2, 3, 4, 5, 0xf7]]);
  });

  it('ignores channel messages and real-time bytes, also inside a message', async () => {
    const { input, got } = await setup();
    input.emit(0x90, 60, 100);
    input.emit(0xb0, 7, 64);
    input.emit(0xf0, 1);
    input.emit(0xf8);
    input.emit(2, 0xf7);
    expect(got.map((g) => g.bytes)).toEqual([[0xf0, 1, 2, 0xf7]]);
  });

  it('drops a message that never ends instead of growing without limit', async () => {
    const { input, got } = await setup();
    input.emit(0xf0);
    for (let i = 0; i < 20; i++) input.emit(...new Array(100000).fill(1));
    input.emit(0xf7);
    expect(got).toHaveLength(0);
  });

  it('drops a message cut off by a new start', async () => {
    const { input, got } = await setup();
    input.emit(0xf0, 1, 2);
    input.emit(0xf0, 9, 0xf7);
    expect(got.map((g) => g.bytes)).toEqual([[0xf0, 9, 0xf7]]);
  });

  it('hears only the UC4 input, and stops after unplug, unsubscribe and dispose', async () => {
    const { c, input, access, got } = await setup();
    const other = new FakeInput('x', 'IAC Driver Bus 1');
    access.plug(other);
    other.emit(0xf0, 1, 0xf7);
    expect(got).toHaveLength(0);
    access.unplug('in1');
    input.emit(0xf0, 1, 0xf7);
    expect(got).toHaveLength(0);
    const again = uc4('in2');
    access.plug(again);
    again.emit(0xf0, 2, 0xf7);
    expect(got).toHaveLength(1);
    c.dispose();
    again.emit(0xf0, 3, 0xf7);
    expect(got).toHaveLength(1);
  });

  it('does not mix up a half message when the port changes', async () => {
    const { input, access, got } = await setup();
    input.emit(0xf0, 1);
    access.unplug('in1');
    const again = uc4('in2');
    access.plug(again);
    again.emit(2, 0xf7); // no start byte: nothing to join
    expect(got).toHaveLength(0);
  });
});

describe('sending', () => {
  const dump = Uint8Array.from([0xf0, 0x00, 0x01, 0x02, 0xf7]);
  async function connected(opts: { now?: () => number; checkSendable?: () => { ok: true } } = {}) {
    const f = fakeEnv();
    f.access.inputs.set('in1', uc4());
    const c = createDeviceConnection({ portName, env: f.env, checkSendable: permissive, ...opts });
    await c.connect();
    return { ...f, c };
  }

  it('sends nothing on connect, reconnect, plug or incoming data', async () => {
    const f = fakeEnv({ permission: 'granted' });
    f.access.inputs.set('in1', uc4());
    const c = createDeviceConnection({ portName, env: f.env, checkSendable: permissive });
    await c.reconnect();
    await c.connect();
    f.access.unplug('in1');
    f.access.plug(uc4());
    f.access.inputs.get('in1')!.emit(0xf0, 1, 0xf7);
    expect(f.access.sent).toEqual([]);
  });

  it('passes the bytes unchanged to the output', async () => {
    const { c, access } = await connected();
    expect(c.sendDump(dump)).toEqual({ ok: true, bytes: 5 });
    expect(access.sent).toHaveLength(1);
    expect(Array.from(access.sent[0]!)).toEqual(Array.from(dump));
  });

  it('sends several complete messages in one call', async () => {
    const { c, access } = await connected();
    const two = Uint8Array.from([0xf0, 1, 0xf7, 0xf0, 2, 0xf7]);
    expect(c.sendDump(two).ok).toBe(true);
    expect(Array.from(access.sent[0]!)).toEqual(Array.from(two));
  });

  it('refuses when not connected', async () => {
    const f = fakeEnv();
    const c = createDeviceConnection({ portName, env: f.env, checkSendable: permissive });
    expect(c.sendDump(dump)).toMatchObject({ ok: false, reason: 'not-connected' });
    await c.connect(); // access, but no port
    expect(c.sendDump(dump)).toMatchObject({ ok: false, reason: 'not-connected' });
    expect(f.access.sent).toEqual([]);
  });

  it('refuses after the device is unplugged', async () => {
    const { c, access } = await connected();
    access.unplug('in1');
    expect(c.sendDump(dump)).toMatchObject({ ok: false, reason: 'not-connected' });
    expect(access.sent).toEqual([]);
  });

  it('refuses when there is no output port', async () => {
    const { c, access } = await connected();
    access.outputs.clear();
    expect(c.sendDump(dump)).toMatchObject({ ok: false, reason: 'no-output' });
    access.outputs.set('o', { id: 'o', name: 'Other synth', state: 'connected', send: (d) => { access.sent.push(d); } });
    expect(c.sendDump(dump)).toMatchObject({ ok: false, reason: 'no-output' });
    expect(access.sent).toEqual([]);
  });

  it('refuses bytes that are not complete SysEx messages', async () => {
    const { c, access } = await connected();
    const bad = [
      [], [0xf0], [0xf7], [0xf0, 1, 2], [1, 2, 0xf7], [0xf0, 1, 0xf7, 5], [0xf0, 0xf0, 1, 0xf7], [0xf0, 0x90, 1, 0xf7], [0xf0, 1, 0xf7, 0xf7],
    ];
    for (const b of bad) expect(c.sendDump(Uint8Array.from(b))).toMatchObject({ ok: false, reason: 'invalid-bytes' });
    expect(access.sent).toEqual([]);
  });

  it('runs the area guard before it sends: a refusal sends nothing', async () => {
    const f = fakeEnv();
    f.access.inputs.set('in1', uc4());
    const c = createDeviceConnection({ portName, env: f.env, checkSendable: uc4Engine.checkSendable }); // the UC4 engine's guard
    await c.connect();
    const r = c.sendDump(dump);
    expect(r).toMatchObject({ ok: false, reason: 'refused' });
    expect(f.access.sent).toEqual([]);
  });

  it('turns a failing send into a result', async () => {
    const { c, access } = await connected();
    access.outputs.get('out1')!.send = () => { const e = new Error('x'); e.name = 'InvalidStateError'; throw e; };
    expect(c.sendDump(dump)).toMatchObject({ ok: false, reason: 'send-failed' });
  });

  it('prefers the output named like the connected input when several match', async () => {
    const { c, access } = await connected();
    const other: Uint8Array[] = [];
    access.outputs.set('out2', { id: 'out2', name: 'Faderfox UC4 2', state: 'connected', send: (d) => { other.push(d); } });
    expect(c.sendDump(dump).ok).toBe(true);
    expect(access.sent).toHaveLength(1);
    expect(other).toEqual([]);
  });

  it('exposes when the connection was made; a re-plug starts a new one', async () => {
    let t = 1000;
    const { c, access } = await connected({ now: () => t });
    expect(c.connectedAt).toBe(1000);
    t = 2000;
    access.plug(access.inputs.get('in1')!); // a state change without change
    expect(c.connectedAt).toBe(1000);
    access.unplug('in1');
    expect(c.connectedAt).toBeNull();
    t = 3000;
    access.plug(uc4());
    expect(c.connectedAt).toBe(3000);
  });

  it('gives a new connectedAt when another port is chosen, and none after dispose', async () => {
    let t = 1000;
    const f = fakeEnv();
    f.access.inputs.set('in1', uc4('in1'));
    f.access.inputs.set('in2', uc4('in2'));
    const c = createDeviceConnection({ portName, env: f.env, checkSendable: permissive, now: () => t });
    await c.connect();
    expect(c.state.kind).toBe('choose-port');
    t = 2000;
    c.choosePort('in1');
    expect(c.connectedAt).toBe(2000);
    c.dispose();
    expect(c.connectedAt).toBeNull();
  });

  it('has no connectedAt before connecting', () => {
    const c = createDeviceConnection({ portName, env: fakeEnv().env, checkSendable: permissive });
    expect(c.connectedAt).toBeNull();
  });
});
