// The library module (plan 0006 step 1): the only thing that changes the configuration.
// Plain TypeScript, no Svelte, no DOM. It holds the configuration, the selection, the undo history
// and the save status, runs every command, and saves after each one. Components subscribe and call
// commands; they hold no editing logic. A command never throws: a refused one changes nothing and
// returns a message for the help line.
//
// Later steps (plan 0006 step 3) add import/export, the export state and resets as more commands
// and more fields on `LibraryState`; nothing here has to change shape for them.
import {
  BUTTON_MODES, ENCODER_DISPLAYS, ENCODER_MODES, ENCODER_TYPES, FADER_DISPLAYS, FADER_MODES, FADER_TYPES,
  FORMAT, GREEN_DISPLAYS, GREEN_TYPES, PUSH_TYPES, SCHEMA_VERSION,
  changeType, factorySetup, load, normalizeGroupName, save, validate,
} from '../model/index.ts';
import type { Encoder, EncoderGroup, Fader, FaderButtonGroup, GreenButton, Problem, PushButton, Setup, Uc4Config } from '../model/index.ts';
import { IMPORT_READS, describeSlots, looksLikeDump, readDump, slotName } from './dumpImport.ts';
import { markPath, pastedMarks, PASTED, dropMarkPaths, dropMarks, hasMarkPaths, hasMarks, markProblems, marksFromProblems, parseMarks } from './marks.ts';
import type { Marks } from './marks.ts';
import { StorageBusyError, type LibraryStorage, type StoredDump } from './storage.ts';
import { changesBetween, freshBackup } from './sendPlan.ts';
import { chooseBackup, newerStates, type LastSend, type RestorePlan, type SentInfo } from './restorePlan.ts';
import type { SendBackup, SendBase, SendPlan } from './sendPlan.ts';
import { uc4Engine } from '../protocol/engine.ts';
import { faderfoxUc4 } from '../protocol/profiles/uc4.ts';
import { buildSyx, JSON_INSTEAD, JSON_OR, type SyxBuild, type SyxRefusal, type SyxSetup } from './syxExport.ts';
import { ENGINE_VERSION } from '../protocol/engine.ts';
import type { RawDump } from '../protocol/types.ts';
import { baselineAfter, canon, exportState, fileDate, isSlot, locate, summaries } from './libraryInfo.ts';
import type { ExportBaseline, ExportState, SetupSummary } from './libraryInfo.ts';
import { dumpNeeds, planClearOldDumps } from './keptDumpPlan.ts';
import type { ClearPlan, DumpNeed } from './keptDumpPlan.ts';

export type ControlArea = 'encoders' | 'pushButtons' | 'faders' | 'buttons';
export type ControlProperty = 'label' | 'display' | 'type' | 'mode' | 'channel' | 'number' | 'lower' | 'upper';

/** A control: which setup, which kind, which group (0–7) and which control in it (0-based). */
export interface ControlAddress { setupId: string; area: ControlArea; group: number; index: number }

/** A group: which setup and which group (0–7) in the area the command names. */
export interface GroupAddress { setupId: string; group: number }

/** What `copy` takes: a setup, a group of one area (encoders or faders/buttons) or one control. */
export type CopySource =
  | { kind: 'setup'; setupId: string }
  | { kind: 'encoderGroup' | 'faderButtonGroup'; setupId: string; group: number }
  | ({ kind: 'control' } & ControlAddress);

/**
 * A snapshot taken at Copy (plan 0006 decision 35): an immutable value, deeply frozen, holding the item as it was with its
 * labels and its unreadable marks as a paste would carry them (`#pasted`). Later edits to the source do not change it.
 * The UI holds it and hands it to a paste; `kind` says which paste takes it, `from` where it came from, `sourceName` the
 * setup's name then.
 */
export type Clip = Readonly<
  { from: CopySource; sourceName: string; marks: readonly string[] } & (
    | { kind: 'setup'; encoderGroups: readonly EncoderGroup[]; faderButtonGroups: readonly FaderButtonGroup[] }
    | { kind: 'encoderGroup'; group: EncoderGroup }
    | { kind: 'faderButtonGroup'; group: FaderButtonGroup }
    | { kind: 'control'; area: ControlArea; control: Encoder | PushButton | GreenButton | Fader }
  )
>;
export type CopyResult = CommandResult & { clip?: Clip };

export interface Selection {
  setupId: string;
  /** Upper area: 0–7. Independent of `faderButtonGroup`. */
  encoderGroup: number;
  /** Lower area: 0–7. */
  faderButtonGroup: number;
  /** The control being edited in the property panel, or null. Its group is the one shown in its area. */
  control: { area: ControlArea; index: number } | null;
}

/** A kept dump as the list shows it: the bytes stay inside the library (`exportDump`). */
export interface KeptDumpInfo {
  id: string;
  /** ISO 8601: when the editor kept it. */
  date: string;
  source: 'file' | 'received';
  fileName?: string;
  /** `all`: a SndA; `one`: a Sndc. */
  type: 'all' | 'one' | 'unknown';
  slots: number[];
  firmware: string;
  /** Set when the engine could not read it: the dump is only kept, exportable and deletable. */
  unreadable?: { reason: string; whatToDo: string };
  /** What it holds, in words: `SE16` or `all 18 setups`; `unreadable dump` when the engine refused it. */
  content: string;
  /** Size in bytes. */
  size: number;
}

/** A dump to download: the bytes exactly as they came. */
export interface DumpFile { name: string; bytes: Uint8Array }
export type DumpExportResult = CommandResult & { file?: DumpFile };
/** A generated `.syx` (plan 0007 step 3.2). `file` is absent when refused: then `refusal` says why, in the device's words, and what to do. */
export type SyxExportResult = DumpExportResult & { refusal?: SyxRefusal };

/** What `keepDump` says: what the dump notice needs (plan 0005 step 4). */
export type KeepResult =
  | { status: 'refused'; reason: string; whatToDo: string }
  /** `unreadable` is set when the engine refused a received dump: it is kept all the same (decision 10); show the reason. */
  /** `duplicateOf`: these bytes were kept before (that dump, from that date): nothing new was kept, say "same as the dump of <date>". */
  | { status: 'kept'; dump: KeptDumpInfo; content: string; slots: number[]; warnings: string[]; unreadable?: { reason: string; whatToDo: string }; duplicateOf?: { id: string; date: string } };

export type SaveStatus = 'saving' | 'saved' | 'failed';

export interface LibraryState {
  configuration: Uc4Config;
  selection: Selection;
  /** Value problems of the whole configuration, from `validate`. */
  problems: Problem[];
  /** One entry per setup, in library order: slot, name, problem count, differs from factory. */
  setups: SetupSummary[];
  /** Last export date and the changes since (the "export first" rule). */
  exportState: ExportState;
  /** Anything differs from the factory configuration: not exactly the 18 factory slots in order, content or names changed, or unreadable marks. `resetAll` is a no-op when false. */
  differsFromFactory: boolean;
  /** Kept dumps, newest first. */
  dumps: KeptDumpInfo[];
  /** Which kept dump each setup came from (setup id → dump id). A linked setup can be reverted to it. */
  dumpLinks: Record<string, string>;
  /** The last send per slot (1–18): when, and the backup `SndA` it named. Offers Restore next to "Sent SE05". Not part of the uc4-config JSON. */
  lastSends: Record<number, SentInfo>;
  canUndo: boolean;
  canRedo: boolean;
  saveStatus: SaveStatus;
  /** What the last command said for the help line; cleared by the next command. */
  message?: string;
}

export interface CommandResult { state: LibraryState; message?: string }

/** A file the UI offers for download; the library only makes the name and the text. */
export interface ExportFile { name: string; text: string }
/** `file` is absent when the export was refused (see `message`). Exporting counts as "exported" at once. */
export type ExportResult = CommandResult & { file?: ExportFile };

/** What an import file would do, without doing it; the UI asks the user from this. */
/** `warnings`: what to tell the user though the import works (a dump from unknown firmware). */
export type ImportInspection =
  | { status: 'refused'; reason: string; whatToDo: string }
  /** A file with 2 or more setups (or a library-sized one): replaces the whole library. */
  | { status: 'whole'; setups: number; problems: Problem[]; unexportedChanges: boolean; warnings?: string[] }
  /** A file with one setup: goes to a slot. `slot` is the file's own, if it has one. */
  | { status: 'setup'; name: string; slot?: number; problems: Problem[]; occupiedBy?: { id: string; name: string }; freeSlots: number[]; warnings?: string[] };

/** Where a one-setup file goes: the chosen slot (default: the file's) and whether it may replace what is there. */
/** `fileName` is kept with a dump imported from a file. */
export interface ImportPlacement { slot?: number; replace?: boolean; fileName?: string }

export type ImportResult = CommandResult & (
  | { status: 'refused'; reason: string; whatToDo: string }
  /** The one-setup file has no slot and none was chosen. Ask, then call again with `slot`. */
  | { status: 'needs-slot' }
  /** The slot is used. Ask "replace, or another slot?", then call again with `replace: true` or another `slot`. */
  | { status: 'slot-occupied'; slot: number; occupiedBy: { id: string; name: string } }
  | { status: 'imported'; kind: 'whole' | 'setup'; slot?: number; problemCount: number }
);

export interface Library {
  getState(): LibraryState;
  /** Calls `listener` at once with the current state and after every change. Returns the unsubscribe. */
  subscribe(listener: (state: LibraryState) => void): () => void;
  select(change: Partial<Omit<Selection, 'control'>> & { control?: Selection['control'] }): CommandResult;
  setProperty(address: ControlAddress, property: ControlProperty, value: string | number): CommandResult;
  /** `input` is what was typed; it is cleaned and padded to 4 characters (`normalizeGroupName`). */
  setGroupName(setupId: string, encoderGroup: number, input: string): CommandResult;
  /** The free-text label of an encoder group or a fader/button group (editor-only); `''` removes it. */
  setGroupLabel(setupId: string, kind: 'encoder' | 'faderButton', group: number, label: string): CommandResult;
  setSetupName(setupId: string, name: string): CommandResult;
  undo(): CommandResult;
  redo(): CommandResult;
  /** Selects what problem number `index` of `state.problems` points at (setup, group, control). */
  selectProblem(index: number): CommandResult;

