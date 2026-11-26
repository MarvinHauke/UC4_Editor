// What the Warnings dialog lists (plan 0008 decision 25, step 6): problems first, then warnings, filtered by scope, state and control.
// Pure: the dialog renders it, the store's commands act on it.
import type { Problem, Warning } from '../model/index.ts';
import type { ListedWarning, SelectionChange } from '../storage/index.ts';
import { parseControlPath } from './warningMarks.ts';

export type Scope = 'this' | 'all';
export interface ProblemEntry { index: number; problem: Problem }

export interface ListOptions { scope: Scope; showWaived: boolean; setupId: string; setupIndex: number; control: string | null }

/** The setup a problem's path lies in, or -1. */
const problemSetup = (path: string): number => { const m = /^setups\[(\d+)\]/.exec(path); return m ? Number(m[1]) : -1; };

/** Problems (with their index in `state.problems`, which `selectProblem` takes) and warnings to list. Problems never hide, and carry no control filter. */
export function listEntries(problems: readonly Problem[], warnings: readonly ListedWarning[], o: ListOptions): { problems: ProblemEntry[]; warnings: ListedWarning[] } {
  const here = (setupId: string): boolean => o.scope === 'all' || setupId === o.setupId;
  return {
    problems: problems.map((problem, index) => ({ index, problem })).filter((e) => o.scope === 'all' || problemSetup(e.problem.path) === o.setupIndex),
    warnings: warnings.filter((w) =>
      here(w.setupId) && (o.showWaived || w.state === 'open') && (o.control === null || w.controls.includes(o.control))),
  };
}

/** How many waived and factory warnings the filter hides (the toggle says so). */
export function hiddenCount(warnings: readonly ListedWarning[], o: Pick<ListOptions, 'scope' | 'setupId'>): number {
  return warnings.filter((w) => (o.scope === 'all' || w.setupId === o.setupId) && w.state !== 'open').length;
}

/** The two names in a warning's message ("Enc3 · EG1 and FAd5 · FG2 both send …"), in the order of `controls`. */
export function controlNames(w: Pick<Warning, 'message'>): [string, string] | null {
  const m = /^(.+?) and (.+?) both send /.exec(w.message);
  return m ? [m[1]!, m[2]!] : null;
}

/** The name of the control that is not `path`. */
export function otherName(w: Warning, path: string): string {
  const names = controlNames(w);
  if (!names) return w.message;
  return w.controls[0] === path ? names[1] : names[0];
}

/** The selection that brings a warning's control(s) into view: its setup, the group of each half it lies in, and the first control. */
export function showSelection(w: Warning, path: string = w.controls[0]): SelectionChange {
  const change: SelectionChange = { setupId: w.setupId };
  for (const p of w.controls) {
    const place = parseControlPath(p);
    if (!place) continue;
    if (place.area === 'encoders' || place.area === 'pushButtons') change.encoderGroup = place.group;
    else change.faderButtonGroup = place.group;
  }
  // The chosen control's group wins when both lie in one half.
  const chosen = parseControlPath(path);
  if (chosen) {
    if (chosen.area === 'encoders' || chosen.area === 'pushButtons') change.encoderGroup = chosen.group;
    else change.faderButtonGroup = chosen.group;
    change.control = { area: chosen.area, index: chosen.index };
  }
  return change;
}
