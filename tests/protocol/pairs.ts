import type { Setup } from '../../src/model/types.ts';
// Shared by the decode and encode tests: the fixture chain of session 1 and the model change each step makes.
export type Prim = string | number;
export function flatten(v: unknown, path: string, out: Map<string, Prim>): void {
  if (Array.isArray(v)) v.forEach((x, i) => flatten(x, `${path}[${i}]`, out));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) flatten(x, path ? `${path}.${k}` : k, out);
  else out.set(path, v as Prim);
}
export function changes(a: Setup, b: Setup): [string, Prim, Prim][] {
  const fa = new Map<string, Prim>(), fb = new Map<string, Prim>();
  flatten(a, '', fa); flatten(b, '', fb);
  const out: [string, Prim, Prim][] = [];
  for (const [k, v] of fb) if (fa.get(k) !== v) out.push([k, fa.get(k)!, v]);
  return out.sort((x, y) => x[0].localeCompare(y[0]));
}
export const enc = (g: number, c: number, p: string): string => `encoderGroups[${g - 1}].encoders[${c - 1}].${p}`;
export const pbt = (g: number, c: number, p: string): string => `encoderGroups[${g - 1}].pushButtons[${c - 1}].${p}`;
export const btn = (g: number, c: number, p: string): string => `faderButtonGroups[${g - 1}].buttons[${c - 1}].${p}`;
export const fad = (g: number, c: number, p: string): string => `faderButtonGroups[${g - 1}].faders[${c - 1}].${p}`;
export const nm = (g: number): string => `encoderGroups[${g - 1}].name`;
export type Change = [string, Prim, Prim];
const E1 = (p: string, a: Prim, b: Prim): Change => [enc(1, 1, p), a, b];

