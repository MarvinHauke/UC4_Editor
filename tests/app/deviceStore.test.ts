import { describe, expect, it } from 'vitest';
import { chipText, createDevice } from '../../src/app/deviceStore.svelte.ts';
import { createDeviceConnection } from '../../src/midi/connection.ts';
import { FakeInput, fakeEnv } from '../midi/fakeMidi.ts';

describe('chipText', () => {
  it('says connected or not connected, one word per state', () => {
    expect(chipText('UC4', { kind: 'connected', port: { id: '1', name: 'Faderfox UC4' } })).toBe('UC4: connected');
    expect(chipText('UC4', { kind: 'denied', message: 'x' })).toBe('UC4: not connected');
    expect(chipText('UC4', { kind: 'unsupported', message: 'x' })).toBe('UC4: not connected');
    expect(chipText('UC4', { kind: 'choose-port', candidates: [] })).toBe('UC4: not connected');
  });
});

describe('createDevice', () => {
  it('follows the connection: connect, plug, unplug', async () => {
    const { env, access } = fakeEnv();
    const device = createDevice(createDeviceConnection({ portName: 'Faderfox UC4', deviceName: 'UC4', env, checkSendable: () => ({ ok: true }) }));
    expect(device.state.kind).toBe('not-connected');
    await device.connect();
    expect(device.state.kind).toBe('not-connected'); // access given, no port yet
    access.plug(new FakeInput('in1', 'Faderfox UC4'));
    expect(device.connected).toBe(true);
    access.unplug('in1');
    expect(device.connected).toBe(false);
    device.dispose();
  });
  it('does not prompt on reconnect without a stored permission', async () => {
    const { env, calls } = fakeEnv({ permission: 'prompt' });
    const device = createDevice(createDeviceConnection({ portName: 'Faderfox UC4', env, checkSendable: () => ({ ok: true }) }));
    await device.reconnect();
    expect(calls.requests).toBe(0);
    device.dispose();
  });
});
