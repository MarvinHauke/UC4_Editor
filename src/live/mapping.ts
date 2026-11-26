// The map plan (plan 0008 steps 7 and 8, decisions 8, 14, 17, 20): what a monitor row would do to a control, as a planned
// edit or a refusal. Pure; reads the model, applies nothing: the UI makes the edit as one undo step.
//
// Rule: channel, number and the kind of message come from the row; mode, lower, upper and display scale stay; the control's
// current type stays when it already sends that kind of message, otherwise the table (CC → encoder/fader `CCAb`, button `CC`;
// note → `notE`; program → `PrGC`; pitch bend → `Pbnd`; aftertouch → `AFtt`); `CCAh` is never chosen by itself.
import { changeType, describeKey, warnings } from '../model/index.ts';
import type { Encoder, Fader, GreenButton, MessageKey, PushButton, Setup, Uc4Config } from '../model/types.ts';
import type { ControlArea, ControlRef } from './matching.ts';
import type { MessageKind } from './messages.ts';

export type AnyControl = Encoder | PushButton | GreenButton | Fader;

/** A planned edit: the whole new control at its address (hidden values kept, as `changeType` does). */
export interface MapEdit { setupId: string; area: ControlArea; group: number; index: number; control: AnyControl }

export type MapPlan =
  | {
      ok: true;
      edit: MapEdit;
      /** "FAd3 · FG2 now sends CC 74 ch 2", with the spotting named when it chose a relative type. */
      resultText: string;
      /** Names ("Enc3 · EG1") of controls of the same setup that this mapping makes send the same message while they can play together (decision 7/8). */
      alsoSentBy: string[];
      /** A CC went onto a button: open the property panel with Upper focused (decision 17). */
      focusUpper: boolean;
      /** The relative type chosen from the values seen (option on), else null. */
      spotted: 'CCr1' | 'CCr2' | null;
      /** True when the edit differs from the control as it is. */
      changed: boolean;
      /** The model's message about the type change (e.g. a number lowered for `CCAh`). */
      notes: string[];
    }
  | { ok: false; reason: string };

export interface MapOptions {
  /** Settings → Connections (off by default): spot `CCr1`/`CCr2` from the values seen. */
  spotRelative?: boolean;
}

/** What the plan reads of a row. */
export interface MapSource { kind: MessageKind; channel: number; number: number | null; value: number; seen?: { count: number; values: ReadonlySet<number> } }

const NAME: Record<ControlArea, string> = { encoders: 'Encoders', pushButtons: 'Push buttons', faders: 'Faders', buttons: 'Green buttons' };

/** Why a control kind can't send a kind of message; null when it can. Only depends on the kind of control (for dimming). */
export function refusalFor(area: ControlArea, kind: MessageKind): string | null {
  if (kind === 'polyAftertouch') return 'The UC4 can’t send polyphonic aftertouch; channel aftertouch (AFtt) is the nearest.';
  if (kind === 'note' && (area === 'encoders' || area === 'faders')) return `${NAME[area]} can’t send notes: notes go to push or green buttons.`;
  if (kind === 'pitchBend' && (area === 'pushButtons' || area === 'buttons')) return `${NAME[area]} can’t send pitch bend: pitch bend goes to encoders and faders.`;
  return null;
}

const KIND_OF_TYPE: Record<string, MessageKind | undefined> = {
  CCr1: 'cc', CCr2: 'cc', CCAb: 'cc', CCAh: 'cc', CC: 'cc', notE: 'note', PrGC: 'program', Pbnd: 'pitchBend', AFtt: 'aftertouch',
};

function tableType(area: ControlArea, kind: MessageKind): string {
  switch (kind) {
    case 'cc': return area === 'pushButtons' || area === 'buttons' ? 'CC' : 'CCAb';
    case 'note': return 'notE';
    case 'program': return 'PrGC';
    case 'pitchBend': return 'Pbnd';
    default: return 'AFtt';
  }
}

/** `CCr1` when only 1/127 were seen, `CCr2` when only 63/65 (at least 3 messages: one button press says nothing). */
export function spotRelativeType(seen: MapSource['seen']): 'CCr1' | 'CCr2' | null {
  if (!seen || seen.count < 3 || seen.values.size === 0) return null;
  const all = (ok: number[]) => [...seen.values].every((v) => ok.includes(v));
  if (all([1, 127])) return 'CCr1';
  if (all([63, 65])) return 'CCr2';
  return null;
}

export function readControl(configuration: Uc4Config, ref: Pick<ControlRef, 'setupId' | 'area' | 'group' | 'index'>): AnyControl | null {
  const setup = configuration.setups.find((s) => s.id === ref.setupId);
  if (!setup) return null;
  const group = ref.area === 'encoders' || ref.area === 'pushButtons' ? setup.encoderGroups[ref.group] : setup.faderButtonGroups[ref.group];
  const list = (group as unknown as Record<string, AnyControl[] | undefined> | undefined)?.[ref.area];
  return list?.[ref.index] ?? null;
}

