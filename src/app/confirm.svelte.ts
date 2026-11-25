// One in-page confirmation at a time (UX checklist item 8): a component asks, the dialog shows it.
import type { ConfirmSpec } from './confirmSpec.ts';

export function createConfirm() {
  let current = $state.raw<ConfirmSpec | null>(null);
  return {
    get current() { return current; },
    ask(spec: ConfirmSpec): void { current = spec; },
    cancel(): void { current = null; },
    accept(slot?: number): void { const spec = current; current = null; spec?.run(slot); },
    second(): void { const spec = current; current = null; spec?.secondary?.run(); },
  };
}
export type Confirm = ReturnType<typeof createConfirm>;
