import { describe, expect, it, vi } from 'vitest';
import { createMapFlow, type MapLive, type MapStore } from '../../src/app/mapFlow.svelte.ts';
import { factorySetup } from '../../src/model/index.ts';
import { controlId, type MapPlan, type TouchTarget } from '../../src/live/index.ts';

const edit = { setupId: 's1', area: 'encoders' as const, group: 0, index: 2, control: { type: 'CCAb' } as never };
const ok = (over: Partial<Extract<MapPlan, { ok: true }>> = {}): MapPlan => ({
  ok: true, edit, resultText: 'Enc3 · EG1 now sends CC 74 ch 2', alsoSentBy: [], focusUpper: false, spotted: null, changed: true, notes: [], ...over,
});

function setup(plan: MapPlan, touch: TouchTarget | null = null, behave: { refuse?: string; nothingChanges?: boolean; moveSelection?: boolean } = {}) {
  const calls: string[] = [];
  let armed: string | null = null;
  const live: MapLive = {
    get armed() { return armed; },
    get touchTarget() { return armed ? touch : null; },
    armMap: (k) => { armed = k; calls.push(`arm ${k}`); },
    disarm: () => { armed = null; calls.push('disarm'); },
    mapPlan: vi.fn(() => plan),
    markMapped: (k, id) => { calls.push(`mapped ${k} ${id}`); },
    nextUnmapped: () => ({ key: 'next' }),
  };
  const configuration = { v: 1 };
  const state = { configuration: configuration as unknown, selection: { setupId: 's1', encoderGroup: 0, faderButtonGroup: 1, control: null as { area: 'encoders'; index: number } | null } };
  const store: MapStore = {
    state,
    setControl: (a, c, sel) => {
      calls.push(`set ${a.area} ${a.group} ${a.index} ${JSON.stringify(sel)}`);
      if (behave.refuse) return { message: behave.refuse };
      if (!behave.nothingChanges) state.configuration = { v: 2 }; // an edit makes a new configuration
      if (behave.moveSelection) state.selection.control = { area: 'encoders', index: 2 };
      return undefined;
    },
    selectControl: () => {},
    undo: () => { calls.push('undo'); },
  };
  const focus = vi.fn();
  const flow = createMapFlow({ live, store: () => store, spotRelative: () => false, focusUpper: focus, ms: 1000 });
  return { flow, calls, live, focus, configuration, state };
}

describe('map by click', () => {
  it('applies the plan as one edit with the control selected, marks the row and the next one', () => {
    const t = setup(ok());
    t.flow.toggle('row1');
    expect(t.flow.armed).toBe('row1');
    expect(t.flow.click('encoders', 2)).toBe(true);
    expect(t.calls).toEqual(['arm row1', 'set encoders 0 2 {"control":{"area":"encoders","index":2}}', `mapped row1 ${controlId('s1', 'encoders', 0, 2)}`, 'disarm']);
    expect(t.flow.result?.text).toBe('Enc3 · EG1 now sends CC 74 ch 2');
    expect(t.flow.nextKey).toBe('next');
  });
  it('uses the group of the control kind: fader/button controls take the fader/button group', () => {
    const t = setup(ok());
    t.flow.toggle('r');
    t.flow.click('faders', 0);
    expect(t.live.mapPlan).toHaveBeenCalledWith('r', controlId('s1', 'faders', 1, 0), { spotRelative: false });
  });
  it('a refusal changes nothing and stays armed', () => {
    const t = setup({ ok: false, reason: 'Faders can’t send notes' });
    t.flow.toggle('r');
    t.flow.click('faders', 0);
    expect(t.calls).toEqual(['arm r']);
    expect(t.flow.armed).toBe('r');
    expect(t.flow.result?.error).toBe(true);
  });
  it('Map again cancels', () => {
    const t = setup(ok());
    t.flow.toggle('r'); t.flow.toggle('r');
    expect(t.calls).toEqual(['arm r', 'disarm']);
  });
  it('asks to focus Upper after a CC onto a button', async () => {
    const t = setup(ok({ focusUpper: true }));
    t.flow.toggle('r'); t.flow.click('buttons', 0);
    await Promise.resolve();
    expect(t.focus).toHaveBeenCalled();
  });
  it('keeps what the plan says about doubles and notes', () => {
    const t = setup(ok({ alsoSentBy: ['Enc3 · EG1'], notes: ['number lowered'] }));
    t.flow.toggle('r'); t.flow.click('encoders', 2);
    expect(t.flow.result?.alsoSentBy).toEqual(['Enc3 · EG1']);
    expect(t.flow.result?.notes).toEqual(['number lowered']);
  });
});