/** The configuration with the edit applied (a copy; only the one setup is rebuilt). */
export function withEdit(configuration: Uc4Config, edit: MapEdit): Uc4Config {
  const replace = <T>(list: T[], i: number, value: T) => list.map((x, k) => (k === i ? value : x));
  const setups = configuration.setups.map((setup): Setup => {
    if (setup.id !== edit.setupId) return setup;
    if (edit.area === 'encoders' || edit.area === 'pushButtons') {
      return { ...setup, encoderGroups: replace(setup.encoderGroups, edit.group, { ...setup.encoderGroups[edit.group]!, [edit.area]: replace((setup.encoderGroups[edit.group]!)[edit.area] as AnyControl[], edit.index, edit.control) }) };
    }
    return { ...setup, faderButtonGroups: replace(setup.faderButtonGroups, edit.group, { ...setup.faderButtonGroups[edit.group]!, [edit.area]: replace((setup.faderButtonGroups[edit.group]!)[edit.area] as AnyControl[], edit.index, edit.control) }) };
  });
  return { ...configuration, setups };
}

const PATH = /(encoderGroups|faderButtonGroups)\[(\d+)\]\.(encoders|pushButtons|faders|buttons)\[(\d+)\]$/;
const SHORT: Record<string, string> = { encoders: 'Enc', pushButtons: 'Pbt', faders: 'FAd', buttons: 'btn' };
/** "Enc3 · EG1" from a path the model's warnings use. */
export function nameOfPath(path: string): string | null {
  const m = PATH.exec(path);
  if (!m) return null;
  return `${SHORT[m[3]!]}${Number(m[4]) + 1} · ${m[1] === 'encoderGroups' ? 'EG' : 'FG'}${Number(m[2]) + 1}`;
}
const pathOf = (setupIndex: number, e: Pick<MapEdit, 'area' | 'group' | 'index'>) =>
  `setups[${setupIndex}].${e.area === 'encoders' || e.area === 'pushButtons' ? 'encoderGroups' : 'faderButtonGroups'}[${e.group}].${e.area}[${e.index}]`;

export function planMap(configuration: Uc4Config, target: ControlRef, row: MapSource, options: MapOptions = {}): MapPlan {
  const refusal = refusalFor(target.area, row.kind);
  if (refusal) return { ok: false, reason: refusal };
  const current = readControl(configuration, target);
  if (!current) return { ok: false, reason: 'That control is not in the open configuration any more.' };

  const sendsKind = KIND_OF_TYPE[current.type] === row.kind;
  // `CCAh` can't take a number above 31: it is kept only when the row's number fits.
  const keep = sendsKind && !(current.type === 'CCAh' && (row.number ?? 0) > 31);
  const spotted = options.spotRelative && target.area === 'encoders' && row.kind === 'cc' ? spotRelativeType(row.seen) : null;
  const type = spotted ?? (keep ? current.type : tableType(target.area, row.kind));

  const withMessage = { ...current, channel: row.channel, ...(row.kind === 'cc' || row.kind === 'note' ? { number: row.number ?? current.number } : {}) } as AnyControl;
  const typed = changeType(withMessage as never, type as never) as { control: AnyControl; message?: string };
  // A program onto a button: the button's program is its Upper value (decision 8, exceptions). An encoder or fader keeps Lower…Upper.
  const isButton = target.area === 'pushButtons' || target.area === 'buttons';
  const control = row.kind === 'program' && isButton && row.number !== null ? ({ ...typed.control, upper: row.number } as AnyControl) : typed.control;

  const edit: MapEdit = { setupId: target.setupId, area: target.area, group: target.group, index: target.index, control };
  const notes: string[] = [];
  if (typed.message) notes.push(typed.message);
  const key: MessageKey = { kind: row.kind === 'polyAftertouch' ? 'aftertouch' : row.kind, channel: row.channel, ...(row.kind === 'cc' || row.kind === 'note' ? { number: row.number ?? 0 } : {}) };
  const range = `${Math.min(control.lower, control.upper)}–${Math.max(control.lower, control.upper)}`;
  const sent = row.kind === 'program'
    ? (isButton ? `program ${row.number} ch ${row.channel}` : `programs ${range} ch ${row.channel}`)
    : describeKey(key) + (type === 'CCAh' ? ` (and CC ${(row.number ?? 0) + 32})` : '');

  // Which controls now collide: the model's warnings of the new configuration, minus the ones that were already there.
  const setupIndex = configuration.setups.findIndex((s) => s.id === target.setupId);
  const targetPath = pathOf(setupIndex, edit);
  const before = new Set(warnings(configuration).map((w) => w.controls.join('|')));
  const alsoSentBy = warnings(withEdit(configuration, edit))
    .filter((w) => w.setupId === target.setupId && w.controls.includes(targetPath) && !before.has(w.controls.join('|')))
    .map((w) => nameOfPath(w.controls.find((c) => c !== targetPath)!))
    .filter((n): n is string => n !== null);

  return {
    ok: true,
    edit,
    resultText: `${target.name} now sends ${sent}${spotted ? ` as ${spotted} (only ${spotted === 'CCr1' ? '1/127' : '63/65'} seen)` : ''}`,
    alsoSentBy,
    focusUpper: row.kind === 'cc' && (target.area === 'pushButtons' || target.area === 'buttons'),
    spotted,
    changed: JSON.stringify(control) !== JSON.stringify(current),
    notes,
  };
}
