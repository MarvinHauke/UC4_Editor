// Which problems of `validate` belong to one control, by path (`setups[0].encoderGroups[2].encoders[3].number`).
import type { Problem } from '../model/index.ts';
import type { ControlArea } from '../storage/index.ts';
import { FIELDS } from './profile/uc4Properties.ts';

const GROUP_KEY: Record<ControlArea, string> = {
  encoders: 'encoderGroups', pushButtons: 'encoderGroups', faders: 'faderButtonGroups', buttons: 'faderButtonGroups',
};

export function controlPath(setupIndex: number, area: ControlArea, group: number, index: number): string {
  return `setups[${setupIndex}].${GROUP_KEY[area]}[${group}].${area}[${index}]`;
}

/** Problems on this control, each with the property it is about (or '' for the control itself). */
export function problemsOf(problems: Problem[], path: string): { property: string; message: string }[] {
  return problems
    .filter((p) => p.path === path || p.path.startsWith(`${path}.`))
    .map((p) => ({ property: p.path.slice(path.length + 1), message: problemText(p) }));
}

const AREAS: readonly ControlArea[] = ['encoders', 'pushButtons', 'faders', 'buttons'];

/**
 * A problem's message with the property named by its UI label: the model says "upper must be a whole
 * number 0–127", the page says "Upper value must be …". Paths and messages the page doesn't know stay as they are.
 */
export function problemText(problem: Problem): string {
  const m = /\.(encoders|pushButtons|faders|buttons)\[\d+\]\.(\w+)$/.exec(problem.path);
  if (!m) return problem.message;
  const field = FIELDS[m[1] as ControlArea].find((f) => f.key === m[2]);
  if (!field || !problem.message.startsWith(`${field.key} `)) return problem.message;
  return `${field.friendly} ${problem.message.slice(field.key.length + 1)}`;
}