  /** Looks at a file; changes nothing. JSON as text (or as bytes), a `.syx` dump as bytes. */
  inspectImport(input: string | Uint8Array): ImportInspection;
  /** Imports a file through `load`. Whole file: replaces the library. One setup: into a slot. One undo step. */
  importFile(input: string | Uint8Array, placement?: ImportPlacement): ImportResult;
  /** The whole configuration as `uc4-config-YYYY-MM-DD.json`. Marks everything as exported. */
  exportWhole(): ExportResult;
  /** One setup as a file with one setup, slot kept: `uc4-setup-05-YYYY-MM-DD.json` (`uc4-setup-YYYY-MM-DD.json` without a slot). */
  exportSetup(setupId: string): ExportResult;

  /**
   * Keeps a dump unchanged beside the library without importing it (no undo step, no link). For a dump
   * received over Web MIDI (`source: 'received'`): returns what the notice shows. Refuses what is not a
   * readable dump. The same bytes kept twice are one kept dump.
   */
  keepDump(bytes: Uint8Array, source: 'file' | 'received', fileName?: string): KeepResult;
  /** A kept dump as a `.syx` file, the bytes unchanged: `uc4-SE16-2026-11-15.syx`, `uc4-all-2026-11-15.syx`. */
  exportDump(dumpId: string): DumpExportResult;
  /**
   * One setup as a `Sndc` at its own slot (decisions 8–14): `uc4-SE01-2026-11-16-engine0.9.0.syx`, or the plain kept-dump
   * name when the bytes equal a kept dump. Nothing is sent. No file, with `refusal`, for a setup without a slot, an
   * unconfirmed edit, unreadable dump values or a Sndc that cannot be built; the file is read back before it is offered.
   */
  exportSetupSyx(setupId: string): SyxExportResult;
  /**
   * What sending the setup of `slot` to the UC4 would do (plan 0005 steps 12, 13b; decisions 30, 31): the `Sndc` built
   * on the fresh `SndA`'s part for the slot, else on the setup's linked `Sndc`, else on the factory setup (`base` says
   * which), the changes against that base in the device's words, and the backup `SndA` received at or after
   * `connectedAt` (ms since the epoch, `connection.connectedAt`), or `backup: null` without one. Refuses with
   * `cannot build` (no slot, values the editor could not read) or `cannot send` (the engine's refusal, in send words).
   * Changes nothing and sends nothing; the UI passes `bytes` to `connection.sendDump`.
   */
  planSend(slot: number, options: { connectedAt: number }): SendPlan;
  /**
   * Remembers that `plan.bytes` went to the UC4 as the setup of `slot` (the UI calls it after a send that was
   * accepted): the time, the bytes and the backup the plan named. The next send of the slot replaces it. Not an undo step.
   */
  recordSend(slot: number, plan: { bytes: Uint8Array; backup: SendBackup | null }): CommandResult;
  /**
   * What restoring the old setup of `slot` would do (plan 0005 step 14): its records cut unchanged from a kept `SndA`
   * the UC4 sent, as a `Sndc` to send like any other. The backup is the one the last send of the slot named, else the
   * newest `SndA` received at or after `connectedAt`. `changes` lists what it puts back against what the UC4 holds now
   * as far as the editor knows (the last sent bytes, or a `SndA` received after the backup). The library's setup is not
   * changed. Refuses with `no backup` or `cannot restore`, in send words. Sends nothing.
   */
  planRestore(slot: number, options: { connectedAt: number }): RestorePlan;
  /** All 18 setups as a `SndA` (each slot exactly one setup): `uc4-all-2026-11-16-engine0.9.0.syx`. Same refusals and read-back. */
  exportAllSyx(): SyxExportResult;
  /** The setup's content from the dump it came from, name kept; marks re-derived. One undo step. */
  revertSetup(setupId: string): CommandResult;
  /** Deletes a kept dump and the links to it; setups stay as they are, but cannot be reverted. Not an undo step. The UI asks first. */
  deleteDump(dumpId: string): CommandResult;
  /** The setups that need a kept dump and for what (revert, `.syx` export): what the delete question names. Empty when none does. */
  dumpNeeds(dumpId: string): DumpNeed[];
  /** What "Clear old dumps" would do: per kept dump, newest first, keep or delete and why. Changes nothing. */
  planClearDumps(): ClearPlan;
  /**
   * Runs the plan: deletes the dumps it lists. Not an undo step (like `deleteDump`), so the UI shows the plan and asks first.
   * The plan is made again at the call, so a dump that became needed since stays.
   */
  clearOldDumps(): CommandResult;

  /** Back to the factory setup of its slot (name included). One undo step. */
  resetSetup(setupId: string): CommandResult;
  /**
   * All 18 slots back to the factory setups (names, labels, notes included; SE17/SE18 the Ableton setups), unreadable marks
   * cleared. Links to kept dumps stay, as in resetSetup ("Revert to its dump" remains a way back). Kept dumps and last sends stay; the
   * UC4 is not touched. One undo step; a library that already is factory is no change and no undo step. The UI asks first.
   */
  resetAll(): CommandResult;
  resetEncoderGroup(setupId: string, group: number): CommandResult;
  resetFaderButtonGroup(setupId: string, group: number): CommandResult;
  /**
   * Copy / Paste (plan 0006 decisions 32, 33, 35; glossary: the editor's action, never the device's copy buffer).
   * `copy` takes a snapshot (a `Clip`, no undo step, the library is unchanged); a refusal comes back as the message with no
   * clip. A paste takes the Clip and a target: each is one undo step, changes the library only, and refuses with a reason,
   * never throwing, when the Clip is of another kind or area. Pasting a Clip onto where it was taken from while that is
   * unchanged, or onto an identical target, changes nothing and is no undo step. Unreadable marks: the target's are dropped
   * where it is overwritten, the Clip's are carried along. The target's dump link stays (decoded bytes then differ from the
   * dump, which the export/send diff shows).
   */
  copy(source: CopySource): CopyResult;
  /** Every control, group names, group labels and control labels. The target keeps its id, slot, name and notes. */
  pasteSetup(clip: Clip, toSetupId: string): CommandResult;
  /** 8 encoders, 8 push buttons, the name and the label of a group (0–7), in any setup. */
  pasteEncoderGroup(clip: Clip, to: GroupAddress): CommandResult;
  /** 8 faders, fader 9, 8 green buttons and the label of a group (0–7), in any setup. There is no cross-area paste. */
  pasteFaderButtonGroup(clip: Clip, to: GroupAddress): CommandResult;
  /**
   * All properties and the label, onto a control of the same kind: encoder → encoder, push button → push button,
   * green button → green button, fader → fader. Fader 9 (index 8) is its own kind: only onto fader 9, and faders 1–8
   * only onto faders 1–8.
   */
  pasteControl(clip: Clip, to: ControlAddress): CommandResult;
  /** Resolves when every save started so far has finished (succeeded or failed). */
  whenSaved(): Promise<void>;
}

export interface OpenOptions { now?: () => Date }
export interface Opened { library: Library; message?: string }

/** How many steps undo remembers. */
export const HISTORY_LIMIT = 200;

const CHOICES: Record<ControlArea, Partial<Record<ControlProperty, readonly string[]>>> = {
  encoders: { display: ENCODER_DISPLAYS, type: ENCODER_TYPES, mode: ENCODER_MODES },
  pushButtons: { type: PUSH_TYPES, mode: BUTTON_MODES },
  buttons: { display: GREEN_DISPLAYS, type: GREEN_TYPES, mode: BUTTON_MODES },
  faders: { display: FADER_DISPLAYS, type: FADER_TYPES, mode: FADER_MODES },
};
const NUMBERS: readonly ControlProperty[] = ['channel', 'number', 'lower', 'upper'];
const AREA_COUNT: Record<ControlArea, number> = { encoders: 8, pushButtons: 8, faders: 9, buttons: 8 };
const AREA_NAME: Record<ControlArea, string> = { encoders: 'encoder', pushButtons: 'push button', faders: 'fader', buttons: 'green button' };
const isEncoderArea = (a: ControlArea): boolean => a === 'encoders' || a === 'pushButtons';
const isGroup = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 0 && (n as number) < 8;

const KIND_NAME = { setup: 'setup', encoderGroup: 'encoder group', faderButtonGroup: 'fader/button group', control: 'control' } as const;
const KIND_ONTO = { setup: 'a setup', encoderGroup: 'an encoder group', faderButtonGroup: 'a fader/button group', control: 'a control' } as const;
function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}
type AnyControl = Encoder | PushButton | GreenButton | Fader;

function freshConfiguration(now: Date): Uc4Config {
  const stamp = now.toISOString();
  return {
    format: FORMAT, schemaVersion: SCHEMA_VERSION, device: { profile: 'faderfox-uc4' },
    createdAt: stamp, updatedAt: stamp,
    setups: Array.from({ length: 18 }, (_, i) => factorySetup(i + 1)),
  };
}

/**
 * Opens the library from storage. Nothing stored: the 18 factory setups, saved at once. Stored text
 * goes through `load` like an imported file. Text that cannot be read is put aside (never
 * overwritten), the library starts from the factory setups and says so in `message`.
 */
