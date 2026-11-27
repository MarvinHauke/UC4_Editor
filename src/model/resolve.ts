// Resolve suggestions (plan 0008 decision 32): for a warning, which control to change and to what; for a problem, the
// nearest valid value. Pure; never throws; changes nothing (the library applies a choice as one edit).
import { factorySetup } from './factory.ts';
import { controlName, keysOf, programsOf } from './warnings.ts';
import type { Sender } from './warnings.ts';
import type { Problem, Setup, Uc4Config, Warning } from './types.ts';

/** The properties a suggestion sets; every other property of the control stays. */
export interface ControlChange { channel?: number; number?: number; lower?: number; upper?: number }

/** What a control would change to. `text` is what the UI shows after the name: "CC 16", "CC 9 on ch 2", "programs 15–17". */
export interface Suggestion { change: ControlChange; text: string }

/** One control that could be changed. `suggestion` is null when there is no value to offer; `reason` then says why. */
export interface ResolveChoice {
  /** The control, as the paths `validate` uses. */
  path: string;
  /** "Enc2 · EG1" */
  name: string;
  /** "Enc2" */
  short: string;
  suggestion: Suggestion | null;
  reason?: string;
}

/**
 * What Resolve offers. `choices[0]` is the one to change; for a warning `choices[1]` is "change <other> instead".
 * `sideBySide` is true for a factory collision: both choices are equal, show them next to each other.
 * No choices at all: the warning or problem no longer points at anything (the UI offers nothing).
 */
export interface Resolution { choices: ResolveChoice[]; sideBySide: boolean }

type Area = 'encoders' | 'pushButtons' | 'faders' | 'buttons';
type Control = Sender & { label?: string };
interface Ref { si: number; group: number; area: Area; index: number; property?: string }

const PATH = /^setups\[(\d+)\]\.(?:encoderGroups|faderButtonGroups)\[(\d+)\]\.(encoders|pushButtons|faders|buttons)\[(\d+)\](?:\.(\w+))?$/;
const parse = (path: string): Ref | null => {
  const m = PATH.exec(path);
  return m ? { si: Number(m[1]), group: Number(m[2]), area: m[3] as Area, index: Number(m[4]), ...(m[5] ? { property: m[5] } : {}) } : null;
};
const groupsOf = (s: Setup, area: Area) => (area === 'encoders' || area === 'pushButtons' ? s.encoderGroups : s.faderButtonGroups) as unknown as Record<string, Control[]>[];
const controlAt = (s: Setup | undefined, r: Ref): Control | undefined => groupsOf(s ?? ({} as Setup), r.area)?.[r.group]?.[r.area]?.[r.index];
const isButton = (a: Area): boolean => a === 'pushButtons' || a === 'buttons';

const names = (r: Ref): { name: string; short: string } => controlName(r.area, r.group, r.index);

/** What decides what a control sends; the editor-only label is left out. */
const SENDS = ['type', 'mode', 'channel', 'number', 'lower', 'upper'] as const;
function differsFromFactory(setup: Setup, r: Ref): boolean {
  const slot = setup.slot;
  if (typeof slot !== 'number' || !Number.isInteger(slot) || slot < 1 || slot > 18) return false;
  const mine = controlAt(setup, r) as unknown as Record<string, unknown> | undefined;
  const fact = controlAt(factorySetup(slot), r) as unknown as Record<string, unknown> | undefined;
  return !mine || !fact || SENDS.some((k) => mine[k] !== fact[k]);
}

const kindWord = (k: string): string => (k === 'cc' ? 'CC' : k);
const onChannel = (text: string, from: number, to: number): string => (from === to ? text : `${text} on ch ${to}`);

/** Every message key any control of the setup sends, except the control itself, as a set of ids. */
function taken(setup: Setup, self: Ref): Set<string> {
  const out = new Set<string>();
  for (const area of ['encoders', 'pushButtons', 'faders', 'buttons'] as const) {
    groupsOf(setup, area).forEach((g, gi) => g?.[area]?.forEach((c, i) => {
      if (area === self.area && gi === self.group && i === self.index) return;
      for (const k of keysOf(c, isButton(area))) out.add(`${k.kind}:${k.channel}:${k.number ?? ''}`);
    }));
  }
  return out;
}

const none = (reason: string): { suggestion: null; reason: string } => ({ suggestion: null, reason });

