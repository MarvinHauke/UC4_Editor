// Import and export as a flow of questions (plan 0006 step 7): look at the file first, ask only what is
// needed, name what is lost. Plain TypeScript over the library's commands; the dialog is a callback.
import type { ExportFile, ExportResult, ImportInspection, ImportPlacement, ImportResult, LibraryState } from '../storage/index.ts';
import { UNREADABLE_TEXT } from '../storage/index.ts';
import type { ConfirmSpec, SlotOption } from './confirmSpec.ts';

export interface FlowLibrary {
  getState(): LibraryState;
  inspectImport(input: string | Uint8Array): ImportInspection;
  importFile(input: string | Uint8Array, placement?: ImportPlacement): ImportResult;
  exportWhole(): ExportResult;
  exportSetup(setupId: string): ExportResult;
}
export interface FlowUi {
  ask(spec: ConfirmSpec): void;
  download(file: ExportFile): void;
  /** A line for the help line that stays until the next command. */
  say(text: string): void;
}

const slotName = (n: number): string => `SE${String(n).padStart(2, '0')}`;
const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

function deliver(result: ExportResult, what: string, ui: FlowUi): void {
  if (!result.file) return; // refused: the library's message is on the help line
  ui.download(result.file);
  ui.say(`Exported ${what} as ${result.file.name}. It is in your browser's downloads.`);
}
export const exportAll = (lib: Pick<FlowLibrary, 'exportWhole'>, ui: FlowUi): void => { deliver(lib.exportWhole(), 'all setups', ui); };
export function exportOne(lib: Pick<FlowLibrary, 'getState' | 'exportSetup'>, ui: FlowUi): void {
  const state = lib.getState();
  const summary = state.setups.find((s) => s.id === state.selection.setupId);
  deliver(lib.exportSetup(state.selection.setupId), `"${summary?.name ?? 'setup'}"`, ui);
}

export function slotOptions(state: LibraryState): SlotOption[] {
  return Array.from({ length: 18 }, (_, i) => {
    const slot = i + 1;
    const holder = state.setups.find((s) => s.slot === slot);
    return holder
      ? { slot, label: `${slotName(slot)} · ${holder.name}`, replaces: holder.name }
      : { slot, label: `${slotName(slot)} · free` };
  });
}

/** Looks at the file's content (text or a dump's bytes) and asks what is needed before changing anything. */
export function startImport(lib: FlowLibrary, ui: FlowUi, fileName: string, text: string | Uint8Array, noun: 'file' | 'dump' = 'file'): void {
  const found = lib.inspectImport(text);
  if (found.status === 'refused') {
    ui.ask({
      title: `"${fileName}" cannot be imported`,
      body: [found.reason, found.whatToDo, 'Nothing was changed.'],
      confirmLabel: null,
      run: () => undefined,
    });
    return;
  }
  // A dump's unreadable values are shown as factory values (0005 decision 8); other problems are loaded as they are.
  const unreadable = found.problems.filter((p) => p.message.includes(UNREADABLE_TEXT)).length;
  const others = found.problems.length - unreadable;
  const problems = [
    ...(found.warnings ?? []),
    ...(unreadable > 0 ? [`${plural(unreadable, 'value')} in the dump could not be read: the factory value is shown and marked.`] : []),
    ...(others > 0 ? [`The ${noun} has ${plural(others, 'problem')}. They are loaded as they are and marked, so you can fix them.`] : []),
  ];

  if (found.status === 'whole') {
    const replace = (withWarning: boolean): ConfirmSpec => ({
      title: `Replace the whole library with "${fileName}"?`,
      body: [
        `Lost: all ${plural(lib.getState().setups.length, 'setup')} now in the editor are replaced by the ${plural(found.setups, 'setup')} in this ${noun}.`,
        ...(withWarning ? ['Some of your setups have changed since your last export; they exist only in this browser. Export first to keep a file of them.'] : []),
        ...problems,
        'You can undo the import with Cmd-Z.',
      ],
      confirmLabel: 'Replace library',
      ...(withWarning
        ? { secondary: { label: 'Export first', run: () => { exportAll(lib, ui); ui.ask(replace(false)); } } }
        : {}),
      run: () => { lib.importFile(text, { fileName }); },
    });
    ui.ask(replace(found.unexportedChanges));
    return;
  }

  // One setup: it goes to its slot; a used slot or a missing one is asked.
  if (found.slot !== undefined && !found.occupiedBy) {
    lib.importFile(text, { slot: found.slot, fileName });
    return;
  }
  const state = lib.getState();
  const options = slotOptions(state);
  const firstFree = options.find((o) => !o.replaces)?.slot;
  const current = state.setups.find((s) => s.id === state.selection.setupId)?.slot;
  ui.ask({
    title: found.occupiedBy
      ? `Slot ${found.slot} holds "${found.occupiedBy.name}". Replace it, or choose another slot?`
      : `"${found.name}" has no slot. Which slot should it go to?`,
    body: [
      `Importing "${found.name}" from "${fileName}". Choosing a slot that is used replaces that setup (named below).`,
      ...problems,
      'You can undo the import with Cmd-Z.',
    ],
    confirmLabel: 'Import',
    slots: { options, initial: found.slot ?? firstFree ?? current ?? 1 },
    run: (slot) => { lib.importFile(text, { slot: slot ?? found.slot ?? 1, replace: true, fileName }); },
  });
}
