// Resolve suggestions (plan 0008 decision 32): for a warning, which control to change and to what; for a problem, the
// nearest valid value. Decision 35: a suggestion respects the plan (numbers already planned are reserved) and skips the
// well-known CCs; the plan is a list of entries that `applyPlan` applies to a configuration. Pure; never throws;
// changes nothing (the library applies a plan as one edit).
import { controlPathOf, groupKeyOf, isEncoderArea, parseControlPath } from './controlPath.ts';
import type { ControlArea } from './controlPath.ts';
import { factorySetup } from './factory.ts';
import { controlName, keysOf, programsOf, warnings } from './warnings.ts';
import type { Sender } from './warnings.ts';
import type { Problem, Setup, Uc4Config, Warning } from './types.ts';

/** The CC numbers other gear reads as something (sustain, volume, all notes off…): a suggestion never offers them. */
export const WELL_KNOWN_CC: readonly { number: number; name: string }[] = [
  { number: 0, name: 'bank select' }, { number: 1, name: 'modulation' }, { number: 7, name: 'volume' },
  { number: 10, name: 'pan' }, { number: 11, name: 'expression' }, { number: 32, name: 'bank select LSB' },
  { number: 64, name: 'sustain' }, { number: 65, name: 'portamento' }, { number: 66, name: 'sostenuto' },
  { number: 67, name: 'soft pedal' }, { number: 68, name: 'legato' }, { number: 69, name: 'hold 2' },
  { number: 120, name: 'all sound off' }, { number: 121, name: 'reset controllers' }, { number: 122, name: 'local control' },
  { number: 123, name: 'all notes off' }, { number: 124, name: 'omni off' }, { number: 125, name: 'omni on' },
  { number: 126, name: 'mono' }, { number: 127, name: 'poly' },
];
const WELL_KNOWN = new Map(WELL_KNOWN_CC.map((e) => [e.number, e.name]));
/** What a CC number is well known for ("sustain"), or undefined: for the hint beside a typed number. */
export const wellKnownCc = (n: number): string | undefined => WELL_KNOWN.get(n);

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

type Area = ControlArea;
type Control = Sender & { label?: string };
interface Ref { si: number; group: number; area: Area; index: number; property?: string }

const parse = (path: string): Ref | null => {
  const p = parseControlPath(path);
  if (!p || p.area === undefined || controlPathOf(p.setupIndex, p.area, p.group!, p.index!, p.property) !== path) return null;
  return { si: p.setupIndex, group: p.group!, area: p.area, index: p.index!, ...(p.property ? { property: p.property } : {}) };
};
const groupsOf = (s: Setup, area: Area) => (isEncoderArea(area) ? s.encoderGroups : s.faderButtonGroups) as unknown as Record<string, Control[]>[];
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
      const skipped = (n: number): boolean => kind === 'cc' && (WELL_KNOWN.has(n) || (pair && WELL_KNOWN.has(n + 32)));
      const free = (to: number, n: number): boolean =>
        !skipped(n) && !used.has(`${kind}:${to}:${n}`) && (!pair || !used.has(`${kind}:${to}:${n + 32}`));
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

function choiceFor(config: Uc4Config, planned: Uc4Config, path: string, setupId: string): ResolveChoice | null {
  const ref = parse(path);
  const setup = ref ? config.setups?.[ref.si] : undefined;
  if (!ref || ref.property || !setup || setup.id !== setupId) return null;
  const c = controlAt(setup, ref);
  if (!c) return null;
  // The search runs on the setup as the plan would leave it, so every planned number counts as taken.
  return { path, ...names(ref), ...suggest(planned.setups?.[ref.si] ?? setup, ref, c) };
}

/**
 * Resolve for a warning. The control to change is the one that differs from the factory setup of the slot (the one the
 * user changed); both or neither → the second-named. A factory collision (`options.factory`, the warning's state)
 * offers both side by side. With `plan` (decision 35) the numbers it plans count as taken, so the next row moves on.
 * Nothing is applied.
 */