/** The value to offer for one control: next free upwards on its channel, then the same place on the next channel up. */
function suggest(setup: Setup, ref: Ref, c: Control): { suggestion: Suggestion | null; reason?: string } {
  const used = taken(setup, ref);
  const ch = c.channel;
  if (!Number.isInteger(ch) || ch < 1 || ch > 16) return none('The channel is not valid: fix that first.');
  switch (c.type) {
    case 'Pbnd': case 'AFtt': {
      const kind = c.type === 'Pbnd' ? 'pitchBend' : 'aftertouch';
      for (let step = 1; step < 16; step++) {
        const to = ((ch - 1 + step) % 16) + 1;
        if (!used.has(`${kind}:${to}:`)) return { suggestion: { change: { channel: to }, text: `ch ${to}` } };
      }
      return none(`No free channel for ${c.type === 'Pbnd' ? 'pitch bend' : 'aftertouch'}`);
    }
    case 'CCr1': case 'CCr2': case 'CCAb': case 'CC': case 'CCAh': case 'notE': {
      const kind = c.type === 'notE' ? 'note' : 'cc';
      const pair = c.type === 'CCAh';
      const max = pair ? 31 : 127;
      if (!Number.isInteger(c.number) || c.number < 0 || c.number > 127) return none('The number is not valid: fix that first.');
      const free = (to: number, n: number): boolean => !used.has(`${kind}:${to}:${n}`) && (!pair || !used.has(`${kind}:${to}:${n + 32}`));
      const from = Math.min(c.number, max);
      for (let step = 0; step < 16; step++) {
        const to = ((ch - 1 + step) % 16) + 1;
        // On the own channel the search starts above the current number; on the next channels at the same number.
        for (let k = step === 0 ? 1 : 0; k <= max; k++) {
          const n = (from + k) % (max + 1);
          if (free(to, n)) return { suggestion: { change: { ...(to === ch ? {} : { channel: to }), number: n }, text: onChannel(`${kindWord(kind)} ${n}`, ch, to) } };
        }
      }
      return none(pair ? 'No free CC pair' : kind === 'cc' ? 'No free CC' : 'No free note');
    }
    case 'PrGC': {
      const programs = programsOf(c, isButton(ref.area));
      const w = programs.length;
      if (w === 0) return none('There is no program value to move: fix that first.');
      const top = 128 - w; // last start that fits
      const lo = programs[0]!;
      const reversed = !isButton(ref.area) && typeof c.lower === 'number' && typeof c.upper === 'number' && c.lower > c.upper;
      const free = (to: number, s: number): boolean => {
        for (let p = s; p < s + w; p++) if (used.has(`program:${to}:${p}`)) return false;
        return true;
      };
      const words = (s: number): string => (w === 1 ? `program ${s}` : `programs ${s}–${s + w - 1}`);
      const same = isButton(ref.area) && c.lower === c.upper; // "one program number": release sends the same
      const change = (s: number): ControlChange => isButton(ref.area) ? (same ? { lower: s, upper: s } : { upper: s })
        : reversed ? { lower: s + w - 1, upper: s } : { lower: s, upper: s + w - 1 };
      for (let step = 0; step < 16; step++) {
        const to = ((ch - 1 + step) % 16) + 1;
        for (let k = step === 0 ? 1 : 0; k <= top; k++) {
          const s = (lo + k) % (top + 1);
          if (free(to, s)) return { suggestion: { change: { ...(to === ch ? {} : { channel: to }), ...change(s) }, text: onChannel(words(s), ch, to) } };
        }
      }
      return none(w === 1 ? 'No free program' : `No free block of ${w} programs`);
    }
    default:
      return none('This control sends nothing');
  }
}

function choiceFor(config: Uc4Config, path: string, setupId: string): ResolveChoice | null {
  const ref = parse(path);
  const setup = ref ? config.setups?.[ref.si] : undefined;
  if (!ref || ref.property || !setup || setup.id !== setupId) return null;
  const c = controlAt(setup, ref);
  if (!c) return null;
  return { path, ...names(ref), ...suggest(setup, ref, c) };
}

/**
 * Resolve for a warning. The control to change is the one that differs from the factory setup of the slot (the one the
 * user changed); both or neither → the second-named. A factory collision (`options.factory`, the warning's state)
 * offers both side by side. Nothing is applied.
 */
export function resolveWarning(config: Uc4Config, warning: Warning, options: { factory?: boolean } = {}): Resolution {
  const [first, second] = warning.controls.map((p) => choiceFor(config, p, warning.setupId));
  if (!first || !second) return { choices: [], sideBySide: false };
  if (options.factory) return { choices: [first, second], sideBySide: true };
  const setup = config.setups[parse(first.path)!.si]!;
  const firstChanged = differsFromFactory(setup, parse(first.path)!);
  const secondChanged = differsFromFactory(setup, parse(second.path)!);
  return { choices: firstChanged && !secondChanged ? [first, second] : [second, first], sideBySide: false };
}

const RANGE: Record<string, [number, number]> = { channel: [1, 16], number: [0, 127], lower: [0, 127], upper: [0, 127] };
const PROPERTY_WORD: Record<string, string> = { channel: 'ch', number: 'number', lower: 'lower', upper: 'upper' };

/** Resolve for a value problem: the nearest valid value of the number that is out of range (rounded, cut to the range;
 *  a CCAh number to 0–31). A problem that is not a number out of range has no choice or a choice with no suggestion. */
export function resolveProblem(config: Uc4Config, problem: Problem): Resolution {
  const ref = parse(problem.path);
  const setup = ref ? config.setups?.[ref.si] : undefined;
  const c = ref && setup ? controlAt(setup, ref) : undefined;
  if (!ref || !c) return { choices: [], sideBySide: false };
  const path = ref.property ? problem.path.slice(0, problem.path.lastIndexOf('.')) : problem.path;
  const base = { path, ...names(ref) };
  if (!ref.property || !(ref.property in RANGE)) {
    return { choices: [{ ...base, ...none('There is no nearest value: pick one from the list in the property panel') }], sideBySide: false };
  }
  const value = (c as unknown as Record<string, unknown>)[ref.property];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return { choices: [{ ...base, ...none(`The ${ref.property} is not a number: there is no nearest value.`) }], sideBySide: false };
  }
  const [lo, rangeHi] = RANGE[ref.property]!;
  const hi = ref.property === 'number' && c.type === 'CCAh' ? 31 : rangeHi;
  const nearest = Math.min(hi, Math.max(lo, Math.round(value)));
  return {
    choices: [{ ...base, suggestion: { change: { [ref.property]: nearest }, text: `${PROPERTY_WORD[ref.property]} ${nearest}` } }],
    sideBySide: false,
  };
}
