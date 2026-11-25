// `.syx` export as a flow (plan 0007 step 3.3): ask the library for the bytes, download them, or explain the refusal
// in a dialog that offers the JSON export instead. Plain TypeScript over the library's commands.
import type { SyxExportResult } from '../storage/index.ts';
import { exportAll, exportOne, type FlowLibrary, type FlowUi } from './importFlow.ts';

export interface SyxLibrary extends Pick<FlowLibrary, 'getState' | 'exportWhole' | 'exportSetup'> {
  exportSetupSyx(setupId: string): SyxExportResult;
  exportAllSyx(): SyxExportResult;
}
export interface SyxUi extends FlowUi {
  downloadBytes(name: string, bytes: Uint8Array): void;
}

function deliver(result: SyxExportResult, what: string, json: () => void, ui: SyxUi): void {
  if (result.file) {
    ui.downloadBytes(result.file.name, result.file.bytes);
    ui.say(`Exported ${what} as ${result.file.name}. It is in your browser's downloads.`);
    return;
  }
  const refusal = result.refusal;
  ui.ask({
    title: `${what[0]?.toUpperCase() ?? ''}${what.slice(1)} cannot be exported as .syx`,
    body: [refusal?.reason ?? result.message ?? 'The .syx file could not be made.', ...(refusal ? [refusal.whatToDo] : []), 'Nothing was changed and nothing was sent to the UC4.'],
    ...(refusal && refusal.fields.length > 0 ? { list: refusal.fields } : {}),
    confirmLabel: null,
    secondary: { label: 'Export as JSON instead', run: json },
    run: () => undefined,
  });
}

/** "Export all as .syx": a `SndA` of the 18 setups. */
export const exportAllSyx = (lib: SyxLibrary, ui: SyxUi): void => {
  deliver(lib.exportAllSyx(), 'all setups', () => { exportAll(lib, ui); }, ui);
};

/** "Export SEnn as .syx": a `Sndc` of the selected setup. */
export function exportOneSyx(lib: SyxLibrary, ui: SyxUi): void {
  const state = lib.getState();
  const id = state.selection.setupId;
  const name = state.setups.find((s) => s.id === id)?.name ?? 'setup';
  deliver(lib.exportSetupSyx(id), `"${name}"`, () => { exportOne(lib, ui); }, ui);
}