describe('what the library says', () => {
  it('a refusal is shown as an error, claims nothing, marks nothing and stays armed', () => {
    const t = setup(ok(), null, { refuse: 'upper must be a whole number 0–127' });
    t.flow.toggle('r');
    t.flow.click('encoders', 2);
    expect(t.flow.result).toMatchObject({ error: true, undoable: false, text: 'upper must be a whole number 0–127' });
    expect(t.calls.some((c) => c.startsWith('mapped'))).toBe(false);
    expect(t.calls).not.toContain('disarm');
    expect(t.flow.armed).toBe('r');
    t.flow.undo();
    expect(t.calls).not.toContain('undo');
  });
  it('a control that already sends it makes no undo entry: the line says so and offers no Undo', () => {
    const t = setup(ok({ changed: false }), null, { nothingChanges: true });
    t.flow.toggle('r');
    t.flow.click('encoders', 2);
    expect(t.flow.result).toMatchObject({ error: false, undoable: false, text: 'Enc3 · EG1 already sends CC 74 ch 2' });
    t.flow.undo(); // must not undo the user's previous edit
    expect(t.calls).not.toContain('undo');
  });
  it('an edit is undoable', () => {
    const t = setup(ok());
    t.flow.toggle('r'); t.flow.click('encoders', 2);
    expect(t.flow.result).toMatchObject({ undoable: true, text: 'Enc3 · EG1 now sends CC 74 ch 2' });
  });
});

describe('marks that no longer hold', () => {
  const sending = (c: { type: string; channel: number; number: number }) => ({ setups: [{ id: 's1', encoderGroups: [{ encoders: [{}, {}, c] }], faderButtonGroups: [] }] });
  const mapped = { type: 'CCAb', channel: 2, number: 74 };
  it('is taken back when the control no longer sends what the row was mapped to (an undo by another route)', () => {
    const t = setup(ok({ edit: { ...edit, control: mapped as never } }));
    t.flow.toggle('r'); t.flow.click('encoders', 2);
    t.flow.changed(sending(mapped)); // still sends it: the mark stays
    expect(t.calls.filter((c) => c === 'mapped r null')).toHaveLength(0);
    t.flow.changed(sending({ type: 'CCAb', channel: 1, number: 10 })); // undone
    expect(t.calls.filter((c) => c === 'mapped r null')).toHaveLength(1);
    t.flow.changed(sending({ type: 'CCAb', channel: 1, number: 11 }));
    expect(t.calls.filter((c) => c === 'mapped r null')).toHaveLength(1); // only once
  });
  it('counts Upper for a program change: another program no longer matches the row', () => {
    const prog = { type: 'PrGC', channel: 1, number: 64, lower: 0, upper: 5 };
    const t = setup(ok({ edit: { ...edit, control: prog as never } }));
    t.flow.toggle('r'); t.flow.click('encoders', 2);
    t.flow.changed(sending({ ...prog } as never));
    expect(t.calls.some((c) => c === 'mapped r null')).toBe(false);
    t.flow.changed(sending({ ...prog, upper: 9 } as never));
    expect(t.calls.some((c) => c === 'mapped r null')).toBe(true);
  });
  it('stays when only another property of the control changed (Upper after a CC onto a button)', () => {
    const t = setup(ok({ edit: { ...edit, control: mapped as never } }));
    t.flow.toggle('r'); t.flow.click('encoders', 2);
    t.flow.changed(sending({ ...mapped }));
    expect(t.calls.some((c) => c === 'mapped r null')).toBe(false);
  });
});

describe('map by touch', () => {
  const touch: TouchTarget = {
    control: { id: controlId('s2', 'encoders', 2, 0), setupId: 's2', setupName: 'SE05', area: 'encoders', group: 2, index: 0, name: 'Enc1 · EG3' },
    switch: { setupId: 's2', encoderGroup: 2 }, at: 1,
  };
  it('makes the plan before disarming and applies the edit with the group switch in the same call', () => {
    const t = setup(ok(), touch);
    t.flow.toggle('r');
    t.flow.touch();
    expect(t.calls[1]).toBe('set encoders 0 2 {"setupId":"s2","encoderGroup":2,"control":{"area":"encoders","index":0}}');
    expect(t.calls.indexOf('disarm')).toBeGreaterThan(1);
  });
  it('after a refusal Map stays armed and the next touch is handled again', () => {
    const t = setup({ ok: false, reason: 'Faders can’t send notes' }, touch);
    t.flow.toggle('r');
    t.flow.touch();
    expect(t.flow.result?.error).toBe(true);
    expect(t.flow.armed).toBe('r');
    // the session keeps its first touchTarget until the row is armed again: the flow re-arms so the next message counts
    expect(t.calls).toEqual(['arm r', 'arm r']);
    // the next touch maps
    (t.live.mapPlan as ReturnType<typeof vi.fn>).mockReturnValue(ok());
    t.flow.touch();
    expect(t.calls.some((c) => c.startsWith('mapped r'))).toBe(true);
    expect(t.flow.armed).toBeNull();
    expect(t.flow.result?.error).toBe(false);
  });
  it('does nothing while no message has picked a control', () => {
    const t = setup(ok());
    t.flow.toggle('r'); t.flow.touch();
    expect(t.calls).toEqual(['arm r']);
  });
});

