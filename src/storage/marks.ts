// Marks of unreadable dump values (plan 0005 decision 8 and 9): a value the engine could not read
// holds the factory value, which is valid, so nothing in the configuration says it was not read.
// The library keeps these marks beside the configuration, per setup id as setup-relative paths
// (`encoderGroups[0].encoders[0].type`), saves them with the library, and adds them to the
// problems. They are not part of the configuration or of the JSON export.
import type { Problem, Uc4Config } from '../model/index.ts';
import { UNREADABLE_TEXT } from './dumpImport.ts';

export type Marks = Record<string, string[]>;

/**
 * A mark carried in by a paste ends with this. It says "unreadable in some other setup's dump": the setup's own dump
 * has a real value there, so the dump's byte must not be trusted to stand in (export and send refuse it until the
 * value is set). Saved in the same text.
 */
export const PASTED = '#pasted';
export const isPasted = (mark: string): boolean => mark.endsWith(PASTED);
export const markPath = (mark: string): string => (isPasted(mark) ? mark.slice(0, -PASTED.length) : mark);
/** The marks of the setup that came with a paste. */
export const pastedMarks = (marks: Marks, setupId: string): string[] => (marks[setupId] ?? []).filter(isPasted).map(markPath);

/** Saved marks as text, read back: only setups that still exist, only text paths. Anything odd gives no marks. */
export function parseMarks(text: string | null, config: Uc4Config): Marks {
  if (text === null) return {};
  try {
    const o = JSON.parse(text) as unknown;
    if (typeof o !== 'object' || o === null || Array.isArray(o)) return {};
    const ids = new Set(config.setups.map((s) => s.id));
    const out: Marks = {};
    for (const [id, paths] of Object.entries(o)) {
      if (!ids.has(id) || !Array.isArray(paths)) continue;
      const clean = paths.filter((p): p is string => typeof p === 'string');
      if (clean.length > 0) out[id] = clean;
    }
    return out;
  } catch { return {}; }
}

/** The marks as problems, with the setup's current place in the library. */
export function markProblems(config: Uc4Config, marks: Marks): Problem[] {
  const out: Problem[] = [];
  config.setups.forEach((s, i) => {
    for (const rel of marks[s.id] ?? []) out.push({ path: `setups[${i}].${markPath(rel)}`, message: UNREADABLE_TEXT });
  });
  return out;
}

/** The marks without those of `setupId` whose path starts with `prefix` (all of the setup's when `prefix` is empty). */
export function dropMarks(marks: Marks, setupId: string, prefix = ''): Marks {
  const had = marks[setupId];
  if (!had) return marks;
  const keep = had.filter((p) => !p.startsWith(prefix));
  if (keep.length === had.length) return marks;
  const { [setupId]: _gone, ...rest } = marks;
  return keep.length > 0 ? { ...rest, [setupId]: keep } : rest;
}

export const hasMarks = (marks: Marks, setupId: string, prefix = ''): boolean => (marks[setupId] ?? []).some((p) => p.startsWith(prefix));

/** Marks from the problems a dump read gave (`setups[i].rest`), for the setups now at those places. */
export function marksFromProblems(problems: Problem[], setups: { id: string }[]): Marks {
  const out: Marks = {};
  for (const p of problems) {
    const m = /^setups\[(\d+)\]\.(.+)$/.exec(p.path);
    const setup = m ? setups[Number(m[1])] : undefined;
    if (!m || !setup || p.message !== UNREADABLE_TEXT) continue;
    (out[setup.id] ??= []).push(m[2]!);
  }
  return out;
}

/** The marks of `setupId` at exactly these paths, dropped. */
export function dropMarkPaths(marks: Marks, setupId: string, paths: string[]): Marks {
  const had = marks[setupId];
  if (!had || !had.some((p) => paths.includes(markPath(p)))) return marks;
  const keep = had.filter((p) => !paths.includes(markPath(p)));
  const { [setupId]: _gone, ...rest } = marks;
  return keep.length > 0 ? { ...rest, [setupId]: keep } : rest;
}

export const hasMarkPaths = (marks: Marks, setupId: string, paths: string[]): boolean => (marks[setupId] ?? []).some((p) => paths.includes(markPath(p)));
