// Where the library keeps its configuration between sessions (plan 0006 "Storage interface").
// It stores text only: the JSON a `save` made. Reading it back goes through `load`, like an import.

/** A kept dump as stored: the bytes exactly as they came, with what the list shows (plan 0005 decision 6). */
export interface StoredDump {
  id: string;
  /** ISO 8601: when the editor kept it. */
  date: string;
  /** `file`: imported from a file; `received`: sent by the UC4 over Web MIDI. */
  source: 'file' | 'received';
  fileName?: string;
  /** ISO 8601: when the UC4 last sent these bytes to the editor (a repeat of a kept dump updates it). Absent for a dump only imported from a file. */
  receivedAt?: string;
  /** `all`: a SndA; `one`: a Sndc; `unknown`: a received dump the engine could not read. */
  type: 'all' | 'one' | 'unknown';
  slots: number[];
  firmware: string;
  bytes: Uint8Array;
  /** Present when the engine refused this dump (not re-read when the engine changes; a later step may): kept as evidence, exportable and deletable, never imported (plan 0005 decision 10). */
  unreadable?: { reason: string; whatToDo: string };
  /** Set by "Clear old dumps" on what it kept (plan 0010 decision 8): the list hides it until "Show all". Absent = visible, so old stored libraries need no migration. A dump that arrives or is imported later is visible. */
  hidden?: true;
}

export interface LibraryStorage {
  /** The stored text, or null when nothing is stored yet. Rejects when storage cannot be read. */
  read(): Promise<string | null>;
  /** Replaces the stored text. Rejects when it cannot be written (full, blocked, private window). */
  write(text: string): Promise<void>;
  /** Keeps text that could not be read aside, so the next `write` does not destroy it. */
  quarantine(text: string): Promise<void>;
  /** The stored export baseline (what was last exported), as text, or null when nothing is stored. */
  readExportBaseline(): Promise<string | null>;
  writeExportBaseline(text: string): Promise<void>;
  /** The saved marks of unreadable dump values (plan 0005 decision 9), as text, or null when none are stored. */
  readMarks(): Promise<string | null>;
  writeMarks(text: string): Promise<void>;
  /** Which kept dump each setup came from (setup id → `{ dump, slot }`: the kept dump and the slot of it the setup came from), as text, or null when none is stored. */
  readLinks(): Promise<string | null>;
  writeLinks(text: string): Promise<void>;
  /** The last send per slot (plan 0005 step 14), as text, or null when none is stored. Kept out of the uc4-config JSON. */
  readSends(): Promise<string | null>;
  writeSends(text: string): Promise<void>;
  /** Every kept dump. Rejects when storage cannot be read. */
  readDumps(): Promise<StoredDump[]>;
  putDump(dump: StoredDump): Promise<void>;
  deleteDump(id: string): Promise<void>;
}

/** Storage that another tab holds (pending delete or upgrade): its `message` says what to do. */
export class StorageBusyError extends Error {
  constructor() {
    super("Your library is busy in another tab of this browser. Close the other UC4 Editor tabs and reload. Changes here aren't saved.");
    this.name = 'StorageBusyError';
  }
}