describe('the result line', () => {
  it('Undo forgets the mapping and undoes the entry', () => {
    const t = setup(ok());
    t.flow.toggle('r'); t.flow.click('encoders', 2);
    t.flow.undo();
    expect(t.calls.slice(-2)).toEqual(['mapped r null', 'undo']);
    expect(t.flow.result).toBeNull();
    expect(t.flow.nextKey).toBeNull();
  });
  it('goes when the configuration changes by anything else, and after a while', () => {
    vi.useFakeTimers();
    const t = setup(ok());
    t.flow.toggle('r'); t.flow.click('encoders', 2);
    t.flow.changed(t.state.configuration);
    expect(t.flow.result).not.toBeNull();
    t.flow.changed({ edited: true });
    expect(t.flow.result).toBeNull();
    t.flow.toggle('r2'); t.flow.click('encoders', 2);
    vi.advanceTimersByTime(1001);
    expect(t.flow.result).toBeNull();
    vi.useRealTimers();
  });
});

describe('reset to factory', () => {
  const ref = { setupId: 's1', area: 'encoders' as const, group: 0, index: 2, name: 'Enc3 · EG1' };
  const withSetups = (t: ReturnType<typeof setup>) => { t.state.configuration = { setups: [{ ...factorySetup(1), id: 's1' }] }; };

  it('puts the factory control in as one edit, clears the mark and names what it sends', () => {
    const t = setup(ok());
    t.flow.toggle('r'); t.flow.click('encoders', 2);
    withSetups(t); t.calls.length = 0;
    t.flow.resetToFactory('r', ref);
    expect(t.calls).toEqual(['set encoders 0 2 {"setupId":"s1","encoderGroup":0,"control":{"area":"encoders","index":2}}', 'mapped r null']);
    expect(t.flow.result?.text).toBe('Enc3 · EG1 back to factory: CCAb 10 ch1');
  });
  it('Undo from the line puts the control back and the row’s mark with it', () => {
    const t = setup(ok());
    t.flow.toggle('r'); t.flow.click('encoders', 2);
    withSetups(t); t.calls.length = 0;
    t.flow.resetToFactory('r', ref);
    t.flow.undo();
    expect(t.calls.slice(-3)).toEqual(['mapped r null', 'undo', `mapped r ${controlId('s1', 'encoders', 0, 2)}`]);
  });
  it('a control already at factory says so and offers no Undo', () => {
    const t = setup(ok(), null, { nothingChanges: true });
    withSetups(t);
    t.flow.resetToFactory('r', ref);
    expect(t.flow.result?.text).toBe('Enc3 · EG1 is already factory');
    expect(t.flow.result?.undoable).toBe(false);
  });
  it('already factory but the selection moved: says so, and Undo stays for the selection step', () => {
    const t = setup(ok(), null, { nothingChanges: true, moveSelection: true });
    withSetups(t);
    t.flow.resetToFactory('r', ref);
    expect(t.flow.result?.text).toBe('Enc3 · EG1 is already factory');
    expect(t.flow.result?.undoable).toBe(true);
  });
  it('a trimmed row loses its mark and its restore mark, so Undo cannot mark a fresh row', () => {
    const t = setup(ok());
    t.flow.toggle('r'); t.flow.click('encoders', 2);
    withSetups(t);
    t.flow.resetToFactory('r', ref);
    expect(t.flow.result?.restoreMark).toBeDefined();
    t.flow.rowsChanged([{ key: 'other' }]); // 'r' was trimmed
    expect(t.flow.result?.restoreMark).toBeUndefined();
    t.calls.length = 0;
    t.flow.undo();
    expect(t.calls).toEqual(['mapped r null', 'undo']);
  });
  it('a setup without a slot says so and changes nothing', () => {
    const t = setup(ok());
    t.state.configuration = { setups: [{ ...factorySetup(1), id: 's1', slot: undefined }] };
    t.flow.resetToFactory('r', ref);
    expect(t.calls).toEqual([]);
    expect(t.flow.result?.error).toBe(true);
  });
});
