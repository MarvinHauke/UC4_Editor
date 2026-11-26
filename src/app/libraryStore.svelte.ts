// The library as Svelte state: components read `state` and call commands. No editing logic here.
import type { Warning } from '../model/index.ts';
import type { Library, LibraryState, ListedWarning, AnyControl, SelectionChange, ControlArea, ControlProperty, ControlAddress, GroupAddress, Clip, CopySource } from '../storage/index.ts';
import type { FlowLibrary } from './importFlow.ts';
import type { SyxLibrary } from './syxFlow.ts';
import { showSelection } from './warningList.ts';

export function createStore(library: Library, openMessage?: string) {
  let state = $state.raw<LibraryState>(library.getState());
  let startMessage = $state<string | undefined>(openMessage);
  // Warnings (plan 0008 step 6): the library lists every one with its state; the counts, marks and the property panel's line use the open ones of the open setup.
  let openWarnings = $state.raw<Warning[]>([]);
  let warningCache: { list: readonly ListedWarning[]; setupId: string } | null = null;
  const openOf = (s: LibraryState): void => {
    if (warningCache?.list === s.warnings && warningCache.setupId === s.selection.setupId) return;
    warningCache = { list: s.warnings, setupId: s.selection.setupId };
    openWarnings = s.warnings.filter((w) => w.setupId === s.selection.setupId && w.state === 'open');
  };
  openOf(library.getState());
  library.subscribe((s) => {
    state = s;
    openOf(s);
  });
  let exportNote = $state.raw<{ count: number; scope: string } | null>(null);
  const openCountOf = (s: LibraryState, scope: string): number => s.warnings.filter((w) => w.state === 'open' && (scope === 'all' || w.setupId === scope)).length;
  const done = <T>(r: T): T => { startMessage = undefined; exportNote = null; return r; };
  /** The commands the import and export flow needs. */
  const flow: FlowLibrary = {
    getState: () => state,
    inspectImport: (input) => library.inspectImport(input),
    importFile: (input, placement) => done(library.importFile(input, placement)),
    exportWhole: () => done(library.exportWhole()),
    exportSetup: (setupId) => done(library.exportSetup(setupId)),
  };
  /** What the `.syx` export flow needs. */
  const syxFlow: SyxLibrary = {
    getState: () => state,
    exportWhole: () => done(library.exportWhole()),
    exportSetup: (setupId) => done(library.exportSetup(setupId)),
    exportSetupSyx: (setupId) => done(library.exportSetupSyx(setupId)),
    exportAllSyx: () => done(library.exportAllSyx()),
  };
  // Dumps the UC4 sent again that were kept before: the list says so.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- $state.raw: replaced as a whole, never mutated
  let again = $state.raw<ReadonlySet<string>>(new Set());
  return {
    flow,
    syxFlow,
    /** Ids of kept dumps the UC4 sent again this session (nothing new was kept). */
    get sentAgain() { return again; },
    /** A line for the help line that stays until the next command (what a file action did). */
    say: (text: string, warnFor?: string) => { startMessage = text; exportNote = warnFor === undefined ? null : { count: openCountOf(state, warnFor), scope: warnFor }; },
    /** The export line's "n warnings" link: the open warnings of what was exported, when there are any. Goes with the line. */
    get exportNote() { return exportNote; },
    /** The open setup's OPEN warnings (not waived, not the factory layout): counts, control marks, the property panel's line. */
    get warnings() { return openWarnings; },
    /** Every warning of every setup with its state, for the Warnings dialog and `isWarned` (waived and factory still count there). */
    get allWarnings(): readonly ListedWarning[] { return state.warnings; },
    /** How many warnings of `scope` ('all' or a setup id) are open, for the export line. */
    openCount: (scope: string): number => openCountOf(state, scope),
    /** Waive (one undo step; "Send anyway" and the dialog's Waive) and unwaive. */
    waive: (list: readonly Warning[]) => done(library.waive(list)),
    unwaive: (w: Warning) => done(library.unwaive(w)),
    /** The dialog's Show: the warning's setup, groups and a control as ordinary selections (no undo step). */
    showWarning: (w: Warning, path?: string) => done(library.select(showSelection(w, path))),
    showProblem: (index: number) => done(library.selectProblem(index)),
    get state() { return state; },
    /** What `openLibrary` said on start; gone after the first command. */
    get startMessage() { return startMessage; },
    selectSetup: (setupId: string) => done(library.select({ setupId, control: null })),
    /** The switch offer's yes: setup and both groups as ONE undo step (decision 19); Back is `undo`. */
    switchTo: (target: { setupId: string; encoderGroup: number; faderButtonGroup: number }) =>
      done(library.select({ setupId: target.setupId, encoderGroup: target.encoderGroup, faderButtonGroup: target.faderButtonGroup }, { asStep: true })),
    /** Map: replaces a whole control in ONE undo entry, together with a selection change (the touched group, the control). */
    setControl: (address: ControlAddress, control: AnyControl, selection?: SelectionChange) =>
      done(library.setControl(address, control, selection ? { selection } : undefined)),
    selectGroup: (kind: 'encoder' | 'faderButton', group: number) =>
      done(library.select(kind === 'encoder' ? { encoderGroup: group } : { faderButtonGroup: group })),
    setGroupName: (encoderGroup: number, input: string) => done(library.setGroupName(state.selection.setupId, encoderGroup, input)),
    setGroupLabel: (kind: 'encoder' | 'faderButton', group: number, label: string) => done(library.setGroupLabel(state.selection.setupId, kind, group, label)),
    /** A dump the UC4 sent: kept as it came, nothing else changes (the notice asks what to do). */
    keepReceived: (bytes: Uint8Array) => {
      const r = library.keepDump(bytes, 'received');
      // eslint-disable-next-line svelte/prefer-svelte-reactivity -- replaces the raw state, never mutates
      if (r.status === 'kept' && r.duplicateOf) again = new Set([...again, r.duplicateOf.id]);
      return r;
    },
    /** What a send of the setup in `slot` would do (plan 0005 step 12): reads the kept dumps, changes and sends nothing. */
    planSend: (slot: number, options: { connectedAt: number }) => library.planSend(slot, options),
    /** The library remembers a send or restore the UC4's port accepted (plan 0005 step 14); it enables Restore. */
    recordSend: (slot: number, plan: { bytes: Uint8Array; backup: { dumpId: string; receivedAt: string } | null }) => library.recordSend(slot, plan),
    /** What restoring the slot from its backup SndA would do: reads, changes and sends nothing. */
    planRestore: (slot: number, options: { connectedAt: number }) => library.planRestore(slot, options),
    /** Kept dumps (plan 0005 step 2): export gives the bytes as they came; revert is one undo step; delete is not undoable (ask first). */
    exportDump: (dumpId: string) => library.exportDump(dumpId),
    revertSetup: (setupId: string) => done(library.revertSetup(setupId)),
    deleteDump: (dumpId: string) => done(library.deleteDump(dumpId)),
    /** Which setups need a kept dump, what "Clear old dumps" would do, and doing it (not undoable: ask first). */
    dumpNeeds: (dumpId: string) => library.dumpNeeds(dumpId),
    planClearDumps: () => library.planClearDumps(),
    clearOldDumps: () => done(library.clearOldDumps()),
    setSetupName: (setupId: string, name: string) => done(library.setSetupName(setupId, name)),
    // The setup and group are taken when the user asked, not when the confirm is answered.
    /** Every setup back to factory: one undo step, a no-op when nothing differs (plan 0006 decision 37). */
    resetAll: () => done(library.resetAll()),
    resetSetup: (setupId: string) => done(library.resetSetup(setupId)),
    resetEncoderGroup: (setupId: string, group: number) => done(library.resetEncoderGroup(setupId, group)),
    resetFaderButtonGroup: (setupId: string, group: number) => done(library.resetFaderButtonGroup(setupId, group)),
    /** Copy takes a snapshot (plan 0006 decision 35): the Clip is what a later paste puts down, whatever happens to the source. No undo step. */
    copy: (source: CopySource) => done(library.copy(source)),
    /** Paste of a Clip (decisions 30–34): each is one undo step; a refusal's reason comes back as the state's message. */
    pasteSetup: (clip: Clip, to: string) => done(library.pasteSetup(clip, to)),
    pasteEncoderGroup: (clip: Clip, to: GroupAddress) => done(library.pasteEncoderGroup(clip, to)),
    pasteFaderButtonGroup: (clip: Clip, to: GroupAddress) => done(library.pasteFaderButtonGroup(clip, to)),
    pasteControl: (clip: Clip, to: ControlAddress) => done(library.pasteControl(clip, to)),
    undo: () => done(library.undo()),
    redo: () => done(library.redo()),
    selectControl: (control: { area: ControlArea; index: number } | null) => done(library.select({ control })),
    setProperty: (area: ControlArea, group: number, index: number, property: ControlProperty, value: string | number) =>
      done(library.setProperty({ setupId: state.selection.setupId, area, group, index }, property, value)),
  };
}
export type Store = ReturnType<typeof createStore>;
