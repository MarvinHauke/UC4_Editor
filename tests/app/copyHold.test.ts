import { describe, expect, it, vi } from 'vitest';
import { createCopyHold } from '../../src/app/copyHold.svelte.ts';

const clipOf = (from: object) => ({ kind: (from as { kind: string }).kind, from, sourceName: 'x' });

function fake() {
  const state = { configuration: {} as object, selection: { setupId: 's1', encoderGroup: 2, faderButtonGroup: 0, control: { area: 'encoders', index: 3 } } };
  const store = {
    state, say: vi.fn(),
    copy: vi.fn((from: object) => ({ clip: clipOf(from) })),
    pasteSetup: vi.fn(() => { state.configuration = {}; }), pasteEncoderGroup: vi.fn(() => { state.configuration = {}; }), pasteFaderButtonGroup: vi.fn(() => { state.configuration = {}; }), pasteControl: vi.fn(() => { state.configuration = {}; }),
  };
  const hold = createCopyHold(() => store as never, () => 'encoder');
  return { store, state, hold };
}

describe('copy hold: a snapshot at Copy', () => {
  it('takes the Clip when Copy is pressed and pastes that Clip, later, onto another setup', () => {
    const { store, state, hold } = fake();
    hold.copy('group');
    expect(store.copy).toHaveBeenCalledWith({ kind: 'encoderGroup', setupId: 's1', group: 2 });
    expect(hold.held).toMatchObject({ kind: 'encoderGroup', group: 2 });
    state.selection.setupId = 's2';
    hold.pasteGroupOnto(5);
    expect(store.copy).toHaveBeenCalledTimes(1); // no second snapshot at paste time
    expect(store.pasteEncoderGroup).toHaveBeenCalledWith(expect.objectContaining({ kind: 'encoderGroup' }), { setupId: 's2', group: 5 });
  });
  it('pastes a control onto the shown group of the selected setup', () => {
    const { store, hold } = fake();
    hold.copy('control');
    hold.pasteControlOnto('encoders', 6);
    expect(store.pasteControl).toHaveBeenCalledWith(expect.objectContaining({ kind: 'control' }), { setupId: 's1', area: 'encoders', group: 2, index: 6 });
  });
  it('a setup row icon with nothing held snapshots the selected setup first', () => {
    const { store, hold } = fake();
    hold.pasteSetupOnto('s9');
    expect(store.copy).toHaveBeenCalledWith({ kind: 'setup', setupId: 's1' });
    expect(store.pasteSetup).toHaveBeenCalledWith(expect.objectContaining({ kind: 'setup' }), 's9');
    expect(hold.held).toBeNull(); // nothing stays held from a fast paste
  });
  it('holds nothing when the library refuses the first copy, and keeps an earlier copy when a later one is refused', () => {
    const { store, hold } = fake();
    store.copy.mockReturnValueOnce({} as never);
    hold.copy('setup');
    expect(hold.held).toBeNull();
    hold.copy('group');
    store.copy.mockReturnValueOnce({} as never);
    hold.copy('setup');
    expect(hold.held).toMatchObject({ kind: 'encoderGroup' });
  });
  it('stop forgets the copy, and a paste says nothing is copied', () => {
    const { store, hold } = fake();
    hold.copy('setup'); hold.stop();
    hold.paste('setup');
    expect(store.say).toHaveBeenCalledWith(expect.stringContaining('Nothing is copied'));
  });
});

describe('copy hold: the visual answer (decision 36)', () => {
  it('Copy names the copied item; a refused copy flashes nothing', () => {
    const { store, hold } = fake();
    hold.copy('group');
    expect(hold.flash).toMatchObject({ kind: 'copy', targets: ['group:encoder:2', 'area:encoder'] });
    const n = hold.flash!.n;
    store.copy.mockReturnValueOnce({} as never);
    hold.copy('setup');
    expect(hold.flash!.n).toBe(n);
  });
  it('a group paste flashes its step, and the device area when that group is on show', () => {
    const { hold } = fake();
    hold.copy('group');
    hold.pasteGroupOnto(5);
    expect(hold.flash).toMatchObject({ kind: 'paste', targets: ['group:encoder:5'] });
    hold.pasteGroupOnto(2);
    expect(hold.flash).toMatchObject({ kind: 'paste', targets: ['group:encoder:2', 'area:encoder'] });
  });
  it('a control paste and a fast setup paste flash their target; a paste that changed nothing does not', () => {
    const { store, hold } = fake();
    hold.copy('control');
    hold.pasteControlOnto('encoders', 6);
    expect(hold.flash).toMatchObject({ kind: 'paste', targets: ['control:encoders:6'] });
    hold.stop();
    hold.pasteSetupOnto('s9');
    expect(hold.flash).toMatchObject({ kind: 'paste', targets: ['setup:s9'] });
    const n = hold.flash!.n;
    store.pasteSetup.mockImplementationOnce(() => {});
    hold.pasteSetupOnto('s8');
    expect(hold.flash!.n).toBe(n);
  });
});
