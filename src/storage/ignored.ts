// Ignored warnings (plan 0008 decisions 7 and 25). An ignored entry says "I know these two controls send the same message".
// It is kept beside the library (a sidecar, like the marks), saved with it and part of the undo snapshots, and is
// never in the uc4-config JSON or a `.syx`. It names the setup, the two control paths and the message key; it
// lapses (is dropped) as soon as no current warning matches it. Factory collisions are not stored: they count as
// ignored while both controls still equal the factory setup's.
import { factorySetup, warnings } from '../model/index.ts';
import type { MessageKey, Uc4Config, Warning } from '../model/index.ts';
import { canon } from './libraryInfo.ts';

/** `signature` is what both controls sent when it was ignored (`Warning.signature`); entries saved before it existed have none. */
export interface IgnoredEntry { setupId: string; controls: [string, string]; key: MessageKey; signature?: string }
export type Ignored = readonly IgnoredEntry[];

/** `open`: counts, blocks nothing. `ignored`: the user accepted it. `factory`: the factory layout, ignored until a control changes. */
export type WarningState = 'open' | 'ignored' | 'factory';
export type ListedWarning = Warning & { state: WarningState };

/** The setup is named by `setupId`, so the index in `setups[n].` is left out: a setup that moves keeps its ignored entries. */
const inSetup = (path: string): string => path.replace(/^setups\[\d+\]\./, '');
export const warningId = (w: Pick<Warning, 'setupId' | 'controls' | 'key'>): string =>
  canon({ s: w.setupId, c: w.controls.map(inSetup), k: { kind: w.key.kind, channel: w.key.channel, number: w.key.number } });

const isKey = (k: unknown): k is MessageKey => {
  if (typeof k !== 'object' || k === null) return false;
  const o = k as Record<string, unknown>;
  return typeof o.kind === 'string' && typeof o.channel === 'number' && (o.number === undefined || typeof o.number === 'number');
};

/** Saved ignored entries as text, read back: only well-formed entries of setups that still exist. Anything odd gives none. */
export function parseIgnored(text: string | null, config: Uc4Config): Ignored {
  if (text === null) return [];
  try {
    const o = JSON.parse(text) as unknown;
    if (!Array.isArray(o)) return [];
    const ids = new Set(config.setups.map((s) => s.id));
    const seen = new Set<string>();
    const out: IgnoredEntry[] = [];
    for (const e of o as unknown[]) {
      if (typeof e !== 'object' || e === null) continue;
      const { setupId, controls, key, signature } = e as Record<string, unknown>;
      if (typeof setupId !== 'string' || !ids.has(setupId) || !isKey(key)) continue;
      if (!Array.isArray(controls) || controls.length !== 2 || !controls.every((c) => typeof c === 'string')) continue;
      const w: IgnoredEntry = { setupId, controls: [controls[0] as string, controls[1] as string], key: { kind: key.kind, channel: key.channel, ...(key.number === undefined ? {} : { number: key.number }) }, ...(typeof signature === 'string' ? { signature } : {}) };
      const id = warningId(w);
      if (!seen.has(id)) { seen.add(id); out.push(w); }
    }
    return out;
  } catch { return []; }
}

export const stringifyIgnored = (w: Ignored): string => JSON.stringify(w);

const toIgnoredEntry = (w: Warning): IgnoredEntry => ({ setupId: w.setupId, controls: [w.controls[0], w.controls[1]], key: { ...w.key }, signature: w.signature });

/** The entry still stands for this warning: same pair and message, and (when it knows) both controls still send what they sent. */
const matches = (e: IgnoredEntry, w: Warning): boolean => warningId(e) === warningId(w) && (e.signature === undefined || e.signature === w.signature);

/**
 * Entries that still match a current warning; one saved before signatures existed takes the current one. The same array
 * comes back when nothing lapsed and nothing was upgraded. An upgrade takes the signature found at load: a range that
 * grew before the upgrade stays hidden.
 */
export function pruneIgnored(ignored: Ignored, current: readonly Warning[]): Ignored {
  if (ignored.length === 0) return ignored;
  const byId = new Map(current.map((w) => [warningId(w), w]));
  let changed = false;
  const keep: IgnoredEntry[] = [];
  for (const e of ignored) {
    const w = byId.get(warningId(e));
    if (!w || !matches(e, w)) { changed = true; continue; }
    if (e.signature === undefined) { changed = true; keep.push({ ...e, signature: w.signature }); } else keep.push(e);
  }
  return changed ? keep : ignored;
}

/** `ignored` plus these warnings (the ones already ignored are not added twice). */
export function addIgnored(ignored: Ignored, add: readonly Warning[]): Ignored {
  const fresh = add.filter((w) => !ignored.some((e) => matches(e, w)));
  return fresh.length === 0 ? ignored : [...ignored, ...fresh.map(toIgnoredEntry)];
}

export function removeIgnored(ignored: Ignored, w: Warning): Ignored {
  const id = warningId(w);
  const keep = ignored.filter((x) => warningId(x) !== id);
  return keep.length === ignored.length ? ignored : keep;
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

/** Every warning of every setup with its state. Ignored wins over factory. */
export function listWarnings(config: Uc4Config, ignored: Ignored, current: readonly Warning[] = warnings(config)): ListedWarning[] {
  return current.map((w) => ({ ...w, state: ignored.some((e) => matches(e, w)) ? 'ignored' : isFactoryLayout(config, w) ? 'factory' : 'open' }));
}
