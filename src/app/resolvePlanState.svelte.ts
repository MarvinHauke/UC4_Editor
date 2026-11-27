// The Resolve plan as Svelte state in a context (plan 0008 decision 35): App creates it, so the plan outlives the dialog being
// closed and ends with a reload. Logic is in `resolvePlan.ts`; the library applies it.
import { getContext } from 'svelte';
import type { PlanEntry } from '../model/index.ts';
import { pickRow, planEntries, removeAt, setAfter, type Plan } from './resolvePlan.ts';

export function createResolvePlan() {
  let plan = $state.raw<Plan>([]);
  return {
    get plan() { return plan; },
    get entries(): PlanEntry[] { return planEntries(plan); },
    /** The row picks (or, picked again, drops) a choice. */
    pick(rowId: string, choice: number, entries: readonly PlanEntry[]): void { plan = pickRow(plan, rowId, choice, entries); },
    remove(index: number): void { plan = removeAt(plan, index); },
    setAfter(index: number, after: number): void { plan = setAfter(plan, index, after); },
    discard(): void { plan = []; },
  };
}
export type ResolvePlanState = ReturnType<typeof createResolvePlan>;
export const RESOLVE_PLAN_CONTEXT = Symbol('uc4-resolve-plan');
export const useResolvePlan = (): ResolvePlanState => getContext<ResolvePlanState>(RESOLVE_PLAN_CONTEXT);
