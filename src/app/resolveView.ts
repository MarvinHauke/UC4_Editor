// How Resolve words what it would do (plan 0008 decision 32). Pure; the model's `suggest` decides the values.
import type { Resolution } from '../model/index.ts';

/** `text` is the value alone ("CC 16"), null when there is no suggestion. */
export interface ResolveOption { choice: number; short: string; label: string; text: string | null; ok: boolean }

/** One option per choice: "Enc2 → CC 16", or "Enc2: No free CC" (not `ok`: nothing to apply). No choices (a stale item) give none. */
export function resolveOptions(r: Resolution): ResolveOption[] {
  return r.choices.map((c, choice) => c.suggestion
    ? { choice, short: c.short, label: `${c.short} → ${c.suggestion.text}`, text: c.suggestion.text, ok: true }
    : { choice, short: c.short, label: `${c.short}: ${c.reason ?? 'No suggestion'}`, text: null, ok: false });
}
