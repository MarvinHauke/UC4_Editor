// The Resolve plan's pure part (plan 0008 decision 35): which row picked which choice, the Changes table's lines, and which controls
// to flash after Apply. The plan itself is the model's `PlanEntry` list; here each line also knows its row.
import type { PlanEntry } from '../model/index.ts';
import { FIELDS } from './profile/uc4Properties.ts';
import type { ControlAddress, ControlProperty, Selection } from '../storage/index.ts';

export interface PlanItem { rowId: string; choice: number; entry: PlanEntry }
export type Plan = readonly PlanItem[];

export const planEntries = (plan: Plan): PlanEntry[] => plan.map((i) => i.entry);
export const pickedChoice = (plan: Plan, rowId: string): number | null => plan.find((i) => i.rowId === rowId)?.choice ?? null;
export const withoutRow = (plan: Plan, rowId: string): Plan => plan.filter((i) => i.rowId !== rowId);

/** What the row's earlier pick, if any, planned: the row's entries leave before its suggestion is asked again. */
export const entriesWithout = (plan: Plan, rowId: string): PlanEntry[] => planEntries(withoutRow(plan, rowId));

/**
 * The row picks `choice` (its `entries`), replacing its earlier pick; the same choice again takes it back. A control's
 * property is planned once: another row's line for it goes, since two lines for one value would refuse each other at Apply.
 */
export function pickRow(plan: Plan, rowId: string, choice: number, entries: readonly PlanEntry[]): Plan {
  if (pickedChoice(plan, rowId) === choice) return withoutRow(plan, rowId);
  const taken = (i: PlanItem): boolean => entries.some((e) => e.path === i.entry.path && e.property === i.entry.property);
  return [...withoutRow(plan, rowId).filter((i) => !taken(i)), ...entries.map((entry) => ({ rowId, choice, entry }))];
}

export const removeAt = (plan: Plan, index: number): Plan => plan.filter((_, i) => i !== index);
export const setAfter = (plan: Plan, index: number, after: number): Plan => plan.map((it, i) => (i === index ? { ...it, entry: { ...it.entry, after } } : it));

/** The line a plan entry occupies: a control's property is planned once. */
export const lineKey = (e: Pick<PlanEntry, 'path' | 'property'>): string => `${e.path}|${e.property}`;

/** What Apply refused stays in the plan, each with its reason by line; what applied goes. */
export function keepRefused(plan: Plan, refused: readonly { entry: Pick<PlanEntry, 'path' | 'property'>; reason: string }[]): { plan: Plan; reasons: Map<string, string> } {
  const reasons = new Map(refused.map((r) => [lineKey(r.entry), r.reason] as const));
  return { plan: plan.filter((i) => reasons.has(lineKey(i.entry))), reasons };
}

const WORD: Record<PlanEntry['property'], string> = { channel: 'Channel', number: 'Number', lower: 'Lower', upper: 'Upper' };
const AREA = /\.(encoders|pushButtons|faders|buttons)\[/;
/** The property's name as the panel shows it for that kind of control ("MIDI channel", "Upper value"). */
export function propertyName(path: string, property: PlanEntry['property']): string {
  const area = AREA.exec(path)?.[1] as keyof typeof FIELDS | undefined;
  return (area && FIELDS[area].find((f) => f.key === property)?.friendly) || WORD[property];
}

export interface ChangedControl { address: ControlAddress; properties: ControlProperty[] }
/** The device view's flash targets (`control:<area>:<index>`) for what Apply changed: only controls of the open setup in the groups on show. */
export function flashTargets(changed: readonly ChangedControl[], sel: Pick<Selection, 'setupId' | 'encoderGroup' | 'faderButtonGroup'>): string[] {
  return changed
    .filter(({ address: a }) => a.setupId === sel.setupId && a.group === (a.area === 'encoders' || a.area === 'pushButtons' ? sel.encoderGroup : sel.faderButtonGroup))
    .map(({ address: a }) => `control:${a.area}:${a.index}`);
}