export async function openLibrary(storage: LibraryStorage, options: OpenOptions = {}): Promise<Opened> {
  const now = options.now ?? (() => new Date());
  let configuration: Uc4Config | undefined;
  let message: string | undefined;
  let needsSave = false;
  let blocked: string | undefined;
  try {
    const text = await storage.read();
    if (text === null) {
      needsSave = true;
    } else {
      const result = load(text);
      if (result.status === 'loaded') configuration = result.configuration;
      else {
        message = `The stored library could not be read (${result.reason}) and was put aside. Starting from the factory setups.`;
        needsSave = true;
        try { await storage.quarantine(text); } catch {
          needsSave = false;
          blocked = 'the stored library could not be read and could not be put aside';
          message = `The stored library could not be read (${result.reason}) and could not be put aside, so it is left as it is. Changes are not saved: fix the problem or export your work, then reload.`;
        }
      }
    }
  } catch (e) {
    if (e instanceof StorageBusyError) {
      blocked = 'your library is open in another tab';
      message = e.message;
    } else {
      blocked = 'the stored library could not be read';
      message = `The stored library could not be read (${errorText(e)}), so it is left as it is. Changes are not saved: reload to try again, or export your work.`;
    }
  }
  let baseline: ExportBaseline = { lastExportedAt: null, lastWholeExportAt: null, setups: null };
  try { baseline = parseBaseline(await storage.readExportBaseline()); } catch { /* no export memory: everything counts from factory */ }
  const config = configuration ?? freshConfiguration(now());
  let marksText: string | null = null;
  let marks: Marks = {};
  try { marksText = await storage.readMarks(); marks = parseMarks(marksText, config); } catch { /* no marks: they come back with the next dump import */ }
  let linksText: string | null = null;
  let links: Links = {};
  let dumps: StoredDump[] = [];
  try { dumps = await storage.readDumps(); } catch { /* the list is empty; nothing is lost on disk */ }
  try { linksText = await storage.readLinks(); links = parseLinks(linksText, config, dumps); } catch { /* no links */ }
  let sendsText: string | null = null;
  try { sendsText = await storage.readSends(); } catch { /* no last sends */ }
  const library = createLibrary(storage, config, now, baseline, blocked, { marks, marksText, links, linksText, sends: parseSends(sendsText), sendsText, dumps });
  if (needsSave) library.saveNow();
  return { library, ...(message ? { message } : {}) };
}

function parseBaseline(text: string | null): ExportBaseline {
  // Setups are kept as saved, without a schemaVersion: after a schema bump they must go through the
  // migrator (or be dropped); until then a mismatch only makes setups count as changed, the safe side.
  const none: ExportBaseline = { lastExportedAt: null, lastWholeExportAt: null, setups: null };
  if (text === null) return none;
  try {
    const o = JSON.parse(text) as { lastExportedAt?: unknown; lastWholeExportAt?: unknown; setups?: unknown };
    const at = typeof o.lastExportedAt === 'string' ? o.lastExportedAt : null;
    const whole = typeof o.lastWholeExportAt === 'string' ? o.lastWholeExportAt : null;
    const setups = Array.isArray(o.setups) && o.setups.every((x) => typeof x === 'object' && x !== null) ? (o.setups as Setup[]) : null;
    return { lastExportedAt: at, lastWholeExportAt: whole, setups };
  } catch { return none; }
}

const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

interface Internal extends Library { saveNow(): void }

/** Setup id → the kept dump it came from and which of the dump's slots it came from (a Sndc of SE16 can sit in slot 3). */
type Links = Record<string, { dump: string; slot: number }>;
interface Snapshot { configuration: Uc4Config; marks: Marks; links: Links }
interface Side { marks: Marks; marksText: string | null; links: Links; linksText: string | null; sends: Sends; sendsText: string | null; dumps: StoredDump[] }

/** Saved links as text, read back: only setups and dumps that still exist. */
function parseLinks(text: string | null, config: Uc4Config, dumps: StoredDump[]): Links {
  if (text === null) return {};
  try {
    const o = JSON.parse(text) as unknown;
    if (typeof o !== 'object' || o === null || Array.isArray(o)) return {};
    const out: Links = {};
    for (const [setupId, link] of Object.entries(o)) {
      const l = link as { dump?: unknown; slot?: unknown } | null;
      if (l && typeof l.dump === 'string' && isSlot(l.slot) && config.setups.some((s) => s.id === setupId) && dumps.some((d) => d.id === l.dump)) {
        out[setupId] = { dump: l.dump, slot: l.slot };
      }
    }
    return out;
  } catch { return {}; }
}

/** Slot → the last send of it. */
type Sends = Record<number, LastSend>;

const toBase64 = (b: Uint8Array): string => { let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };
const fromBase64 = (t: string): Uint8Array => Uint8Array.from(atob(t), (c) => c.charCodeAt(0));
function stringifySends(sends: Sends): string {
  return JSON.stringify(Object.fromEntries(Object.entries(sends).map(([n, s]) => [n, { sentAt: s.sentAt, bytes: toBase64(s.bytes), backup: s.backup }])));
}
/** Saved sends read back; one that does not read is dropped (the slot just has no Restore until the next send). A backup dump that is gone stays: Restore says so. */
function parseSends(text: string | null): Sends {
  if (text === null) return {};
  try {
    const o = JSON.parse(text) as unknown;
    if (typeof o !== 'object' || o === null || Array.isArray(o)) return {};
    const out: Sends = {};
    for (const [n, v] of Object.entries(o)) {
      const s = v as { sentAt?: unknown; bytes?: unknown; backup?: { dumpId?: unknown; receivedAt?: unknown } | null } | null;
      const slot = Number(n);
      const b = s?.backup;
      const backupOk = b === null || (typeof b === 'object' && typeof b.dumpId === 'string' && typeof b.receivedAt === 'string');
      if (s && isSlot(slot) && typeof s.sentAt === 'string' && typeof s.bytes === 'string' && b !== undefined && backupOk) {
        out[slot] = { sentAt: s.sentAt, bytes: fromBase64(s.bytes), backup: b === null ? null : { dumpId: b.dumpId as string, receivedAt: b.receivedAt as string } };
      }
    }
    return out;
  } catch { return {}; }
}

const sameBytes = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((v, i) => v === b[i]);
const infoOf = (d: StoredDump): KeptDumpInfo => ({
  id: d.id, date: d.date, source: d.source, ...(d.fileName !== undefined ? { fileName: d.fileName } : {}),
  type: d.type, slots: d.slots, firmware: d.firmware, size: d.bytes.length,
  ...(d.unreadable ? { unreadable: d.unreadable, content: 'unreadable dump' } : { content: describeSlots(d.slots) }),
});

