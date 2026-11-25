// The queue behind the dump notice (plan 0005 step 4, decisions 4 and 10): dumps the UC4 sent wait here until the user
// reviews or dismisses them. Pure, so it is tested without a component. The dump itself stays kept either way.
import type { KeepResult } from '../storage/index.ts';
import type { FlowLibrary } from './importFlow.ts';
import { formatExported } from './format.ts';

export interface DumpNotice {
  dumpId: string;
  /** What arrived: `SE16`, `all 18 setups`, or `unreadable dump`. */
  content: string;
  warnings: string[];
  /** Set when the engine could not read the dump: the notice offers Export instead of Review. */
  unreadable?: { reason: string; whatToDo: string };
  /** Set when these bytes were kept before: the notice says "same as the dump of <date>". */
  duplicateOf?: { id: string; date: string };
}

/** "same as the dump of 2026-11-16 10:30": the date is the kept dump's, in local time. */
export const sameAs = (date: string): string => `same as the dump of ${formatExported(date)}`;

/** The notice for a kept dump, or null when the library refused the message (it is not a dump). */
export function noticeOf(result: KeepResult): DumpNotice | null {
  if (result.status !== 'kept') return null;
  return {
    dumpId: result.dump.id, content: result.content, warnings: result.warnings,
    ...(result.unreadable ? { unreadable: result.unreadable } : {}),
    ...(result.duplicateOf ? { duplicateOf: result.duplicateOf } : {}),
  };
}

/** Adds a notice at the end; the same kept dump arriving again is one notice, not two. */
export const enqueue = (queue: readonly DumpNotice[], notice: DumpNotice): DumpNotice[] =>
  queue.some((n) => n.dumpId === notice.dumpId) ? (queue as DumpNotice[]) : [...queue, notice];

/** Removes one notice (reviewed or dismissed). */
export const drop = (queue: readonly DumpNotice[], dumpId: string): DumpNotice[] => queue.filter((n) => n.dumpId !== dumpId);

/** The line the notice shows: the first in the queue, and how many more wait. */
export function noticeText(queue: readonly DumpNotice[]): string {
  const first = queue[0];
  if (!first) return '';
  const more = queue.length > 1 ? ` (+${queue.length - 1} more)` : '';
  const same = first.duplicateOf ? `, ${sameAs(first.duplicateOf.date)}` : '';
  return first.unreadable
    ? `Dump received but unreadable: ${first.unreadable.reason}${same}${more}`
    : `Dump received: ${first.content}${same}${more}`;
}

/**
 * The import flow's library, with a hook: `onImported` runs only when an import really happened, so a Cancel leaves the
 * notice in place ("nothing changes until the user decides", and the notice is the way back to the dump).
 */
export function withImportHook(lib: FlowLibrary, onImported: () => void): FlowLibrary {
  return {
    getState: () => lib.getState(),
    inspectImport: (input) => lib.inspectImport(input),
    importFile: (input, placement) => {
      const result = lib.importFile(input, placement);
      if (result.status === 'imported') onImported();
      return result;
    },
    exportWhole: () => lib.exportWhole(),
    exportSetup: (id) => lib.exportSetup(id),
  };
}

/** The notices whose dump is still kept: a deleted dump has nothing to review or export. */
export const keepExisting = (queue: readonly DumpNotice[], keptIds: readonly string[]): DumpNotice[] =>
  queue.filter((n) => keptIds.includes(n.dumpId));
