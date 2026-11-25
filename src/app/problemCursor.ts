// Where the status bar's problem stepper stands when the problem list changes (story 25: "fix them all").
import type { Problem } from '../model/index.ts';

/** A problem's identity across list changes. */
export const problemKey = (p: Problem): string => `${p.path}\u0000${p.message}`;

/**
 * The stepper's new index after the list changed. `at` is the old index (-1: not started), `key` the
 * problem it pointed at. The same problem keeps its place; a fixed one steps back by one, so the next
 * step lands on the problem that came after it; an empty list resets.
 */
export function relocate(problems: Problem[], at: number, key: string | null): number {
  if (problems.length === 0 || at < 0 || key === null) return -1;
  const found = problems.findIndex((p) => problemKey(p) === key);
  if (found >= 0) return found;
  return Math.min(at - 1, problems.length - 1);
}