function createLibrary(
  storage: LibraryStorage, initial: Uc4Config, now: () => Date, initialBaseline: ExportBaseline, blocked: string | undefined,
  side: Side,
): Internal {
  let baseline = initialBaseline;
  /** Kept dumps with their bytes, newest first (plan 0005 decision 6). */
  let kept: StoredDump[] = [...side.dumps].sort((a, b) => b.date.localeCompare(a.date));
  /** Which kept dump each setup came from; saved beside the library, in the undo snapshots. */
  let links = side.links;
  let writtenLinks = side.linksText ?? '{}';
  const dumpFields = (): Pick<LibraryState, 'dumps' | 'dumpLinks'> => ({ dumps: kept.map(infoOf), dumpLinks: Object.fromEntries(Object.entries(links).map(([s, l]) => [s, l.dump])) });
  /** The last send per slot, with its bytes; saved beside the library (a sidecar, like the links). */
  let sends = side.sends;
  let writtenSends = side.sendsText ?? '{}';
  const sendFields = (): Pick<LibraryState, 'lastSends'> => ({ lastSends: Object.fromEntries(Object.entries(sends).map(([n, s]) => [n, { sentAt: s.sentAt, backup: s.backup }])) });
  const needs = () => dumpNeeds(kept, links, state.configuration.setups, new Set(Object.keys(marks).filter((id) => hasMarks(marks, id))),
    Object.fromEntries(Object.entries(sends).flatMap(([n, s]) => (s.backup ? [[Number(n), s.backup.dumpId] as const] : []))));
  /** Unreadable dump values per setup id (plan 0005 decision 9). */
  let marks = side.marks;
  let writtenMarks = side.marksText ?? '{}';
  const derived = (c: Uc4Config): Pick<LibraryState, 'problems' | 'setups' | 'exportState' | 'differsFromFactory'> => {
    const problems = [...validate(c), ...markProblems(c, marks)];
    const sums = summaries(c, problems);
    const differsFromFactory = c.setups.length !== 18 || sums.some((x, i) => x.slot !== i + 1 || x.differsFromFactory)
      || c.setups.some((x) => hasMarks(marks, x.id));
    return { problems, setups: sums, exportState: exportState(c, baseline), differsFromFactory };
  };
  let state: LibraryState = {
    configuration: initial,
    selection: { setupId: initial.setups[0]!.id, encoderGroup: 0, faderButtonGroup: 0, control: null },
    ...derived(initial),
    ...dumpFields(),
    ...sendFields(),
    canUndo: false,
    canRedo: false,
    saveStatus: blocked ? 'failed' : 'saved',
  };
  let undoStack: Snapshot[] = [];
  let redoStack: Snapshot[] = [];
  const listeners = new Set<(s: LibraryState) => void>();

  const publish = (next: LibraryState): LibraryState => {
    state = next;
    for (const l of [...listeners]) {
      try { l(state); } catch (e) { console.error('library subscriber failed', e); } // must not break a command or saving
    }
    return state;
  };
  const result = (message?: string): CommandResult => ({ state, ...(message ? { message } : {}) });
  const refuse = (message: string): CommandResult => {
    // A refusal changes nothing but the help-line message.
    publish({ ...state, message });
    return result(message);
  };

  // --- saving: writes in order; the status says "saving" while any is pending ---
  let pending = 0;
  let chain: Promise<void> = Promise.resolve();
  let lastFailure: string | undefined;
  const saveNow = (): void => {
    if (blocked) {
      // Never write over a library that could not be read; the edit stays in memory.
      const own = state.message;
      const note = `Your changes are not saved: ${blocked}; reload to try again.`;
      publish({ ...state, saveStatus: 'failed', message: own ? `${own} ${note}` : note });
      return;
    }
    const text = save(state.configuration);
    const marksText = JSON.stringify(marks);
    const linksText = JSON.stringify(links);
    const sendsText = stringifySends(sends);
    pending++;
    publish({ ...state, saveStatus: 'saving' });
    chain = chain.then(async () => {
      try {
        await storage.write(text);
        if (marksText !== writtenMarks) { await storage.writeMarks(marksText); writtenMarks = marksText; }
        if (linksText !== writtenLinks) { await storage.writeLinks(linksText); writtenLinks = linksText; }
        if (sendsText !== writtenSends) { await storage.writeSends(sendsText); writtenSends = sendsText; }
        lastFailure = undefined;
      } catch (e) { lastFailure = errorText(e); }
      pending--;
      if (pending === 0) {
        publish(lastFailure === undefined
          ? { ...state, saveStatus: 'saved' }
          : { ...state, saveStatus: 'failed', message: `Your changes are not saved (${lastFailure}). Export the configuration to keep them.` });
      }
    });
  };

  // --- committing a changed configuration ---
  const commit = (configuration: Uc4Config, message?: string, nextMarks?: Marks, nextLinks?: Links): CommandResult => {
    undoStack = [...undoStack, { configuration: state.configuration, marks, links }].slice(-HISTORY_LIMIT);
    redoStack = [];
    if (nextMarks) marks = nextMarks;
    if (nextLinks) links = nextLinks;
    const next = { ...configuration, updatedAt: now().toISOString() };
    publish({
      ...state, configuration: next, ...derived(next), ...dumpFields(), canUndo: true, canRedo: false,
      ...(message ? { message } : { message: undefined }),
    });
    saveNow();
    return result(message);
  };
  const setupIndex = (id: string): number => state.configuration.setups.findIndex((s) => s.id === id);
  const withSetup = (id: string, change: (s: Setup) => Setup): Uc4Config => {
    const i = setupIndex(id);
    return { ...state.configuration, setups: state.configuration.setups.map((s, k) => (k === i ? change(s) : s)) };
  };
  const clamp = (selection: Selection): Selection =>
    state.configuration.setups.some((s) => s.id === selection.setupId)
      ? selection
      : { ...selection, setupId: state.configuration.setups[0]!.id };

  /**
   * What an import file holds. A dump's setups come named by their slot (`SE16`); `renamed` applies
   * story 28: a setup that lands on a setup with another name keeps that name.
   */
  function readImport(input: string | Uint8Array): { status: 'refused'; reason: string; whatToDo: string }
    | { status: 'read'; configuration: Uc4Config; problems: Problem[]; warnings: string[]; fromDump?: boolean; bytes?: Uint8Array; read?: Extract<ReturnType<typeof readDump>, { status: 'read' }> } {
    if (typeof input === 'string') {
      const r = load(input);
      return r.status === 'refused' ? r : { status: 'read', configuration: r.configuration, problems: r.problems, warnings: [] };
    }
    if (looksLikeDump(input)) {
      const r = readDump(input, now());
      if (r.status === 'refused') return r;
      return { ...r, fromDump: true, bytes: input, read: r };
    }
    let text: string;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(input); JSON.parse(text); } catch {
      return { status: 'refused', reason: 'The file is neither a .json configuration nor a .syx dump.', whatToDo: IMPORT_READS };
    }
    const r = load(text);
    return r.status === 'refused' ? r : { status: 'read', configuration: r.configuration, problems: r.problems, warnings: [] };
  }

  const renamed = (s: Setup, target: number | undefined): Setup => {
    const current = target === undefined ? undefined : state.configuration.setups.find((x) => x.slot === target);
    return current && target !== undefined && current.name !== slotName(target) ? { ...s, name: current.name } : { ...s, name: target === undefined ? s.name : slotName(target) };
  };

  /** Persists one change of the kept dumps; a failure says so in the help line but never loses the in-memory dump. */
  const persistDump = (change: () => Promise<void>, what: string): void => {
    if (blocked) return;
    chain = chain.then(async () => {
      try { await change(); } catch (e) { publish({ ...state, message: `${what} could not be saved (${errorText(e)}).` }); }
    });
  };

  /** Keeps a read dump (the same bytes once) and returns it; `duplicate`: the bytes were kept before. */
  function keep(bytes: Uint8Array, r: Extract<ReturnType<typeof readDump>, { status: 'read' }> | { status: 'refused'; reason: string; whatToDo: string }, source: 'file' | 'received', fileName?: string): { dump: StoredDump; duplicate: boolean } {
    const existing = kept.find((d) => sameBytes(d.bytes, bytes));
    if (existing) {
      // The same bytes again from the device: the dump stays one, but it is a fresh receive (a send's backup, decision 22).
      if (source !== 'received') return { dump: existing, duplicate: true };
      const again: StoredDump = { ...existing, receivedAt: now().toISOString() };
      kept = kept.map((d) => (d === existing ? again : d));
      publish({ ...state, ...dumpFields() });
      persistDump(() => storage.putDump(again), 'The dump is kept for this session only: it');
      return { dump: again, duplicate: true };
    }
    // Ids are never reused: undo snapshots may still name a deleted dump, so the id carries the time and a random part.
    let id: string;
    do { id = `dump-${now().toISOString().replace(/[-:.]/g, '')}-${Math.random().toString(36).slice(2, 6)}`; } while (kept.some((d) => d.id === id));
    const dump: StoredDump = {
      id, date: now().toISOString(), source, ...(source === 'received' ? { receivedAt: now().toISOString() } : {}), ...(fileName ? { fileName } : {}),
      bytes: bytes.slice(),
      ...(r.status === 'read' ? { type: r.type, slots: r.slots, firmware: r.firmware } : { type: 'unknown' as const, slots: [], firmware: '', unreadable: { reason: r.reason, whatToDo: r.whatToDo } }),
    };
    kept = [dump, ...kept];
    publish({ ...state, ...dumpFields() });
    persistDump(() => storage.putDump(dump), 'The dump is kept for this session only: it');
    return { dump, duplicate: false };
  }

  const canonEqual = (a: unknown, b: unknown): boolean => canon(a) === canon(b);

  function markExported(setups: Setup[], whole: boolean, at: string): void {
    baseline = baselineAfter(baseline, setups, whole, at);
    publish({ ...state, exportState: exportState(state.configuration, baseline) });
    const text = JSON.stringify(baseline);
    chain = chain.then(() => storage.writeExportBaseline(text)).catch(() => { /* the date is lost after a reload; the export itself is not */ });
  }

  function resetGroup(setupId: string, group: number, key: 'encoderGroups' | 'faderButtonGroups'): CommandResult {
    const setup = state.configuration.setups[setupIndex(setupId)];
    if (!setup) return refuse(`There is no setup "${setupId}".`);
    if (!isGroup(group)) return refuse(`There is no group ${String(group)} (0–7).`);
    if (!isSlot(setup.slot)) return refuse(`"${setup.name}" has no slot, so it has no factory setup to go back to.`);
    const fresh = factorySetup(setup.slot)[key][group]!;
    const prefix = `${key}[${group}].`;
    if (canonEqual(fresh, setup[key][group]) && !hasMarks(marks, setupId, prefix)) return result();
    const label = key === 'encoderGroups' ? 'Encoder group' : 'Fader/button group';
    return commit(withSetup(setupId, (s) => ({ ...s, [key]: s[key].map((g, i) => (i === group ? fresh : g)) }) as Setup),
      `${label} ${group + 1} of "${setup.name}" is back to factory.`, dropMarks(marks, setupId, prefix));
  }

  // --- copy / paste (plan 0006 step 20) ---
  /** The marks of `fromId` under `fromPrefix`, relative to it and marked as pasted. */
  const clipMarks = (fromId: string, fromPrefix: string): string[] =>
    (marks[fromId] ?? []).filter((p) => p.startsWith(fromPrefix)).map((p) => p.slice(fromPrefix.length)).map((p) => (p.endsWith(PASTED) ? p : p + PASTED));
  /** The marks with those of `toId` under `toPrefix` replaced by the clip's, moved to the target's place. */
  function copyMarks(m: Marks, clip: Clip, toId: string, toPrefix: string): Marks {
    const carried = clip.marks.map((p) => toPrefix + p);
    const cleared = dropMarks(m, toId, toPrefix);
    if (carried.length === 0) return cleared;
    return { ...cleared, [toId]: [...(cleared[toId] ?? []), ...carried] };
  }
  const sameMarks = (a: Marks, b: Marks): boolean => {
    const norm = (m: Marks) => JSON.stringify(Object.entries(m).map(([k, v]) => [k, [...v].sort()]).sort());
    return norm(a) === norm(b);
  };
  /** Commits a paste, or nothing when neither the configuration nor the marks would change. */
  function pasteResult(next: Uc4Config, marksFor: (m: Marks) => Marks, message: string): CommandResult {
    const nextMarks = marksFor(marks);
    if (canonEqual(next, state.configuration) && sameMarks(nextMarks, marks)) return result();
    return commit(next, message, nextMarks);
  }
  const wrongKind = (clip: Clip, wanted: string, onto: string): CommandResult | undefined =>
    clip.kind === wanted ? undefined : refuse(`What you copied is a ${KIND_NAME[clip.kind]}; it can only be pasted onto ${KIND_ONTO[clip.kind]}, not onto ${onto}.`);
  function pasteGroup(key: 'encoderGroups' | 'faderButtonGroups', clip: Clip, to: GroupAddress): CommandResult {
    const wrong = wrongKind(clip, key === 'encoderGroups' ? 'encoderGroup' : 'faderButtonGroup', key === 'encoderGroups' ? 'an encoder group' : 'a fader/button group');
    if (wrong) return wrong;
    if (clip.kind !== 'encoderGroup' && clip.kind !== 'faderButtonGroup') return result();
    const b = state.configuration.setups[setupIndex(to.setupId)];
    if (!b) return refuse(`There is no setup "${to.setupId}".`);
    if (!isGroup(to.group)) return refuse('There is no such group (0–7).');
    const from = clip.from as { setupId: string; group: number };
    const label = key === 'encoderGroups' ? 'Encoder group' : 'Fader/button group';
    // Pasting back where it was taken from while that is unchanged.
    if (from.setupId === to.setupId && from.group === to.group && canonEqual(clip.group, b[key][to.group]) && sameMarks(copyMarks(marks, clip, b.id, `${key}[${to.group}].`), marks)) return result();
    const next = withSetup(b.id, (s) => ({ ...s, [key]: s[key].map((g, i) => (i === to.group ? structuredClone(clip.group) : g)) }) as Setup);
    return pasteResult(next, (m) => copyMarks(m, clip, b.id, `${key}[${to.group}].`),
      `${label} ${from.group + 1} of "${clip.sourceName}" is pasted onto group ${to.group + 1} of "${b.name}".`);
  }
  const ctrlPrefix = (a: ControlAddress): string => `${groupKey(a.area)}[${a.group}].${a.area}[${a.index}].`;

  // --- .syx export (plan 0007 step 3.2) ---
  const stamp = (): string => now().toISOString();
  const keptOf = (raw: RawDump): StoredDump | undefined => kept.find((d) => d.bytes === raw.bytes || sameBytes(d.bytes, raw.bytes));
  /** The kept dump's file name, as `exportDump` gives it. */
  const keptName = (dump: StoredDump): string => {
    const what = dump.slots.length === 1 ? slotName(dump.slots[0]!) : dump.unreadable ? 'unreadable' : 'all';
    return `uc4-${what}-${fileDate(new Date(dump.date))}.syx`;
  };
  /** The setup with the dump it came from as `source`, when that dump is readable and holds the setup's own slot (decision 9). */
  const syxSetup = (setup: Setup, slot: number): SyxSetup => {
    const link = links[setup.id];
    const dump = link && link.slot === slot ? kept.find((d) => d.id === link.dump) : undefined;
    if (!dump || dump.unreadable || !dump.slots.includes(slot)) return { slot, setup };
    return { slot, setup, source: { bytes: dump.bytes, source: { kind: 'file', name: dump.fileName ?? 'kept dump' }, capturedAt: dump.date, engineVersion: ENGINE_VERSION } };
  };
  /**
   * Values the dump could not give stand as factory values. With the setup's `source` the engine keeps the dump's byte
   * unless the value was changed; without one, writing would put the factory value over what the UC4 holds.
   */
  const unreadableRefusal = (setup: Setup, slot: number, withSlot: boolean, hasSource = !!syxSetup(setup, slot).source, words: 'export' | 'send' = 'export'): SyxRefusal | undefined => {
    // Marks from the setup's own dump are kept by that dump's byte; a pasted mark has a real value in the dump, so it always refuses.
    const paths = (hasSource ? pastedMarks(marks, setup.id) : (marks[setup.id] ?? []).map(markPath));
    if (paths.length === 0) return undefined;
    const fields = paths.map((p) => `${withSlot ? `${slotName(slot)} ` : ''}${p}`);
    const reason = `${withSlot ? slotName(slot) : `"${setup.name}"`} has ${paths.length} value${paths.length === 1 ? '' : 's'} the editor could not read from its dump and shows as factory values (marked in the editor).`;
    return { reason, fields, whatToDo: words === 'send' ? 'Check or set them first, then send again.' : `Check or set them first, or ${JSON_OR}` };
  };
  const syxRefused = (message: string, refusal: SyxRefusal): SyxExportResult => ({ ...refuse(message), refusal });
  const syxResult = (built: ReturnType<typeof buildSyx>, prefix: string): SyxExportResult => {
    if (!built.ok) return syxRefused(`${built.refusal.reason} ${built.refusal.whatToDo}`, built.refusal);
    // Identical to a kept dump: it is that dump, with its plain name and no engine version.
    const same = kept.find((d) => sameBytes(d.bytes, built.bytes));
    const name = same ? keptName(same) : `${prefix}-${fileDate(now())}-engine${ENGINE_VERSION}.syx`;
    return { ...result(), file: { name, bytes: built.bytes } };
  };

  /**
   * The one build path of a setup's `Sndc` (decision 21): export and send both go through it. The export patches the kept
   * `Sndc` the setup is linked to (`for: 'export'`); a send patches the base `bases` names (decisions 30, 31).
   */
  type SetupDump = { ok: true; slot: number; built: SyxBuild; base: RawDump | undefined } | { ok: false; refusal: SyxRefusal; /** The engine refused the base (send only). */ cannotSend?: true };
  type SendBaseChoice = { ok: true; raw: RawDump; info: SendBase } | { ok: false; refusal: SyxRefusal };
  const buildSetupDump = (setupId: string, send?: (setup: Setup, slot: number) => SendBaseChoice): SetupDump => {
    const setup = state.configuration.setups[setupIndex(setupId)];
    const no = (reason: string, whatToDo: string): SetupDump => ({ ok: false, refusal: { reason, fields: [], whatToDo } });
    if (!setup) return no(`There is no setup "${setupId}".`, 'Choose a setup from the list.');
    if (!isSlot(setup.slot)) return no(`"${setup.name}" has no slot, so it cannot be written to the UC4.`, `A setup is written at its own slot only. ${JSON_INSTEAD}`);
    if (send) {
      const choice = send(setup, setup.slot);
      if (!choice.ok) return { ok: false, refusal: choice.refusal, cannotSend: true };
      // The base is the device's state: the setup's own dump is not copied over it. Marked values are patched only on the dump they came from.
      const own = choice.info.kind === 'Sndc';
      const unreadable = unreadableRefusal(setup, setup.slot, false, own, 'send');
      if (unreadable) return { ok: false, refusal: unreadable };
      return { ok: true, slot: setup.slot, built: buildSyx('one', [{ slot: setup.slot, setup }], choice.raw, stamp, 'send'), base: choice.raw };
    }
    const unreadable = unreadableRefusal(setup, setup.slot, false);
    if (unreadable) return { ok: false, refusal: unreadable };
    const entry = syxSetup(setup, setup.slot);
    // A Sndc is built on a Sndc of its own slot (the linked dump); the factory image only serves a SndA.
    const base = entry.source && keptOf(entry.source)?.type === 'one' ? entry.source : undefined;
    return { ok: true, slot: setup.slot, built: buildSyx('one', [entry], base, stamp), base };
  };
  const rawOf = (d: StoredDump): RawDump => ({ bytes: d.bytes, source: { kind: 'file', name: d.fileName ?? 'kept dump' }, capturedAt: d.date, engineVersion: ENGINE_VERSION });
  /** The send's base: the fresh SndA's slot, else the setup's linked Sndc, else the factory slot. A SndA that cannot be cut refuses. */
  const sendBase = (backup: SendBackup | undefined) => (setup: Setup, slot: number): SendBaseChoice => {
    const cut = (from: RawDump) => uc4Engine.cutSlot(from, slot, stamp);
    const cutRefusal = (what: string, whatToDo: string, reason: string): SendBaseChoice => ({ ok: false, refusal: { reason: `${slotName(slot)} cannot be built on ${what}: ${reason}`, fields: [], whatToDo } });
    const sndA = backup && kept.find((d) => d.id === backup.dumpId);
    if (backup && sndA) {
      const r = cut(rawOf(sndA));
      return r.ok ? { ok: true, raw: r.raw, info: { kind: 'SndA', dumpId: backup.dumpId, receivedAt: backup.receivedAt } }
        : cutRefusal('the backup SndA', 'Receive a new SndA from the UC4, then send again.', r.reason.message);
    }
    const entry = syxSetup(setup, slot);
    const linked = entry.source && keptOf(entry.source);
    if (linked && linked.type === 'one') return { ok: true, raw: entry.source!, info: { kind: 'Sndc', dumpId: linked.id } };
    const r = cut({ bytes: faderfoxUc4.factoryDump(), source: { kind: 'generated' }, capturedAt: stamp(), engineVersion: ENGINE_VERSION });
    return r.ok ? { ok: true, raw: r.raw, info: { kind: 'factory' } } : cutRefusal('the factory setup', 'Report this.', r.reason.message);
  };

  const library: Internal = {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      try { listener(state); } catch (e) { console.error('library subscriber failed', e); }
      return () => { listeners.delete(listener); };
    },

    select(change) {
      const next = { ...state.selection };
      if (change.setupId !== undefined) {
        if (setupIndex(change.setupId) < 0) return refuse(`There is no setup "${change.setupId}".`);
        next.setupId = change.setupId;
      }
      if (change.encoderGroup !== undefined) {
        if (!isGroup(change.encoderGroup)) return refuse(`There is no encoder group ${String(change.encoderGroup)} (0–7).`);
        next.encoderGroup = change.encoderGroup;
      }
      if (change.faderButtonGroup !== undefined) {
        if (!isGroup(change.faderButtonGroup)) return refuse(`There is no fader/button group ${String(change.faderButtonGroup)} (0–7).`);
        next.faderButtonGroup = change.faderButtonGroup;
      }
      if (change.control !== undefined) {
        const c = change.control;
        if (c !== null && !(c.area in AREA_COUNT && Number.isInteger(c.index) && c.index >= 0 && c.index < AREA_COUNT[c.area])) {
          return refuse('There is no such control.');
        }
        next.control = c;
      }
      publish({ ...state, selection: next, message: undefined });
      return result();
    },

    setProperty(address, property, value) {
      const { setupId, area, group, index } = address;
      if (setupIndex(setupId) < 0) return refuse(`There is no setup "${setupId}".`);
      if (!(area in AREA_COUNT) || !isGroup(group) || !Number.isInteger(index) || index < 0 || index >= AREA_COUNT[area]) {
        return refuse('There is no such control.');
      }
      const choices = CHOICES[area][property];
      if (property === 'label') {
        if (typeof value !== 'string') return refuse('A label is text.');
      } else if (NUMBERS.includes(property)) {
        if (typeof value !== 'number' || !Number.isInteger(value)) return refuse(`${property} must be a whole number.`);
      } else if (choices) {
        if (typeof value !== 'string' || !choices.includes(value)) {
          return refuse(`"${String(value)}" is not a ${property} for this control (${choices.join(', ')}).`);
        }
      } else {
        return refuse(`This control has no ${property}.`);
      }

      const old = readControl(state.configuration, address);
      if (!old) return refuse('There is no such control.');
      let control: AnyControl;
      let message: string | undefined;
      if (property === 'type') {
        const r = (changeType as unknown as (c: AnyControl, t: string) => { control: AnyControl; message?: string })(old, value as string);
        control = r.control;
        message = r.message;
      } else if (property === 'label') {
        control = { ...old, label: value as string };
        if (value === '') delete control.label;
      } else {
        control = { ...old, [property]: value } as AnyControl;
      }
      // The edited property's mark goes (even for the same value: "I checked it"), and so does the mark of
      // any other property the command changed (a type change can lower `number`). Other marks stay.
      const base = `${groupKey(area)}[${group}].${area}[${index}].`;
      const touched = [...new Set([property, ...Object.keys({ ...old, ...control }).filter((k) =>
        JSON.stringify((old as unknown as Record<string, unknown>)[k]) !== JSON.stringify((control as unknown as Record<string, unknown>)[k]))])].map((k) => base + k);
      if (JSON.stringify(control) === JSON.stringify(old) && !hasMarkPaths(marks, setupId, touched)) return result();
      return commit(writeControl(state.configuration, address, control), message, dropMarkPaths(marks, setupId, touched));
    },

    setGroupName(setupId, encoderGroup, input) {
      if (setupIndex(setupId) < 0) return refuse(`There is no setup "${setupId}".`);
      if (!isGroup(encoderGroup)) return refuse(`There is no encoder group ${String(encoderGroup)} (0–7).`);
      const { name, hints } = normalizeGroupName(input);
      const message = hints.length > 0 ? hints.join('; ') : undefined;
      const current = state.configuration.setups[setupIndex(setupId)]!.encoderGroups[encoderGroup]!;
      const prefix = `encoderGroups[${encoderGroup}].name`;
      if (current.name === name && !hasMarks(marks, setupId, prefix)) return message ? refuse(message) : result();
      return commit(withSetup(setupId, (s) => ({
        ...s,
        encoderGroups: s.encoderGroups.map((g, i): EncoderGroup => (i === encoderGroup ? { ...g, name } : g)),
      })), message, dropMarks(marks, setupId, prefix));
    },

    setGroupLabel(setupId, kind, group, input) {
      if (setupIndex(setupId) < 0) return refuse(`There is no setup "${setupId}".`);
      if (kind !== 'encoder' && kind !== 'faderButton') return refuse('There is no such group.');
      if (!isGroup(group)) return refuse(`There is no group ${String(group)} (0–7).`);
      if (typeof input !== 'string') return refuse('A label is text.');
      const label = input.trim();
      const key = kind === 'encoder' ? 'encoderGroups' : 'faderButtonGroups';
      const old: EncoderGroup | FaderButtonGroup = state.configuration.setups[setupIndex(setupId)]![key][group]!;
      if ((old.label ?? '') === label) return result();
      const change = <G extends EncoderGroup | FaderButtonGroup>(g: G): G => {
        const { label: _old, ...rest } = g;
        return (label === '' ? rest : { ...rest, label }) as G;
      };
      return commit(withSetup(setupId, (s) => (kind === 'encoder'
        ? { ...s, encoderGroups: s.encoderGroups.map((g, i) => (i === group ? change(g) : g)) }
        : { ...s, faderButtonGroups: s.faderButtonGroups.map((g, i) => (i === group ? change(g) : g)) })));
    },

    setSetupName(setupId, name) {
      const i = setupIndex(setupId);
      if (i < 0) return refuse(`There is no setup "${setupId}".`);
      if (name.trim() === '') return refuse('A setup needs a name.');
      if (state.configuration.setups[i]!.name === name) return result();
      return commit(withSetup(setupId, (s) => ({ ...s, name })));
    },

    selectProblem(index) {
      const p = state.problems[index];
      const where = p ? locate(p.path) : null;
      const setup = where ? state.configuration.setups[where.setupIndex] : undefined;
      if (!p || !where || !setup) return refuse('That problem cannot be shown in the editor.');
      const next: Selection = { ...state.selection, setupId: setup.id, control: where.control ?? null };
      if (where.encoderGroup !== undefined) next.encoderGroup = where.encoderGroup;
      if (where.faderButtonGroup !== undefined) next.faderButtonGroup = where.faderButtonGroup;
      publish({ ...state, selection: next, message: undefined });
      return result();
    },

    inspectImport(input) {
      const r = readImport(input);
      if (r.status === 'refused') return { status: 'refused', reason: r.reason, whatToDo: r.whatToDo };
      const c = r.configuration;
      const warn = r.warnings.length > 0 ? { warnings: r.warnings } : {};
      if (c.setups.length !== 1) {
        return { status: 'whole', setups: c.setups.length, problems: r.problems, unexportedChanges: state.exportState.unexportedChanges, ...warn };
      }
      const one = c.setups[0]!;
      const slot = isSlot(one.slot) ? one.slot : undefined;
      const named = r.fromDump ? renamed(one, slot).name : one.name;
      const used = new Set(state.configuration.setups.map((s) => s.slot));
      const occupant = slot === undefined ? undefined : state.configuration.setups.find((s) => s.slot === slot);
      return {
        status: 'setup', name: named, ...(slot !== undefined ? { slot } : {}), problems: r.problems, ...warn,
        ...(occupant ? { occupiedBy: { id: occupant.id, name: occupant.name } } : {}),
        freeSlots: Array.from({ length: 18 }, (_, i) => i + 1).filter((n) => !used.has(n)),
      };
    },

    importFile(input, placement = {}) {
      const r = readImport(input);
      if (r.status === 'refused') {
        const message = `${r.reason} ${r.whatToDo}`;
        refuse(message);
        return { ...result(message), status: 'refused', reason: r.reason, whatToDo: r.whatToDo };
      }
      const c = r.configuration;
      const note = (r.problems.length > 0 ? ` ${r.problems.length} problem${r.problems.length === 1 ? '' : 's'} found; they are marked.` : '')
        + r.warnings.map((w) => ` ${w}`).join('');
      if (c.setups.length !== 1) {
        const message = `Imported ${c.setups.length} setups, replacing the library.${note}`;
        const whole = r.fromDump ? { ...c, setups: c.setups.map((s) => renamed(s, s.slot)) } : c;
        const dump = r.fromDump && r.bytes ? keep(r.bytes, r.read!, 'file', placement.fileName).dump : undefined;
        const wholeLinks = dump ? Object.fromEntries(whole.setups.filter((s) => isSlot(s.slot)).map((s) => [s.id, { dump: dump.id, slot: s.slot! }])) : {};
        commit(whole, message, marksFromProblems(r.problems, whole.setups), wholeLinks);
        publish({ ...state, selection: { setupId: c.setups[0]!.id, encoderGroup: 0, faderButtonGroup: 0, control: null } });
        return { ...result(message), status: 'imported', kind: 'whole', problemCount: r.problems.length };
      }
      const one = c.setups[0]!;
      const slot = placement.slot ?? (isSlot(one.slot) ? one.slot : undefined);
      const refusedSlot = (message: string): ImportResult => {
        refuse(message);
        return { ...result(message), status: 'refused', reason: message, whatToDo: 'Pick a slot from 1 to 18.' };
      };
      if (slot === undefined) return { ...result(), status: 'needs-slot' };
      if (!isSlot(slot)) return refusedSlot(`Slot ${String(slot)} does not exist.`);
      const occupant = state.configuration.setups.find((s) => s.slot === slot);
      if (occupant && !placement.replace) {
        return { ...result(), status: 'slot-occupied', slot, occupiedBy: { id: occupant.id, name: occupant.name } };
      }
      const others = state.configuration.setups.filter((s) => s.slot !== slot);
      let id = one.id;
      for (let n = 2; others.some((s) => s.id === id); n++) id = `${one.id}-${n}`;
      const placed: Setup = { ...(r.fromDump ? renamed(one, slot) : one), id, slot };
      const at = others.findIndex((s) => s.slot === undefined || s.slot > slot);
      const setups = at < 0 ? [...others, placed] : [...others.slice(0, at), placed, ...others.slice(at)];
      const message = `Imported "${placed.name}" into slot ${slot}${occupant ? `, replacing "${occupant.name}"` : ''}.${note}`;
      const next = { ...dropMarks(dropMarks(marks, id), occupant?.id ?? id), ...marksFromProblems(r.problems, [placed]) };
      const dump = r.fromDump && r.bytes ? keep(r.bytes, r.read!, 'file', placement.fileName).dump : undefined;
      const { [id]: _a, [occupant?.id ?? id]: _b, ...otherLinks } = links;
      commit({ ...state.configuration, setups }, message, next, dump && isSlot(one.slot) ? { ...otherLinks, [id]: { dump: dump.id, slot: one.slot } } : otherLinks);
      publish({ ...state, selection: { ...state.selection, setupId: id, control: null } });
      return { ...result(message), status: 'imported', kind: 'setup', slot, problemCount: r.problems.length };
    },

    exportWhole() {
      const at = now();
      const file = { name: `uc4-config-${fileDate(at)}.json`, text: save(state.configuration) };
      markExported(state.configuration.setups, true, at.toISOString());
      return { ...result(), file };
    },

    exportSetup(setupId) {
      const setup = state.configuration.setups[setupIndex(setupId)];
      if (!setup) {
        const message = `There is no setup "${setupId}".`;
        refuse(message);
        return result(message);
      }
      const at = now();
      const slotPart = isSlot(setup.slot) ? `-${String(setup.slot).padStart(2, '0')}` : '';
      const file = {
        name: `uc4-setup${slotPart}-${fileDate(at)}.json`,
        text: save({ ...state.configuration, setups: [setup] }),
      };
      markExported([setup], false, at.toISOString());
      return { ...result(), file };
    },

    keepDump(bytes, source, fileName) {
      const r = looksLikeDump(bytes) ? readDump(bytes, now()) : undefined;
      if (!r) {
        const reason = 'This is not a SysEx dump.';
        refuse(`${reason} ${IMPORT_READS}`);
        return { status: 'refused', reason, whatToDo: IMPORT_READS };
      }
      if (r.status === 'refused') {
        if (source !== 'received') { refuse(`${r.reason} ${r.whatToDo}`); return r; }
        // A received dump is evidence (plan 0003): kept although the engine refuses it.
        const { dump, duplicate } = keep(bytes, r, source, fileName);
        const duplicateOf = duplicate ? { id: dump.id, date: dump.date } : undefined;
        const message = `A dump arrived that cannot be read: ${r.reason} ${r.whatToDo}`;
        publish({ ...state, message });
        return { status: 'kept', dump: infoOf(dump), content: 'unreadable dump', slots: [], warnings: [], unreadable: { reason: r.reason, whatToDo: r.whatToDo }, ...(duplicateOf ? { duplicateOf } : {}) };
      }
      const { dump, duplicate } = keep(bytes, r, source, fileName);
      const duplicateOf = duplicate ? { id: dump.id, date: dump.date } : undefined;
      return { status: 'kept', dump: infoOf(dump), content: describeSlots(dump.slots), slots: dump.slots, warnings: r.warnings, ...(duplicateOf ? { duplicateOf } : {}) };
    },

    exportDump(dumpId) {
      const dump = kept.find((d) => d.id === dumpId);
      if (!dump) return { ...refuse(`There is no kept dump "${dumpId}".`) };
      // Not a generated file: the bytes are the ones that came, so no engine version belongs on it.
      return { ...result(), file: { name: keptName(dump), bytes: dump.bytes.slice() } };
    },

    exportSetupSyx(setupId) {
      const b = buildSetupDump(setupId);
      return b.ok ? syxResult(b.built, `uc4-${slotName(b.slot)}`) : syxRefused(`${b.refusal.reason} ${b.refusal.whatToDo}`, b.refusal);
    },

    planSend(slot, { connectedAt }) {
      const setup = state.configuration.setups.find((s) => s.slot === slot);
      if (!setup) {
        const reason = `There is no setup for ${slotName(slot)}.`;
        return { ok: false, refusal: { kind: 'cannot build', reason, fields: [], whatToDo: 'Choose a setup that has a slot.' } };
      }
      const backup = freshBackup(kept, connectedAt);
      let info: SendBase = { kind: 'factory' };
      const b = buildSetupDump(setup.id, (s, n) => { const c = sendBase(backup)(s, n); if (c.ok) info = c.info; return c; });
      if (!b.ok) return { ok: false, refusal: { kind: b.cannotSend ? 'cannot send' : 'cannot build', ...b.refusal } };
      if (!b.built.ok) return { ok: false, refusal: { kind: 'cannot send', ...b.built.refusal } };
      // buildSyx read the bytes back already; the base is the one Sndc it patched.
      const changes = b.base ? changesBetween(b.base, b.built.bytes, slot, stamp) : undefined;
      if (!changes) return { ok: false, refusal: { kind: 'cannot send', reason: 'The changes to send could not be listed, so nothing is offered.', fields: [], whatToDo: 'Report this.' } };
      return { ok: true, bytes: b.built.bytes, changes, base: info, backup: backup ?? null };
    },

    recordSend(slot, plan) {
      if (!isSlot(slot)) return refuse(`There is no setup ${String(slot)} on the UC4.`);
      sends = { ...sends, [slot]: { sentAt: stamp(), bytes: new Uint8Array(plan.bytes), backup: plan.backup ? { ...plan.backup } : null } };
      publish({ ...state, ...sendFields() });
      saveNow();
      return result();
    },

    planRestore(slot, { connectedAt }) {
      const se = slotName(slot);
      const refuse = (kind: 'no backup' | 'cannot restore', reason: string, whatToDo: string): RestorePlan => ({ ok: false, refusal: { kind, reason, whatToDo } });
      if (!isSlot(slot)) return refuse('cannot restore', `There is no setup ${String(slot)} on the UC4.`, 'Choose a setup from SE01 to SE18.');
      const last = sends[slot];
      const chosen = chooseBackup(kept, last, slot, connectedAt);
      if (!chosen.ok) return { ok: false, refusal: chosen.refusal };
      const sndA = kept.find((d) => d.id === chosen.backup.dumpId)!;
      const cut = uc4Engine.cutSlot(rawOf(sndA), slot, stamp);
      if (!cut.ok) return refuse('cannot restore', `${se} cannot be cut out of the backup SndA: ${cut.reason.message}`, 'Receive a new SndA from the UC4 and restore from that.');
      // What the UC4 holds now, as far as known: the newest of the last send and any SndA received after the backup.
      for (const c of newerStates(kept, chosen.backup, last)) {
        const cutNow = c.dump ? uc4Engine.cutSlot(rawOf(c.dump), slot, stamp) : undefined;
        const raw = c.against.kind === 'sent' ? { ...cut.raw, bytes: last!.bytes, capturedAt: last!.sentAt } : cutNow?.ok ? cutNow.raw : undefined;
        if (!raw) continue;
        const changes = changesBetween(raw, cut.raw.bytes, slot, stamp);
        if (changes) return { ok: true, bytes: cut.raw.bytes, backup: chosen.backup, against: c.against, changes };
      }
      return { ok: true, bytes: cut.raw.bytes, backup: chosen.backup, against: null, changes: null };
    },

    exportAllSyx() {
      const setups = state.configuration.setups;
      const problems: string[] = [];
      for (let slot = 1; slot <= 18; slot++) {
        const n = setups.filter((s) => s.slot === slot).length;
        if (n === 0) problems.push(`${slotName(slot)} has no setup`);
        else if (n > 1) problems.push(`${slotName(slot)} has ${n} setups`);
      }
      const slotless = setups.filter((s) => !isSlot(s.slot)).map((s) => `"${s.name}"`);
      if (slotless.length > 0) problems.push(`${slotless.join(', ')} ${slotless.length === 1 ? 'has' : 'have'} no slot`);
      if (problems.length > 0) {
        const r: SyxRefusal = { reason: `A SndA holds exactly one setup in each of the 18 slots: ${problems.join('; ')}.`, fields: problems, whatToDo: `Give every slot one setup, or export the setups you have as JSON.` };
        return syxRefused(`${r.reason} ${r.whatToDo}`, r);
      }
      const entries: SyxSetup[] = [];
      for (let slot = 1; slot <= 18; slot++) {
        const setup = setups.find((s) => s.slot === slot)!;
        const unreadable = unreadableRefusal(setup, slot, true);
        if (unreadable) return syxRefused(`${unreadable.reason} ${unreadable.whatToDo}`, unreadable);
        entries.push(syxSetup(setup, slot));
      }
      return syxResult(buildSyx('all', entries, undefined, stamp), 'uc4-all');
    },

    revertSetup(setupId) {
      const setup = state.configuration.setups[setupIndex(setupId)];
      if (!setup) return refuse(`There is no setup "${setupId}".`);
      const link = links[setupId];
      const dump = kept.find((d) => d.id === link?.dump);
      if (!dump || !link) return refuse(`"${setup.name}" has no kept dump to go back to.`);
      const r = readDump(dump.bytes, now());
      const at = r.status === 'read' ? r.configuration.setups.findIndex((s) => s.slot === link.slot) : -1;
      if (r.status !== 'read' || at < 0) return refuse(`The kept dump has no setup for slot ${link.slot}, so "${setup.name}" cannot go back to it.`);
      const back: Setup = { ...r.configuration.setups[at]!, id: setup.id, name: setup.name, ...(setup.slot !== undefined ? { slot: setup.slot } : {}) };
      const fresh = marksFromProblems(r.problems, r.configuration.setups.map((s, i) => (i === at ? { id: setup.id } : { id: '' })));
      return commit(withSetup(setupId, () => back), `"${setup.name}" is back to the setup in the kept dump.`, { ...dropMarks(marks, setupId), ...fresh });
    },

    deleteDump(dumpId) {
      const dump = kept.find((d) => d.id === dumpId);
      if (!dump) return refuse(`There is no kept dump "${dumpId}".`);
      const linked = Object.entries(links).filter(([, l]) => l.dump === dumpId).map(([s]) => s);
      kept = kept.filter((d) => d.id !== dumpId);
      links = Object.fromEntries(Object.entries(links).filter(([, l]) => l.dump !== dumpId));
      const message = linked.length === 0
        ? `Deleted the dump (${describeSlots(dump.slots)}).`
        : `Deleted the dump (${describeSlots(dump.slots)}). ${linked.length} setup${linked.length === 1 ? '' : 's'} can no longer go back to it; they keep their content.`;
      publish({ ...state, ...dumpFields(), message });
      persistDump(() => storage.deleteDump(dumpId), 'The deletion');
      saveNow();
      return result(message);
    },

    dumpNeeds(dumpId) {
      return needs()[dumpId] ?? [];
    },

    planClearDumps() {
      return planClearOldDumps(kept, needs());
    },

    clearOldDumps() {
      const { deleteIds } = planClearOldDumps(kept, needs());
      if (deleteIds.length === 0) return result('There are no old dumps to clear.');
      const gone = new Set(deleteIds);
      kept = kept.filter((d) => !gone.has(d.id));
      links = Object.fromEntries(Object.entries(links).filter(([, l]) => !gone.has(l.dump)));
      const message = `Cleared ${deleteIds.length} old dump${deleteIds.length === 1 ? '' : 's'}.`;
      publish({ ...state, ...dumpFields(), message });
      for (const id of deleteIds) persistDump(() => storage.deleteDump(id), 'The deletion');
      saveNow();
      return result(message);
    },

    resetSetup(setupId) {
      const setup = state.configuration.setups[setupIndex(setupId)];
      if (!setup) return refuse(`There is no setup "${setupId}".`);
      if (!isSlot(setup.slot)) return refuse(`"${setup.name}" has no slot, so it has no factory setup to go back to.`);
      const fresh = { ...factorySetup(setup.slot), id: setup.id };
      if (canonEqual(fresh, setup) && !hasMarks(marks, setupId)) return result();
      return commit(withSetup(setupId, () => fresh), `"${setup.name}" is back to factory.`, dropMarks(marks, setupId));
    },
    copy(source) {
      const setup = state.configuration.setups[setupIndex(source.setupId)];
      if (!setup) return refuse(`There is no setup "${source.setupId}".`);
      const base = { from: structuredClone(source), sourceName: setup.name };
      let clip: Clip;
      if (source.kind === 'setup') {
        clip = { ...base, kind: 'setup', encoderGroups: structuredClone(setup.encoderGroups), faderButtonGroups: structuredClone(setup.faderButtonGroups), marks: clipMarks(setup.id, '') };
      } else if (source.kind === 'control') {
        if (!(source.area in AREA_COUNT)) return refuse('There is no such control.');
        if (!isGroup(source.group)) return refuse(`There is no group ${String(source.group)} (0–7).`);
        if (!Number.isInteger(source.index) || source.index < 0 || source.index >= AREA_COUNT[source.area]) return refuse('There is no such control.');
        const control = readControl(state.configuration, source)!;
        clip = { ...base, kind: 'control', area: source.area, control: structuredClone(control), marks: clipMarks(setup.id, ctrlPrefix(source)) };
      } else {
        if (!isGroup(source.group)) return refuse('There is no such group (0–7).');
        const key = source.kind === 'encoderGroup' ? 'encoderGroups' : 'faderButtonGroups';
        const marksOf = clipMarks(setup.id, `${key}[${source.group}].`);
        clip = source.kind === 'encoderGroup'
          ? { ...base, kind: 'encoderGroup', group: structuredClone(setup.encoderGroups[source.group]!), marks: marksOf }
          : { ...base, kind: 'faderButtonGroup', group: structuredClone(setup.faderButtonGroups[source.group]!), marks: marksOf };
      }
      return { ...result(), clip: deepFreeze(clip) };
    },
    pasteSetup(clip, toId) {
      const wrong = wrongKind(clip, 'setup', 'a setup');
      if (wrong) return wrong;
      if (clip.kind !== 'setup') return result();
      const to = state.configuration.setups[setupIndex(toId)];
      if (!to) return refuse(`There is no setup "${toId}".`);
      const fresh: Setup = structuredClone({ ...to, encoderGroups: clip.encoderGroups, faderButtonGroups: clip.faderButtonGroups }) as Setup;
      return pasteResult(withSetup(to.id, () => fresh), (m) => copyMarks(m, clip, to.id, ''), `"${clip.sourceName}" is pasted onto "${to.name}".`);
    },
    pasteEncoderGroup(clip, to) {
      return pasteGroup('encoderGroups', clip, to);
    },
    pasteFaderButtonGroup(clip, to) {
      return pasteGroup('faderButtonGroups', clip, to);
    },
    pasteControl(clip, to) {
      const wrong = wrongKind(clip, 'control', 'a control');
      if (wrong) return wrong;
      if (clip.kind !== 'control') return result();
      if (!(to.area in AREA_COUNT)) return refuse('There is no such control.');
      if (clip.area !== to.area) return refuse(`A ${AREA_NAME[clip.area]} can only be pasted onto a ${AREA_NAME[clip.area]}, not onto a ${AREA_NAME[to.area]}.`);
      const fromIndex = (clip.from as ControlAddress).index;
      if (clip.area === 'faders' && (fromIndex === 8) !== (to.index === 8)) {
        return refuse('Fader 9 is its own kind of control: it can only be pasted onto fader 9, and faders 1–8 only onto faders 1–8.');
      }
      if (!isGroup(to.group)) return refuse(`There is no group ${String(to.group)} (0–7).`);
      if (!Number.isInteger(to.index) || to.index < 0 || to.index >= AREA_COUNT[to.area]) return refuse('There is no such control.');
      const to0 = state.configuration.setups[setupIndex(to.setupId)];
      if (!to0) return refuse(`There is no setup "${to.setupId}".`);
      const from = clip.from as ControlAddress;
      if (from.setupId === to.setupId && from.group === to.group && from.index === to.index
        && canonEqual(clip.control, readControl(state.configuration, to)) && sameMarks(copyMarks(marks, clip, to.setupId, ctrlPrefix(to)), marks)) return result();
      const next = writeControl(state.configuration, to, structuredClone(clip.control) as AnyControl);
      return pasteResult(next, (m) => copyMarks(m, clip, to.setupId, ctrlPrefix(to)), `${AREA_NAME[to.area][0]!.toUpperCase()}${AREA_NAME[to.area].slice(1)} ${to.index + 1} of "${to0.name}" is pasted.`);
    },

    resetAll() {
      if (!state.differsFromFactory) return result();
      // A slot's setup keeps its id, as in resetSetup, so anything keyed by id (a held copy, the selection) still finds it.
      const idOf = (slot: number): string | undefined => state.configuration.setups.find((s) => s.slot === slot)?.id;
      const fresh = Array.from({ length: 18 }, (_, i) => ({ ...factorySetup(i + 1), id: idOf(i + 1) ?? factorySetup(i + 1).id }));
      const target = fresh.find((s) => s.id === state.selection.setupId) ?? fresh[0]!;
      const message = 'All 18 setups are back to factory.';
      // Links stay (like resetSetup): "Revert to its dump" is still a way back. Only a link of a setup that is gone is dropped.
      const ids = new Set(fresh.map((x) => x.id));
      commit({ ...state.configuration, setups: fresh }, message, {}, Object.fromEntries(Object.entries(links).filter(([id]) => ids.has(id))));
      // The selection is not saved with the library, so it may be published after `saveNow`.
      publish({ ...state, selection: { ...state.selection, setupId: target.id, control: null } });
      return result(message);
    },
    resetEncoderGroup(setupId, group) {
      return resetGroup(setupId, group, 'encoderGroups');
    },
    resetFaderButtonGroup(setupId, group) {
      return resetGroup(setupId, group, 'faderButtonGroups');
    },

    undo() {
      const previous = undoStack.at(-1);
      if (!previous) return refuse('Nothing to undo.');
      undoStack = undoStack.slice(0, -1);
      redoStack = [...redoStack, { configuration: state.configuration, marks, links }];
      return restore(previous);
    },
    redo() {
      const next = redoStack.at(-1);
      if (!next) return refuse('Nothing to redo.');
      redoStack = redoStack.slice(0, -1);
      undoStack = [...undoStack, { configuration: state.configuration, marks, links }];
      return restore(next);
    },

    whenSaved: () => chain,
    saveNow,
  };

  function restore({ configuration, marks: restored, links: restoredLinks }: Snapshot): CommandResult {
    marks = restored;
    // A link to a dump deleted since does not come back.
    links = Object.fromEntries(Object.entries(restoredLinks).filter(([, l]) => kept.some((k) => k.id === l.dump)));
    publish({
      ...state, configuration, ...derived(configuration), ...dumpFields(),
      selection: clamp(state.selection),
      canUndo: undoStack.length > 0, canRedo: redoStack.length > 0, message: undefined,
    });
    saveNow();
    return result();
  }

  return library;
}

