// What the library derives from the configuration: per-setup summaries (problem count, differs from
// factory), the export state, file names. Pure functions; no state of their own.
import { factorySetup, parseControlPath } from '../model/index.ts';
import type { ControlArea, Problem, Setup, Uc4Config } from '../model/index.ts';

export interface SetupSummary {
  id: string;
  slot?: number;
  name: string;
  /** Value problems under this setup (from `validate`). */
  problemCount: number;
  /** The setup's content (name included, id excluded) differs from the factory setup of its slot; a setup without a slot always differs. */
  differsFromFactory: boolean;
}

export interface ExportState {
  /** ISO date-time of the last export (whole or one setup), or null when never exported. */
  lastExportedAt: string | null;
  /** Like `lastExportedAt`, but only whole-configuration exports: the backup reminder ("last exported: …") should show this. */
  lastWholeExportAt: string | null;
  /** Setups whose content is not in the last export. Before the first export the factory setups count as exported. */
  changedSetups: number;
  /** `changedSetups > 0`: the "export first" rule. Undo that goes back to the exported content clears it. */
  unexportedChanges: boolean;
}

/** What was last exported: setups per slot, or null = the factory setups. Saved next to the library. */
export interface ExportBaseline { lastExportedAt: string | null; lastWholeExportAt: string | null; setups: Setup[] | null }

/** JSON with sorted keys, so equal content gives equal text whatever the key order. */
export function canon(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canon).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canon(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

// Edits keep unchanged setups as the same object, so their canonical text is computed once.
const contentCache = new WeakMap<Setup, string>();
const content = (s: Setup): string => {
  let c = contentCache.get(s);
  if (c === undefined) { c = canon({ ...s, id: undefined }); contentCache.set(s, c); }
  return c;
};
const factoryContent = new Map<number, string>();
const factoryOf = (slot: number): string => {
  let c = factoryContent.get(slot);
  if (c === undefined) { c = content(factorySetup(slot)); factoryContent.set(slot, c); }
  return c;
};
/** Setups are matched by slot (their identity on the device); a setup without a slot by its id. */
const key = (s: Setup): string => (s.slot !== undefined ? `slot:${s.slot}` : `id:${s.id}`);

export const isSlot = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 18;

export function summaries(config: Uc4Config, problems: Problem[]): SetupSummary[] {
  const counts = new Map<number, number>();
  for (const p of problems) {
    const m = /^setups\[(\d+)\]/.exec(p.path);
    if (m) counts.set(Number(m[1]), (counts.get(Number(m[1])) ?? 0) + 1);
  }
  return config.setups.map((s, i) => ({
    id: s.id,
    ...(s.slot !== undefined ? { slot: s.slot } : {}),
    name: s.name,
    problemCount: counts.get(i) ?? 0,
    differsFromFactory: !isSlot(s.slot) || content(s) !== factoryOf(s.slot),
  }));
}

export function exportState(config: Uc4Config, baseline: ExportBaseline): ExportState {
  const base = new Map<string, string>();
  if (baseline.setups) for (const s of baseline.setups) base.set(key(s), content(s));
  else for (let slot = 1; slot <= 18; slot++) base.set(`slot:${slot}`, factoryOf(slot));
  let changed = 0;
  const seen = new Set<string>();
  for (const s of config.setups) {
    seen.add(key(s));
    if (base.get(key(s)) !== content(s)) changed++;
  }
  // A setup that was exported and is gone now is a change too, except for the unexported factory
  // default: a library that is fewer than 18 setups by choice is not "changed" before any export.
  if (baseline.setups !== null) for (const k of base.keys()) if (!seen.has(k)) changed++;
  return { lastExportedAt: baseline.lastExportedAt, lastWholeExportAt: baseline.lastWholeExportAt, changedSetups: changed, unexportedChanges: changed > 0 };
}

/** The baseline after exporting `setups`: all of them (whole export) or one setup into the old baseline. */
export function baselineAfter(old: ExportBaseline, exported: Setup[], whole: boolean, at: string): ExportBaseline {
  if (whole) return { lastExportedAt: at, lastWholeExportAt: at, setups: exported };
  const base = old.setups ?? Array.from({ length: 18 }, (_, i) => factorySetup(i + 1));
  const k = key(exported[0]!);
  return { lastExportedAt: at, lastWholeExportAt: old.lastWholeExportAt, setups: [...base.filter((s) => key(s) !== k), exported[0]!] };
}

/** Local date as YYYY-MM-DD. */
export function fileDate(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Where a problem path points: the setup, and as far as it goes the group and the control. */
export function locate(path: string): {
  setupIndex: number; encoderGroup?: number; faderButtonGroup?: number; control?: { area: ControlArea; index: number };
} | null {
  const p = parseControlPath(path);
  if (!p) return null;
  return {
    setupIndex: p.setupIndex,
    ...(p.groupKey === 'encoderGroups' ? { encoderGroup: p.group! } : {}),
    ...(p.groupKey === 'faderButtonGroups' ? { faderButtonGroup: p.group! } : {}),
    ...(p.area ? { control: { area: p.area, index: p.index! } } : {}),
  };
}
