// Which problems of `validate` belong to one control, by path (`setups[0].encoderGroups[2].encoders[3].number`).
import { parseControlPath, type Problem } from '../model/index.ts';
import { FIELDS } from './profile/uc4Properties.ts';

/** Problems on this control, each with the property it is about (or '' for the control itself). */
export function problemsOf(problems: Problem[], path: string): { property: string; message: string }[] {
  return problems
    .filter((p) => p.path === path || p.path.startsWith(`${path}.`))
    .map((p) => ({ property: p.path.slice(path.length + 1), message: problemText(p) }));
}

/**
 * A problem's message with the property named by its UI label: the model says "upper must be a whole
 * number 0–127", the page says "Upper value must be …". Paths and messages the page doesn't know stay as they are.
 */
export function problemText(problem: Problem): string {
  const at = parseControlPath(problem.path);
  if (!at?.area || !at.property) return problem.message;
  const field = FIELDS[at.area].find((f) => f.key === at.property);
  if (!field || !problem.message.startsWith(`${field.key} `)) return problem.message;
  return `${field.friendly} ${problem.message.slice(field.key.length + 1)}`;
}
