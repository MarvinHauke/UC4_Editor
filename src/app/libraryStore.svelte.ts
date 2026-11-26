// The library as Svelte state: components read `state` and call commands. No editing logic here.
import type { Warning } from '../model/index.ts';
import type { Library, LibraryState, ControlArea, ControlProperty, ControlAddress, GroupAddress, Clip, CopySource } from '../storage/index.ts';
import type { FlowLibrary } from './importFlow.ts';
import type { SyxLibrary } from './syxFlow.ts';
import { problemText } from './controlProblems.ts';
import { problemKey, relocate } from './problemCursor.ts';
import { parseControlPath, relocateWarning, setupWarnings, warningKey } from './warningMarks.ts';

export function createStore(library: Library, openMessage?: string) {
  let state = $state.raw<LibraryState>(library.getState());
  let startMessage = $state<string | undefined>(openMessage);
  // The problem stepper's place lives here, so it survives anything the page does around it.
  let problemAt = $state(-1);
  let problemId: string | null = null;
  const remember = (at: number): void => {
    problemAt = at;
    const p = state.problems[at];
    problemId = p ? problemKey(p) : null;
  };
  // Warnings of the open setup (plan 0008 step 5): not problems, so they have their own stepper and never block.
  let warningAt = $state(-1);
  let warningId: string | null = null;
  let warningCache: { configuration: unknown; setupId: string; list: Warning[] } | null = null;
  const warningsOpen = (s: LibraryState): Warning[] => {
    if (warningCache?.configuration !== s.configuration || warningCache.setupId !== s.selection.setupId) {
      warningCache = { configuration: s.configuration, setupId: s.selection.setupId, list: setupWarnings(s.configuration, s.selection.setupId) };
    }
    return warningCache.list;
  };
  const rememberWarning = (at: number, list: Warning[]): void => { warningAt = at; const w = list[at]; warningId = w ? warningKey(w) : null; };
  let openWarnings = $state.raw<Warning[]>(warningsOpen(state));
  library.subscribe((s) => {
    state = s;
    remember(relocate(s.problems, problemAt, problemId));
    openWarnings = warningsOpen(s);
    rememberWarning(relocateWarning(openWarnings, warningAt, warningId), openWarnings);
  });
  const done = <T>(r: T): T => { startMessage = undefined; return r; };
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
  let again = $state.raw<ReadonlySet<string>>(new Set());
  return {
    flow,
    syxFlow,
    /** Ids of kept dumps the UC4 sent again this session (nothing new was kept). */
    get sentAgain() { return again; },
    /** A line for the help line that stays until the next command (what a file action did). */
    say: (text: string) => { startMessage = text; },
    /** Which problem the stepper is on (0-based), or -1 before the first step. */
    get problemAt() { return problemAt; },
    /** Steps to the next or previous problem (wrapping), selects it and says what it is. */
    stepProblem(delta: 1 | -1): void {
      const problems = state.problems;
      if (problems.length === 0) return;
      remember(problemAt < 0 ? (delta === 1 ? 0 : problems.length - 1) : (problemAt + delta + problems.length) % problems.length);
      done(library.selectProblem(problemAt));
      startMessage = `Problem ${problemAt + 1} of ${problems.length}: ${problemText(problems[problemAt]!)}`;
    },
    /** The open setup's warnings, in the model's order (`visibleWarnings` is where waivers will filter, step 6). */
    get warnings() { return openWarnings; },
    /** Which warning the stepper is on (0-based), or -1 before the first step. */
    get warningAt() { return warningAt; },
    /** Steps to the next or previous warning of the open setup (wrapping) and selects its first control, switching groups as needed. */
    stepWarning(delta: 1 | -1): void {
      const list = openWarnings;
      if (list.length === 0) return;
      const at = warningAt < 0 ? (delta === 1 ? 0 : list.length - 1) : (warningAt + delta + list.length) % list.length;
      rememberWarning(at, list);
      const w = list[at]!;
      // Both controls come into view: each one's group is shown (the two sit in different halves, or in one group), the first is selected.
      const places = w.controls.map(parseControlPath);
      for (const ref of [...places].reverse()) {
        if (!ref) continue;
        const upper = ref.area === 'encoders' || ref.area === 'pushButtons';
        library.select(upper ? { encoderGroup: ref.group } : { faderButtonGroup: ref.group });
      }
      const first = places[0];
      if (first) library.select({ control: { area: first.area, index: first.index } });
      startMessage = `Warning ${at + 1} of ${list.length}: ${w.message}`;
    },
    get state() { return state; },
    /** What `openLibrary` said on start; gone after the first command. */
    get startMessage() { return startMessage; },
    selectSetup: (setupId: string) => done(library.select({ setupId, control: null })),
    selectGroup: (kind: 'encoder' | 'faderButton', group: number) =>
      done(library.select(kind === 'encoder' ? { encoderGroup: group } : { faderButtonGroup: group })),
    setGroupName: (encoderGroup: number, input: string) => done(library.setGroupName(state.selection.setupId, encoderGroup, input)),
    setGroupLabel: (kind: 'encoder' | 'faderButton', group: number, label: string) => done(library.setGroupLabel(state.selection.setupId, kind, group, label)),
    /** A dump the UC4 sent: kept as it came, nothing else changes (the notice asks what to do). */
    keepReceived: (bytes: Uint8Array) => {
      const r = library.keepDump(bytes, 'received');
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