// --- reading and writing one control without touching the rest ---
function groupKey(area: ControlArea): 'encoderGroups' | 'faderButtonGroups' {
  return isEncoderArea(area) ? 'encoderGroups' : 'faderButtonGroups';
}

function readControl(c: Uc4Config, a: ControlAddress): AnyControl | undefined {
  const setup = c.setups.find((s) => s.id === a.setupId);
  const group = setup?.[groupKey(a.area)][a.group] as (Record<string, unknown> | undefined);
  return (group?.[a.area] as AnyControl[] | undefined)?.[a.index];
}

function writeControl(c: Uc4Config, a: ControlAddress, control: AnyControl): Uc4Config {
  const key = groupKey(a.area);
  const swap = <T>(list: T[], i: number, item: T): T[] => list.map((x, k) => (k === i ? item : x));
  return {
    ...c,
    setups: c.setups.map((s) => {
      if (s.id !== a.setupId) return s;
      const groups = s[key] as (EncoderGroup | FaderButtonGroup)[];
      const next = groups.map((g, gi) => {
        if (gi !== a.group) return g;
        const record = g as unknown as Record<string, AnyControl[]>;
        return { ...g, [a.area]: swap(record[a.area]!, a.index, control) };
      });
      return { ...s, [key]: next } as Setup;
    }),
  };
}
