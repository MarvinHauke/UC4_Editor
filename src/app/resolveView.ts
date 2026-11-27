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

export interface TextEdit { property: PlanEntry['property']; suggested: number; after: number }

/**
 * A suggestion's words with the edited values in them ("CC 9 on ch 2": the channel is the number after "ch", the others the
 * first other number equal to what was suggested). All edits are placed on the original text, so one never lands on another.
 */
export function plannedText(text: string, edits: readonly TextEdit[]): string {
  const found: { at: number; len: number; to: string }[] = [];
  for (const e of edits) {
    if (e.suggested === e.after) continue;
    const re = e.property === 'channel' ? new RegExp(`(?<=ch )${e.suggested}(?!\\d)`) : new RegExp(`(?<!ch )(?<!\\d)${e.suggested}(?!\\d)`);
    const m = re.exec(text);
    if (m && !found.some((f) => f.at === m.index)) found.push({ at: m.index, len: String(e.suggested).length, to: String(e.after) });
  }
  return found.sort((a, b) => b.at - a.at).reduce((t, f) => t.slice(0, f.at) + f.to + t.slice(f.at + f.len), text);
}

/** The row's picked option shows the planned After(s), so an edit in the Changes table is seen in the row too. */
export function withPlanned(options: ResolveOption[], r: Resolution, planned: { choice: number; entries: readonly PlanEntry[] } | null): ResolveOption[] {
  if (!planned) return options;
  const change = (r.choices[planned.choice]?.suggestion?.change ?? {}) as Record<string, number | undefined>;
  const edits = planned.entries.flatMap((e) => (change[e.property] === undefined ? [] : [{ property: e.property, suggested: change[e.property]!, after: e.after }]));
  return options.map((o) => {
    if (o.choice !== planned.choice || o.text === null) return o;
    const text = plannedText(o.text, edits);
    return { ...o, text, label: `${o.short} → ${text}` };
  });
}
