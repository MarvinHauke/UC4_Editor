import { describe, expect, it } from 'vitest';
import { createLiveSession, type ChannelMessage, type LiveContext, type LiveSession } from '../../src/live/index.ts';
import { factorySetup } from '../../src/model/factory.ts';
import type { Uc4Config } from '../../src/model/types.ts';

let t = 0;
const send = (s: LiveSession, message: ChannelMessage, o: { inputId?: string; isUc4?: boolean } = {}) =>
  s.receive({ message, inputId: o.inputId ?? 'uc4', isUc4: o.isUc4 ?? true, at: ++t });
const cc = (n: number, v = 1, channel = 1): ChannelMessage => ({ kind: 'cc', channel, number: n, value: v });

/** SE01 (channel 1) is open, SE02 (channel 2) is another setup. Factory SE01: encoder group g has CC 8·(g+1)…; EG1 8–15, EG2 16–23, EG3 24–31; FG1 faders 32–39, FG2 40–47, FG3 48–55. */
const configuration = (): Uc4Config => ({
  format: 'uc4-config', schemaVersion: 1, device: { profile: 'faderfox-uc4' }, createdAt: '', updatedAt: '',
  setups: [factorySetup(1), factorySetup(2)],
});
const ctx = (o: Partial<LiveContext> = {}): LiveContext => ({ configuration: configuration(), setupId: 'factory-se01', encoderGroup: 0, faderButtonGroup: 0, ...o });
const live = (o: Partial<LiveContext> = {}) => { const s = createLiveSession(); s.setContext(ctx(o)); return s; };

describe('the switch offer', () => {
  it('is made after 3 messages in a row that match only another encoder group', () => {
    const s = live();
    send(s, cc(24)); send(s, cc(25));
    expect(s.offer).toBeNull();
    send(s, cc(26));
    expect(s.offer).toMatchObject({
      target: { setupId: 'factory-se01', encoderGroup: 2, faderButtonGroup: 0 },
      changes: ['encoderGroup'],
      text: 'The UC4 seems to be on encoder group 3 — switch?',
    });
  });

  it('names a fader/button group, and both halves when both are elsewhere', () => {
    const s = live();
    for (const n of [48, 49, 50]) send(s, cc(n)); // FG3
    expect(s.offer).toMatchObject({ target: { encoderGroup: 0, faderButtonGroup: 2 }, changes: ['faderButtonGroup'], text: 'The UC4 seems to be on fader/button group 3 — switch?' });
    const both = live();
    for (const n of [24, 48, 25]) send(both, cc(n));
    expect(both.offer).toMatchObject({ target: { encoderGroup: 2, faderButtonGroup: 2 }, changes: ['encoderGroup', 'faderButtonGroup'], text: 'The UC4 seems to be on encoder group 3 and fader/button group 3 — switch?' });
  });

  it('names another setup, with the groups the messages came from', () => {
    const s = live();
    for (const n of [24, 25, 26]) send(s, cc(n, 1, 2)); // SE02, EG3
    expect(s.offer).toMatchObject({
      target: { setupId: 'factory-se02', slot: 2, encoderGroup: 2, faderButtonGroup: 0 },
      changes: ['setup', 'encoderGroup'],
      text: 'The UC4 seems to be on setup SE02, encoder group 3 — switch?',
    });
  });

  it('counts only messages from the UC4 that match something, and a message of the open groups resets the count', () => {
    const s = live();
    send(s, cc(24)); send(s, cc(25));
    send(s, cc(24), { inputId: 'synth', isUc4: false }); // another device: not evidence
    send(s, cc(99)); // matches nothing: neutral
    expect(s.offer).toBeNull();
    send(s, cc(8)); // Enc1 · EG1, in the open groups
    send(s, cc(26));
    expect(s.offer).toBeNull();
    send(s, cc(27)); send(s, cc(28));
    expect(s.offer).not.toBeNull();
  });

  it('is not made while the evidence disagrees, and follows the last three', () => {
    const s = live();
    send(s, cc(24)); send(s, cc(25)); send(s, cc(16)); // EG3, EG3, EG2
    expect(s.offer).toBeNull();
    send(s, cc(17)); send(s, cc(18)); // EG2 ×3 now
    expect(s.offer?.target.encoderGroup).toBe(1);
  });

  it('a message that matches the open groups takes an open offer away; a changed context too', () => {
    const s = live();
    for (const n of [24, 25, 26]) send(s, cc(n));
    send(s, cc(9));
    expect(s.offer).toBeNull();
    for (const n of [24, 25, 26]) send(s, cc(n));
    expect(s.offer).not.toBeNull();
    s.setContext(ctx({ encoderGroup: 2 }));
    expect(s.offer).toBeNull();
    send(s, cc(24));
    expect(s.offer).toBeNull();
  });

  it('is not made without a context', () => {
    const none = createLiveSession();
    for (const n of [24, 25, 26]) send(none, cc(n));
    expect(none.offer).toBeNull();
  });

  it('accept gives the target once, and the offer is gone', () => {
    const s = live();
    for (const n of [24, 25, 26]) send(s, cc(n));
    const taken = s.acceptOffer();
    expect(taken?.target).toMatchObject({ setupId: 'factory-se01', encoderGroup: 2, faderButtonGroup: 0 });
    expect(s.offer).toBeNull();
    expect(s.acceptOffer()).toBeNull();
  });
});