export function resolveWarning(config: Uc4Config, warning: Warning, options: { factory?: boolean; plan?: ResolvePlan } = {}): Resolution {
  const planned = options.plan && options.plan.length > 0 ? applyPlan(config, options.plan).config : config;
  const [first, second] = warning.controls.map((p) => choiceFor(config, planned, p, warning.setupId));
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

// --- the plan (decision 35) ---

/** The properties a plan entry can set (the numbers a control has). */
export type PlanProperty = 'channel' | 'number' | 'lower' | 'upper';
/** One planned change: a control (path as `validate` uses), the property, what it is now and what it would become. */
export interface PlanEntry { path: string; property: PlanProperty; before: number; after: number }
export type ResolvePlan = readonly PlanEntry[];
export interface RefusedEntry { entry: PlanEntry; reason: string }

const PLAN_PROPERTIES: readonly string[] = ['channel', 'number', 'lower', 'upper'];

/** The plan entries a choice's suggestion stands for (one per property it sets, `before` read from the configuration); none without a suggestion or control. */
export function entriesOf(config: Uc4Config, choice: ResolveChoice): PlanEntry[] {
  const ref = parse(choice.path);
  const c = ref && !ref.property ? controlAt(config.setups?.[ref.si], ref) as unknown as Record<string, unknown> | undefined : undefined;
  if (!c || !choice.suggestion) return [];
  const out: PlanEntry[] = [];
  for (const property of PLAN_PROPERTIES as PlanProperty[]) {
    const after = (choice.suggestion.change as Record<string, number | undefined>)[property];
    const before = c[property];
    if (after !== undefined && typeof before === 'number') out.push({ path: choice.path, property, before, after });
  }
  return out;
}

/**
 * Sets the After value of the plan entry (`path`, `property`). Editing one end of a planned `PrGC` range (its `lower`
 * and `upper` both planned) moves the block: the other end keeps its distance (same width, a reversed range stays
 * reversed, never "programs 20–17"), and the block is held inside 0–127. A value that is no whole number is set as typed
 * (`checkPlanValue` says why it is no good). The same plan comes back when it has no such entry.
 */
export function setPlanAfter(plan: ResolvePlan, path: string, property: PlanProperty, after: number): ResolvePlan {
  const at = plan.findIndex((e) => e.path === path && e.property === property);
  if (at < 0) return plan;
  const partnerProperty = property === 'lower' ? 'upper' : property === 'upper' ? 'lower' : null;
  const partner = partnerProperty ? plan.findIndex((e) => e.path === path && e.property === partnerProperty) : -1;
  if (partner < 0 || !Number.isInteger(after)) return plan.map((e, i) => (i === at ? { ...e, after } : e));
  const gap = plan[partner]!.after - plan[at]!.after;
  const moved = Math.min(Math.max(after, Math.max(0, -gap)), Math.min(127, 127 - gap));
  return plan.map((e, i) => (i === at ? { ...e, after: moved } : i === partner ? { ...e, after: moved + gap } : e));
}

/** Why `value` is no good for `property` of this control, or undefined. */
function invalidValue(c: Control, property: string, value: unknown): string | undefined {
  const range = RANGE[property];
  if (!range) return `A control has no ${property} to plan.`;
  if (typeof value !== 'number' || !Number.isInteger(value)) return `The ${property} must be a whole number.`;
  const hi = property === 'number' && c.type === 'CCAh' ? 31 : range[1];
  if (value < range[0] || value > hi) return `The ${property} must be ${range[0]}–${hi}.`;
  return undefined;
}

/**
 * Applies the plan to a configuration, entry by entry. An entry whose control is gone, whose property the control does
 * not have, whose `before` is no longer the control's value (it changed since the user saw it) or whose `after` is not
 * a valid value is refused with a reason and the rest still apply. Nothing is changed in place; with nothing applied the
 * same configuration comes back. Never throws.
 */
export function applyPlan(config: Uc4Config, plan: ResolvePlan): { config: Uc4Config; applied: PlanEntry[]; refused: RefusedEntry[] } {
  const applied: PlanEntry[] = [];
  const refused: RefusedEntry[] = [];
  let next: Uc4Config = config;
  for (const entry of plan ?? []) {
    const ref = typeof entry?.path === 'string' ? parse(entry.path) : null;
    const setup = ref && !ref.property ? next.setups?.[ref.si] : undefined;
    const c = ref && setup ? controlAt(setup, ref) as unknown as Record<string, unknown> | undefined : undefined;
    const no = (reason: string): void => { refused.push({ entry, reason }); };
    if (!ref || !setup || !c) { no('That control is no longer there.'); continue; }
    if (typeof c[entry.property] !== 'number') { no(`${names(ref).short} has no ${entry.property}.`); continue; }
    if (c[entry.property] !== entry.before) { no(`${names(ref).short}: the ${entry.property} is ${String(c[entry.property])} now, not ${entry.before}.`); continue; }
    const bad = invalidValue(c as unknown as Control, entry.property, entry.after);
    if (bad) { no(`${names(ref).short}: ${bad}`); continue; }
    const groups = groupsOf(setup, ref.area);
    const key = groupKeyOf(ref.area);
    const nextSetup = {
      ...setup,
      [key]: groups.map((g, gi) => (gi !== ref.group ? g : {
        ...g, [ref.area]: g[ref.area]!.map((x, i) => (i === ref.index ? { ...x, [entry.property]: entry.after } : x)),
      })),
    } as Setup;
    next = { ...next, setups: next.setups.map((s, i) => (i === ref.si ? nextSetup : s)) };
    applied.push(entry);
  }
  return { config: next, applied, refused };
}

/** What a typed After value comes to: `valid` false with a `reason`, or the controls it would collide with. */
export interface PlanCheck { valid: boolean; reason?: string; collidesWith: { path: string; name: string }[] }

/**
 * Checks a typed After value for one control of the plan: is it a valid value, and does it collide (two controls that can
 * play together send the same message) given the configuration plus the rest of the plan? The entry's own planned value
 * is replaced by `after`. Nothing is applied; never throws.
 */
export function checkPlanValue(config: Uc4Config, plan: ResolvePlan, entry: { path: string; property: PlanProperty; after: number }): PlanCheck {
  const ref = typeof entry?.path === 'string' ? parse(entry.path) : null;
  const setup = ref && !ref.property ? config.setups?.[ref.si] : undefined;
  const c = ref && setup ? controlAt(setup, ref) : undefined;
  if (!ref || !c) return { valid: false, reason: 'That control is no longer there.', collidesWith: [] };
  const bad = invalidValue(c, entry.property, entry.after);
  if (bad) return { valid: false, reason: bad, collidesWith: [] };
  const moved = setPlanAfter(plan ?? [], entry.path, entry.property, entry.after); // a range moves as a block
  const rest = moved.filter((e) => !(e.path === entry.path && e.property === entry.property));
  const after = moved.find((e) => e.path === entry.path && e.property === entry.property)?.after ?? entry.after;
  const base = applyPlan(config, rest).config;
  const before = (controlAt(base.setups[ref.si], ref) as unknown as Record<string, unknown>)[entry.property];
  const { config: candidate, refused } = applyPlan(base, [{ path: entry.path, property: entry.property, before: before as number, after }]);
  if (refused.length > 0) return { valid: false, reason: refused[0]!.reason, collidesWith: [] };
  const out: PlanCheck['collidesWith'] = [];
  const seen = new Set<string>();
  for (const w of warnings(candidate)) {
    if (w.setupId !== setup!.id || !w.controls.includes(entry.path)) continue;
    const other = w.controls.find((p) => p !== entry.path)!;
    if (seen.has(other)) continue;
    seen.add(other);
    const o = parse(other);
    out.push({ path: other, name: o ? names(o).name : other });
  }
  return { valid: true, collidesWith: out };
}
