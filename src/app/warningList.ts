// What the Warnings dialog lists (plan 0008 decision 25, step 6): problems first, then warnings, filtered by scope, state and control.
// Pure: the dialog renders it, the store's commands act on it.
import { isEncoderArea, type Problem, type Warning } from '../model/index.ts';
import type { ListedWarning, SelectionChange } from '../storage/index.ts';
import { nameOfPath } from '../live/mapping.ts';
import { controlPlaceOf } from './warningMarks.ts';

export type Scope = 'this' | 'all';
export interface ProblemEntry { index: number; problem: Problem }

export interface ListOptions { scope: Scope; setupId: string; setupIndex: number; control: string | null }

/** The setup a problem's path lies in, or -1. */
const problemSetup = (path: string): number => { const m = /^setups\[(\d+)\]/.exec(path); return m ? Number(m[1]) : -1; };

/** Problems (with their index in `state.problems`, which `selectProblem` takes) and warnings to list, of every state (the dialog groups them in blocks). Problems never hide (one that belongs to no setup shows in every scope), and carry no control filter. */
export function listEntries(problems: readonly Problem[], warnings: readonly ListedWarning[], o: ListOptions): { problems: ProblemEntry[]; warnings: ListedWarning[] } {
  const here = (setupId: string): boolean => o.scope === 'all' || setupId === o.setupId;
  return {
    problems: problems.map((problem, index) => ({ index, problem })).filter((e) => { const at = problemSetup(e.problem.path); return o.scope === 'all' || at === -1 || at === o.setupIndex; }),
    warnings: warnings.filter((w) =>
      here(w.setupId) && (o.control === null || w.controls.includes(o.control))),
  };
}

/** The dialog's warning blocks in order (decision 31): open, ignored, the factory layout's. */
export function blocksOf(warnings: readonly ListedWarning[]): { open: ListedWarning[]; ignored: ListedWarning[]; factory: ListedWarning[] } {
  return { open: warnings.filter((w) => w.state === 'open'), ignored: warnings.filter((w) => w.state === 'ignored'), factory: warnings.filter((w) => w.state === 'factory') };
}

/** The name of the control that is not `path` ("FAd5 · FG1"), from the control paths, not from the message text. */
export function otherName(w: Warning, path: string): string {
  const other = w.controls[0] === path ? w.controls[1] : w.controls[0];
  return nameOfPath(other) ?? w.message;
}

/** The selection that brings a warning's control(s) into view: its setup, the group of each half it lies in, and the first control. */
export function showSelection(w: Warning, path: string = w.controls[0]): SelectionChange {
  const change: SelectionChange = { setupId: w.setupId };
  for (const p of w.controls) {
    const place = controlPlaceOf(p);
    if (!place) continue;
    if (isEncoderArea(place.area)) change.encoderGroup = place.group;
    else change.faderButtonGroup = place.group;
  }
  // The chosen control's group wins when both lie in one half.
  const chosen = controlPlaceOf(path);
  if (chosen) {
    if (isEncoderArea(chosen.area)) change.encoderGroup = chosen.group;
    else change.faderButtonGroup = chosen.group;
    change.control = { area: chosen.area, index: chosen.index };
  }
  return change;
}

/** Keeps a value phrase on one line ("ch 1", "CC 70", "programs 31–41"): a no-break space after the word, so a wrapped message never leaves the number alone. Text only; the message itself is unchanged. */
export const keepValues = (text: string): string =>
  // The word joiner (U+2060) around an en dash between digits: the dash allows a break after it (UAX #14), "31–" / "41" would be cut.
  text.replace(/\b(ch|CC|programs?|notes?) (\d)/g, '$1\u00a0$2').replace(/(\d)–(\d)/g, '$1\u2060–\u2060$2');

/** A solution label ("Enc2 → programs 31–41") breaks only after the arrow: the name stays with the arrow and the whole value stays together. */
export function solutionLabel(label: string): string {
  const at = label.indexOf(' → ');
  if (at < 0) return keepValues(label);
  return `${label.slice(0, at)}\u00a0→ ${keepValues(label.slice(at + 3)).replace(/ /g, '\u00a0')}`;
}
