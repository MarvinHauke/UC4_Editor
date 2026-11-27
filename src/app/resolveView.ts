// How Resolve words what it would do (plan 0008 decision 32). Pure; the model's `suggest` decides the values.
import type { PlanEntry, Resolution } from '../model/index.ts';

/** `text` is the value alone ("CC 16"), null when there is no suggestion. */
export interface ResolveOption { choice: number; short: string; label: string; text: string | null; ok: boolean }

/** One option per choice: "Enc2 → CC 16", or "Enc2: No free CC" (not `ok`: nothing to apply). No choices (a stale item) give none. */
export function resolveOptions(r: Resolution): ResolveOption[] {
  return r.choices.map((c, choice) => c.suggestion
    ? { choice, short: c.short, label: `${c.short} → ${c.suggestion.text}`, text: c.suggestion.text, ok: true }
    : { choice, short: c.short, label: `${c.short}: ${c.reason ?? 'No suggestion'}`, text: null, ok: false });
}

/** A suggestion's words with the edited value in them ("CC 70" → "CC 33"): the first whole number that is the suggested one. */
export const plannedText = (text: string, suggested: number, after: number): string =>
  suggested === after ? text : text.replace(new RegExp(`(?<!\\d)${suggested}(?!\\d)`), String(after));

/** The row's picked option shows the planned After, so an edit in the Changes table is seen in the row too. */
export function withPlanned(options: ResolveOption[], r: Resolution, planned: { choice: number; entry: PlanEntry } | null): ResolveOption[] {
  if (!planned) return options;
  const suggested = (r.choices[planned.choice]?.suggestion?.change as Record<string, number | undefined> | undefined)?.[planned.entry.property];
  return options.map((o) => (o.choice === planned.choice && o.text !== null && suggested !== undefined
    ? { ...o, text: plannedText(o.text, suggested, planned.entry.after), label: `${o.short} → ${plannedText(o.text, suggested, planned.entry.after)}` }
    : o));
}