describe('evidence that could mean several places', () => {
  it('is neutral: factory FG5–FG8 all send CC 104–111, so nothing is offered', () => {
    const s = live();
    for (const n of [104, 105, 106, 107]) send(s, cc(n));
    expect(s.offer).toBeNull();
  });

  it('neither adds nor resets: two clear messages, an ambiguous one, a third clear one still give the offer', () => {
    const s = live();
    send(s, cc(24)); send(s, cc(25)); send(s, cc(104));
    expect(s.offer).toBeNull();
    send(s, cc(26));
    expect(s.offer?.target.encoderGroup).toBe(2);
  });

  it('the same message in two setups is ambiguous, but the user\'s pin settles it', () => {
    const twin = createLiveSession();
    const c = configuration();
    c.setups[1] = { ...structuredClone(c.setups[0]!), id: 'copy', name: 'Copy', slot: undefined };
    twin.setContext({ configuration: c, setupId: 'factory-se01', encoderGroup: 0, faderButtonGroup: 0 });
    for (const n of [24, 25, 26]) send(twin, cc(n)); // SE01 EG3 and the copy's EG3
    expect(twin.offer).toBeNull();
    for (const row of twin.rows) twin.pin(row.key, row.matches[0]!.control.id);
    for (const n of [24, 25, 26]) send(twin, cc(n, 2));
    expect(twin.offer).toMatchObject({ target: { setupId: 'factory-se01', encoderGroup: 2 } });
  });
});

describe('"no" and "don\'t ask again"', () => {
  it('no holds for that target until the open setup changes; another target is still offered', () => {
    const s = live();
    for (const n of [24, 25, 26]) send(s, cc(n));
    s.dismissOffer();
    expect(s.offer).toBeNull();
    for (const n of [27, 28, 29]) send(s, cc(n));
    expect(s.offer).toBeNull();
    for (const n of [16, 17, 18]) send(s, cc(n)); // EG2: another target
    expect(s.offer?.target.encoderGroup).toBe(1);
    s.dismissOffer();
    s.setContext(ctx({ setupId: 'factory-se02' }));
    s.setContext(ctx({ setupId: 'factory-se01' }));
    for (const n of [24, 25, 26]) send(s, cc(n));
    expect(s.offer).not.toBeNull();
  });

  it('a changed group selection in the same setup keeps the "no"', () => {
    const s = live();
    for (const n of [24, 25, 26]) send(s, cc(n));
    s.dismissOffer();
    s.setContext(ctx({ faderButtonGroup: 4 }));
    for (const n of [24, 25, 26]) send(s, cc(n));
    // the target now also has the other half in group 5: a different target, so offered again
    expect(s.offer?.target).toMatchObject({ encoderGroup: 2, faderButtonGroup: 4 });
  });

  it('silencing stops every offer, and is part of the saved state', () => {
    const s = live();
    s.silenceOffers(true);
    for (const n of [24, 25, 26]) send(s, cc(n));
    expect(s.offer).toBeNull();
    expect(s.getState()).toEqual({ splits: [], silenceOffers: true });
    const again = createLiveSession();
    again.restoreState(JSON.parse(JSON.stringify(s.getState())));
    again.setContext(ctx());
    for (const n of [24, 25, 26]) send(again, cc(n));
    expect(again.offer).toBeNull();
    again.silenceOffers(false);
    for (const n of [24, 25, 26]) send(again, cc(n));
    expect(again.offer).not.toBeNull();
  });

  it('silencing takes an open offer away, and Clear keeps the silence', () => {
    const s = live();
    for (const n of [24, 25, 26]) send(s, cc(n));
    s.silenceOffers(true);
    expect(s.offer).toBeNull();
    s.clear();
    expect(s.getState().silenceOffers).toBe(true);
  });

  it('notifies on an offer, a dismissal and an accept; works as detached functions', () => {
    const s = live();
    let n = 0;
    s.subscribe(() => n++);
    const { dismissOffer, acceptOffer, silenceOffers } = s;
    for (const m of [24, 25, 26]) send(s, cc(m));
    const afterOffer = n;
    dismissOffer();
    expect(n).toBe(afterOffer + 1);
    dismissOffer();
    expect(n).toBe(afterOffer + 1);
    expect(acceptOffer()).toBeNull();
    expect(() => silenceOffers(true)).not.toThrow();
  });

  it('restoreState keeps ignoring garbage and a missing silence flag means off', () => {
    const s = createLiveSession();
    s.restoreState({ splits: ['a'], silenceOffers: 'yes' });
    expect(s.getState()).toEqual({ splits: ['a'], silenceOffers: false });
  });
});
