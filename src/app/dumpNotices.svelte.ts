// The dump notices as Svelte state; the queue logic is in dumpNotices.ts.
import { drop, enqueue, keepExisting, type DumpNotice } from './dumpNotices.ts';

export function createNotices() {
  let queue = $state.raw<DumpNotice[]>([]);
  return {
    get queue() { return queue; },
    add(notice: DumpNotice): void { queue = enqueue(queue, notice); },
    /** After a dump was deleted from the list: its notice has nothing left to review. */
    keepOnly(keptIds: readonly string[]): void { const next = keepExisting(queue, keptIds); if (next.length !== queue.length) queue = next; },
    remove(dumpId: string): void { queue = drop(queue, dumpId); },
  };
}
export type Notices = ReturnType<typeof createNotices>;
