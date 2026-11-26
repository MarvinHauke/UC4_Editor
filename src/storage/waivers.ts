// Waived warnings (plan 0008 decisions 7 and 25). A waiver says "I know these two controls send the same message".
// It is kept beside the library (a sidecar, like the marks), saved with it and part of the undo snapshots, and is
// never in the uc4-config JSON or a `.syx`. It names the setup, the two control paths and the message key; it
// lapses (is dropped) as soon as no current warning matches it. Factory collisions are not stored: they count as
// waived while both controls still equal the factory setup's.
import { factorySetup, warnings } from '../model/index.ts';
import type { MessageKey, Uc4Config, Warning } from '../model/index.ts';
import { canon } from './libraryInfo.ts';

export interface Waiver { setupId: string; controls: [string, string]; key: MessageKey }
export type Waivers = readonly Waiver[];

/** `open`: counts, blocks nothing. `waived`: the user accepted it. `factory`: the factory layout, waived until a control changes. */
export type WarningState = 'open' | 'waived' | 'factory';
export type ListedWarning = Warning & { state: WarningState };

/** The setup is named by `setupId`, so the index in `setups[n].` is left out: a setup that moves keeps its waivers. */
const inSetup = (path: string): string => path.replace(/^setups\[\d+\]\./, '');
export const warningId = (w: Pick<Warning, 'setupId' | 'controls' | 'key'>): string =>
  canon({ s: w.setupId, c: w.controls.map(inSetup), k: { kind: w.key.kind, channel: w.key.channel, number: w.key.number } });

const isKey = (k: unknown): k is MessageKey => {
  if (typeof k !== 'object' || k === null) return false;
  const o = k as Record<string, unknown>;
  return typeof o.kind === 'string' && typeof o.channel === 'number' && (o.number === undefined || typeof o.number === 'number');
};

/** Saved waivers as text, read back: only well-formed entries of setups that still exist. Anything odd gives none. */
export function parseWaivers(text: string | null, config: Uc4Config): Waivers {
  if (text === null) return [];
  try {
    const o = JSON.parse(text) as unknown;
    if (!Array.isArray(o)) return [];
    const ids = new Set(config.setups.map((s) => s.id));
    const seen = new Set<string>();
    const out: Waiver[] = [];
    for (const e of o as unknown[]) {
      if (typeof e !== 'object' || e === null) continue;
      const { setupId, controls, key } = e as Record<string, unknown>;
      if (typeof setupId !== 'string' || !ids.has(setupId) || !isKey(key)) continue;
      if (!Array.isArray(controls) || controls.length !== 2 || !controls.every((c) => typeof c === 'string')) continue;
      const w: Waiver = { setupId, controls: [controls[0] as string, controls[1] as string], key: { kind: key.kind, channel: key.channel, ...(key.number === undefined ? {} : { number: key.number }) } };
      const id = warningId(w);
      if (!seen.has(id)) { seen.add(id); out.push(w); }
    }
    return out;
  } catch { return []; }
}

export const stringifyWaivers = (w: Waivers): string => JSON.stringify(w);

const toWaiver = (w: Warning): Waiver => ({ setupId: w.setupId, controls: [w.controls[0], w.controls[1]], key: { ...w.key } });

/** Waivers that still match a current warning. The same array comes back when none lapsed. */
export function pruneWaivers(waivers: Waivers, current: readonly Warning[]): Waivers {
  if (waivers.length === 0) return waivers;
  const live = new Set(current.map(warningId));
  const keep = waivers.filter((w) => live.has(warningId(w)));
  return keep.length === waivers.length ? waivers : keep;
}

/** `waivers` plus these warnings (the ones already waived are not added twice). */
export function addWaivers(waivers: Waivers, add: readonly Warning[]): Waivers {
  const have = new Set(waivers.map(warningId));
  const fresh = add.filter((w) => !have.has(warningId(w)));
  return fresh.length === 0 ? waivers : [...waivers, ...fresh.map(toWaiver)];
}

export function removeWaiver(waivers: Waivers, w: Warning): Waivers {
  const id = warningId(w);
  const keep = waivers.filter((x) => warningId(x) !== id);
  return keep.length === waivers.length ? waivers : keep;
}

/** The control at a path like `setups[2].encoderGroups[0].encoders[3]`, relative to its setup. */
function relative(path: string): string[] | undefined {
  const m = /^setups\[\d+\]\.(.+)$/.exec(path);
  return m ? m[1]!.split(/[.[\]]+/).filter((p) => p !== '') : undefined;
}
function at(root: unknown, parts: string[]): unknown {
  let v = root;
  for (const p of parts) {
    if (typeof v !== 'object' || v === null) return undefined;
    v = (v as Record<string, unknown>)[p];
  }
  return v;
}
const factories = new Map<number, ReturnType<typeof factorySetup>>();
const factoryOf = (slot: number) => { let f = factories.get(slot); if (!f) { f = factorySetup(slot); factories.set(slot, f); } return f; };
/** What decides what a control sends. The editor-only `label` and the display scale are left out. */
const SENDS = ['type', 'mode', 'channel', 'number', 'lower', 'upper'] as const;
function sendsLike(a: unknown, b: unknown): boolean {
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) return false;
  const x = a as Record<string, unknown>, y = b as Record<string, unknown>;
  return SENDS.every((k) => canon(x[k]) === canon(y[k]));
}
/** Both controls send like the same controls of the factory setup of their slot. */
function isFactoryLayout(config: Uc4Config, w: Warning): boolean {
  const setup = config.setups.find((s) => s.id === w.setupId);
  const slot = setup?.slot;
  if (!setup || slot === undefined || !Number.isInteger(slot) || slot < 1 || slot > 18) return false;
  const factory = factoryOf(slot);
  return w.controls.every((path) => {
    const parts = relative(path);
    if (!parts) return false;
    return sendsLike(at(setup, parts), at(factory, parts));
  });
}

/** Every warning of every setup with its state. Waived wins over factory. */
export function listWarnings(config: Uc4Config, waivers: Waivers, current: readonly Warning[] = warnings(config)): ListedWarning[] {
  const waived = new Set(waivers.map(warningId));
  return current.map((w) => ({ ...w, state: waived.has(warningId(w)) ? 'waived' : isFactoryLayout(config, w) ? 'factory' : 'open' }));
}