export const pairs: { name: string; prev: string; expect: Change[] }[] = [
  { name: 'enc1-ch01', prev: 'base', expect: [E1('channel', 16, 1)] },
  { name: 'enc1-n009', prev: 'enc1-ch01', expect: [E1('number', 8, 9)] },
  { name: 'enc1-n127', prev: 'enc1-n009', expect: [E1('number', 9, 127)] },
  { name: 'enc1-L001', prev: 'enc1-n127', expect: [E1('lower', 0, 1)] },
  { name: 'enc1-U126', prev: 'enc1-L001', expect: [E1('upper', 127, 126)] },
  { name: 'enc1-CCr1', prev: 'enc1-U126', expect: [E1('type', 'CCAb', 'CCr1'), E1('number', 127, 31)] },
  { name: 'enc1-CCr2', prev: 'enc1-CCr1', expect: [E1('type', 'CCr1', 'CCr2')] },
  { name: 'enc1-CCAh', prev: 'enc1-CCr2', expect: [E1('type', 'CCr2', 'CCAh')] },
  { name: 'enc1-Pbnd', prev: 'enc1-CCAh', expect: [E1('type', 'CCAh', 'Pbnd')] },
  { name: 'enc1-AFtt', prev: 'enc1-Pbnd', expect: [E1('type', 'Pbnd', 'AFtt')] },
  { name: 'enc1-CCAb-n031', prev: 'enc1-AFtt', expect: [E1('type', 'AFtt', 'CCAb')] },
  { name: 'enc1-Acc0', prev: 'enc1-CCAb-n031', expect: [E1('mode', 'Acc3', 'Acc0')] },
  { name: 'enc1-Acc1', prev: 'enc1-Acc0', expect: [E1('mode', 'Acc0', 'Acc1')] },
  { name: 'enc1-Acc2', prev: 'enc1-Acc1', expect: [E1('mode', 'Acc1', 'Acc2')] },
  { name: 'enc1-dispOFF', prev: 'enc1-Acc2', expect: [E1('display', 'Std', 'OFF')] },
  { name: 'enc1-bPoL', prev: 'enc1-dispOFF', expect: [E1('display', 'OFF', 'bPoL')] },
  { name: 'enc8g8-n104', prev: 'enc1-bPoL', expect: [[enc(8, 8, 'number'), 103, 104]] },
  { name: 'enc1-PrGC', prev: 'enc8g8-n104', expect: [E1('type', 'CCAb', 'PrGC')] },
  { name: 'enc1-PrGC-back-CCAb', prev: 'enc1-PrGC', expect: [E1('type', 'PrGC', 'CCAb')] },
  { name: 'enc1-CCAb-n127', prev: 'enc1-PrGC-back-CCAb', expect: [E1('number', 31, 127)] },
  { name: 'enc1-CCr2-n127', prev: 'enc1-CCAb-n127', expect: [E1('type', 'CCAb', 'CCr2')] },
  { name: 'enc1-CCr1-n127', prev: 'enc1-CCr2-n127', expect: [E1('type', 'CCr2', 'CCr1')] },
  { name: 'enc1-CCAh-clamp', prev: 'enc1-CCr1-n127', expect: [E1('type', 'CCr1', 'CCAh'), E1('number', 127, 31)] },
  { name: 'pbf1-ch01', prev: 'enc1-CCAh-clamp', expect: [[pbt(1, 1, 'channel'), 16, 1], [btn(1, 1, 'channel'), 16, 1], [fad(1, 1, 'channel'), 16, 1]] },
  { name: 'pbf1-number', prev: 'pbf1-ch01', expect: [[pbt(1, 1, 'number'), 0, 127], [btn(1, 1, 'number'), 64, 65], [fad(1, 1, 'number'), 32, 33]] },
  { name: 'pbf1-lower', prev: 'pbf1-number', expect: [[pbt(1, 1, 'lower'), 0, 1], [btn(1, 1, 'lower'), 0, 1], [fad(1, 1, 'lower'), 0, 1]] },
  { name: 'pbf1-upper', prev: 'pbf1-lower', expect: [[pbt(1, 1, 'upper'), 127, 126], [btn(1, 1, 'upper'), 127, 126], [fad(1, 1, 'upper'), 127, 126]] },
  { name: 'pbf8-stride', prev: 'pbf1-upper', expect: [[pbt(8, 8, 'number'), 63, 64], [btn(8, 8, 'lower'), 0, 1], [fad(8, 8, 'upper'), 127, 126]] },
  { name: 'enc876g8-stride', prev: 'pbf8-stride', expect: [[enc(8, 8, 'channel'), 16, 1], [enc(8, 7, 'lower'), 0, 1], [enc(8, 6, 'upper'), 127, 126]] },
  { name: 'enc8g8-Acc0', prev: 'enc876g8-stride', expect: [[enc(8, 8, 'mode'), 'Acc3', 'Acc0']] },
  { name: 'enc8g8-dispOFF', prev: 'enc8g8-Acc0', expect: [[enc(8, 8, 'display'), 'Std', 'OFF']] },
  { name: 'pbt1-OFF', prev: 'enc8g8-dispOFF', expect: [[pbt(1, 1, 'type'), 'notE', 'OFF']] },
  { name: 'pbt1-CC', prev: 'pbt1-OFF', expect: [[pbt(1, 1, 'type'), 'OFF', 'CC']] },
  { name: 'pbt1-PrGC', prev: 'pbt1-CC', expect: [[pbt(1, 1, 'type'), 'CC', 'PrGC']] },
  { name: 'pbt1-AFtt', prev: 'pbt1-PrGC', expect: [[pbt(1, 1, 'type'), 'PrGC', 'AFtt']] },
  { name: 'btn1-CC', prev: 'pbt1-AFtt', expect: [[btn(1, 1, 'type'), 'notE', 'CC']] },
  { name: 'btn1-toGL', prev: 'btn1-CC', expect: [[btn(1, 1, 'mode'), 'btn', 'toGL']] },
  { name: 'btn1-dispOFF', prev: 'btn1-toGL', expect: [[btn(1, 1, 'display'), 'Std', 'OFF']] },
  { name: 'btn1-EXt', prev: 'btn1-dispOFF', expect: [[btn(1, 1, 'display'), 'OFF', 'EXt']] },
  { name: 'pbt1-toGL', prev: 'btn1-EXt', expect: [[pbt(1, 1, 'mode'), 'btn', 'toGL']] },
  { name: 'fad1-SnAP', prev: 'pbt1-toGL', expect: [[fad(1, 1, 'mode'), 'JMP', 'SnAP']] },
  { name: 'fad1-PrGC', prev: 'fad1-SnAP', expect: [[fad(1, 1, 'type'), 'CCAb', 'PrGC']] },
  { name: 'fad1-Pbnd', prev: 'fad1-PrGC', expect: [[fad(1, 1, 'type'), 'PrGC', 'Pbnd']] },
  { name: 'fad1-AFtt', prev: 'fad1-Pbnd', expect: [[fad(1, 1, 'type'), 'Pbnd', 'AFtt']] },
  { name: 'fad1-dispOFF', prev: 'fad1-AFtt', expect: [[fad(1, 1, 'display'), 'Std', 'OFF']] },
  { name: 'fad1-bPoL', prev: 'fad1-dispOFF', expect: [[fad(1, 1, 'display'), 'OFF', 'bPoL']] },
  { name: 'fad9g1-n113', prev: 'fad1-bPoL', expect: [[fad(1, 9, 'number'), 112, 113]] },
  { name: 'fad9g4-L001', prev: 'fad9g1-n113', expect: [[fad(4, 9, 'lower'), 0, 1]] },
  { name: 'fad9g8-ch01', prev: 'fad9g4-L001', expect: [[fad(8, 9, 'channel'), 16, 1]] },
  { name: 'btn1-PrGC', prev: 'fad9g8-ch01', expect: [[btn(1, 1, 'type'), 'CC', 'PrGC']] },
  { name: 'btn1-AFtt', prev: 'btn1-PrGC', expect: [[btn(1, 1, 'type'), 'PrGC', 'AFtt']] },
  { name: 'g1name-0', prev: 'btn1-AFtt', expect: [[nm(1), 'grp1', '0rp1']] },
  { name: 'g1name-9', prev: 'g1name-0', expect: [[nm(1), '0rp1', '9rp1']] },
  { name: 'g1name-z', prev: 'g1name-9', expect: [[nm(1), '9rp1', 'zrp1']] },
  { name: 'g1name-j', prev: 'g1name-z', expect: [[nm(1), 'zrp1', 'jrp1']] },
  { name: 'g1name-l', prev: 'g1name-j', expect: [[nm(1), 'jrp1', 'lrp1']] },
  { name: 'g2name-l', prev: 'g1name-l', expect: [[nm(2), 'grp2', 'lrp2']] },
  { name: 'g2name-sym1', prev: 'g2name-l', expect: [[nm(2), 'lrp2', '-rp2']] },
  { name: 'g2name-sym2', prev: 'g2name-sym1', expect: [[nm(2), '-rp2', '_rp2']] },
  { name: 'g2name-sym3', prev: 'g2name-sym2', expect: [[nm(2), '_rp2', "'rp2"]] },
  { name: 'g2name-sym4', prev: 'g2name-sym3', expect: [[nm(2), "'rp2", '"rp2']] },
  { name: 'g2name-sym5', prev: 'g2name-sym4', expect: [[nm(2), '"rp2', '=rp2']] },
  { name: 'g2name-sym6', prev: 'g2name-sym5', expect: [[nm(2), '=rp2', ' rp2']] },
  { name: 'g2name-u', prev: 'g2name-sym6', expect: [[nm(2), ' rp2', 'urp2']] },
  { name: 'g2name-x', prev: 'g2name-u', expect: [[nm(2), 'urp2', 'xrp2']] },
  { name: 'g2name-y', prev: 'g2name-x', expect: [[nm(2), 'xrp2', 'yrp2']] },
  { name: 'last-ch-num-lower', prev: 'g2name-y', expect: [[pbt(8, 8, 'channel'), 16, 1], [btn(8, 8, 'number'), 127, 126], [fad(8, 8, 'lower'), 0, 1], [fad(8, 8, 'upper'), 126, 127]] },
  { name: 'last-lower-ch-num', prev: 'last-ch-num-lower', expect: [[pbt(8, 8, 'lower'), 0, 1], [btn(8, 8, 'channel'), 16, 1], [fad(8, 8, 'number'), 111, 110]] },
  { name: 'last-upper-ch', prev: 'last-lower-ch-num', expect: [[pbt(8, 8, 'upper'), 127, 126], [btn(8, 8, 'upper'), 127, 126], [fad(8, 8, 'channel'), 16, 1]] },
  { name: 'last-mode-disp', prev: 'last-upper-ch', expect: [[pbt(8, 8, 'mode'), 'btn', 'toGL'], [btn(8, 8, 'display'), 'Std', 'OFF'], [fad(8, 8, 'mode'), 'JMP', 'SnAP']] },
  { name: 'last-types', prev: 'last-mode-disp', expect: [[pbt(8, 8, 'type'), 'notE', 'CC'], [btn(8, 8, 'type'), 'notE', 'CC'], [fad(8, 8, 'type'), 'CCAb', 'PrGC']] },
  { name: 'fad9-g876', prev: 'last-types', expect: [[fad(6, 9, 'type'), 'CCAb', 'PrGC'], [fad(7, 9, 'mode'), 'JMP', 'SnAP'], [fad(8, 9, 'upper'), 127, 126]] },
  { name: 'fad9g5-dispOFF', prev: 'fad9-g876', expect: [[fad(5, 9, 'display'), 'Std', 'OFF']] },
  // Combined SE16 dump (2026-11-16): order of push/green/fader off the corners, green mode and fader display at control 8 (the encoder type at control 8 is not confirmed by this pair, extra byte; see enc8g8-CCr1).
  // The encoder number 103 → 31 was not made by hand: the CCAh clamp (0–31): the user turned type up through PrGC and CCAh to CCr1 (user, 2026-11-16).
  { name: 'combined-se16', prev: 'base', expect: [
    [pbt(1, 8, 'number'), 7, 8], [btn(8, 1, 'number'), 120, 121], [fad(1, 8, 'number'), 39, 40],
    [btn(8, 8, 'mode'), 'btn', 'toGL'], [fad(8, 8, 'display'), 'Std', 'OFF'],
    [enc(8, 8, 'type'), 'CCAb', 'CCr1'], [enc(8, 8, 'number'), 103, 31],
  ] },
  // Single-change dump (2026-11-16, from rESc'd SE16 = base): Enc8 of group 8 type turned DOWN via CCr2, no CCAh, so the number stays 103. Confirms the encoder type at control 8.
  { name: 'enc8g8-CCr1', prev: 'base', expect: [[enc(8, 8, 'type'), 'CCAb', 'CCr1']] },
  // Fader 9 codes (2026-11-16): three single-change dumps from the listen log, fader/button group 1.
  { name: 'fad9g1-Pbnd', prev: 'base', expect: [[fad(1, 9, 'type'), 'CCAb', 'Pbnd']] },
  { name: 'fad9g1-AFtt', prev: 'fad9g1-Pbnd', expect: [[fad(1, 9, 'type'), 'Pbnd', 'AFtt']] },
  { name: 'fad9g1-bPoL', prev: 'fad9g1-AFtt', expect: [[fad(1, 9, 'display'), 'Std', 'bPoL']] },
  // Group-name session (2026-11-16, user's OK for combined dumps, names only). Planned G4 c1 = o; the user set a, so `o` stays unconfirmed.
  { name: 'names-g1-4', prev: 'base', expect: [[nm(1), 'grp1', 'gabc'], [nm(2), 'grp2', 'gdef'], [nm(3), 'grp3', 'himn'], [nm(4), 'grp4', 'aqst']] },
  { name: 'names-g5-8', prev: 'names-g1-4', expect: [[nm(5), 'grp5', '1234'], [nm(6), 'grp6', '5678'], [nm(7), 'grp7', 'rprp'], [nm(8), 'grp8', '0zjl']] },
];
