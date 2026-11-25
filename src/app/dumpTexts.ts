// The words around kept dumps (plan 0005 step 2): list rows and the questions before a revert or a delete.
// Plain functions, tested as data. What is lost is named (UX checklist item 8).
import type { KeptDumpInfo } from '../storage/index.ts';
import type { ConfirmSpec } from './confirmSpec.ts';
import { formatExported } from './format.ts';

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Where a kept dump came from: "received from the UC4" or its file name. */
export const dumpSource = (d: KeptDumpInfo): string => (d.source === 'received' ? 'received from the UC4' : d.fileName ?? 'file');

export function revertTexts(setupName: string, dump: KeptDumpInfo): Omit<ConfirmSpec, 'run'> {
  return {
    title: `Revert "${setupName}" to its dump?`,
    body: [
      `Lost: every edit to "${setupName}" since it came from the dump (${dump.content}, ${formatExported(dump.date)}). The name stays.`,
      'You can undo this with Cmd-Z.',
    ],
    confirmLabel: 'Revert setup',
  };
}

export function deleteDumpTexts(dump: KeptDumpInfo, linkedSetups: number): Omit<ConfirmSpec, 'run'> {
  return {
    title: `Delete the kept dump (${dump.content}, ${formatExported(dump.date)})?`,
    body: [
      linkedSetups === 0
        ? 'Lost for good: the dump and its bytes. No setup is linked to it.'
        : `Lost for good: the dump and its bytes. ${plural(linkedSetups, 'setup')} can no longer be reverted to it; they keep their content.`,
      'This cannot be undone. Export the dump first if you want a copy.',
    ],
    confirmLabel: 'Delete dump',
  };
}
