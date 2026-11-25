// The "Send a dump from the UC4" guide on show (plan 0010 decision 6): which choice, and whether it is open. It only listens: a dump
// arriving closes it (`close`) (the same event that raises the "Dump received" notice). Esc and Close end it too. Nothing is sent from here.
import type { SendChoice } from './profile/uc4Guides.ts';

export function createDumpGuide() {
  let open = $state(false);
  let choice = $state<SendChoice>('all');
  return {
    get open() { return open; },
    get choice() { return choice; },
    show(): void { open = true; },
    choose(next: SendChoice): void { choice = next; },
    close(): void { open = false; },
  };
}
export type DumpGuide = ReturnType<typeof createDumpGuide>;
