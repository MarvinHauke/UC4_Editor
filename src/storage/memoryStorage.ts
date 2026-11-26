// An in-memory LibraryStorage, for tests (and as the fallback when IndexedDB is not available).
import type { LibraryStorage, StoredDump } from './storage.ts';

export interface MemoryStorage extends LibraryStorage {
  /** The text now stored, without going through a promise. */
  text(): string | null;
  /** The kept dumps now stored, and the links text. */
  dumps(): StoredDump[];
  linksText(): string | null;
  /** The last-sends text now stored. */
  sendsText(): string | null;
  /** The waivers text now stored. */
  waiversText(): string | null;
  /** The marks text now stored. */
  marksText(): string | null;
  /** The export baseline text now stored. */
  baselineText(): string | null;
  /** What was put aside by `quarantine`, oldest first. */
  quarantined(): string[];
  /** The next `count` writes reject, to test a failing storage. */
  failNextWrites(count: number): void;
  /** Make `read` reject / `quarantine` reject, to test a storage that cannot be read. */
  failReads(on: boolean): void;
  failQuarantine(on: boolean): void;
}

export function memoryStorage(initial: string | null = null, initialBaseline: string | null = null, initialMarks: string | null = null): MemoryStorage {
  let stored = initial;
  let marksStored = initialMarks;
  let linksStored: string | null = null;
  let sendsStored: string | null = null;
  let waiversStored: string | null = null;
  const dumps = new Map<string, StoredDump>();
  let baseline = initialBaseline;
  let failures = 0;
  let failRead = false;
  let failQuar = false;
  const aside: string[] = [];
  return {
    read: async () => { if (failRead) throw new Error('storage unavailable'); return stored; },
    write: async (text) => {
      if (failures > 0) { failures--; throw new Error('storage is full'); }
      stored = text;
    },
    quarantine: async (text) => { if (failQuar) throw new Error('storage full'); aside.push(text); },
    readExportBaseline: async () => baseline,
    writeExportBaseline: async (text) => { baseline = text; },
    readMarks: async () => marksStored,
    writeMarks: async (text) => { marksStored = text; },
    marksText: () => marksStored,
    readLinks: async () => linksStored,
    writeLinks: async (text) => { linksStored = text; },
    linksText: () => linksStored,
    readSends: async () => sendsStored,
    writeSends: async (text) => { sendsStored = text; },
    sendsText: () => sendsStored,
    readWaivers: async () => waiversStored,
    writeWaivers: async (text) => { waiversStored = text; },
    waiversText: () => waiversStored,
    readDumps: async () => { if (failRead) throw new Error('storage unavailable'); return [...dumps.values()].map((d) => ({ ...d, bytes: d.bytes.slice() })); },
    putDump: async (d) => { dumps.set(d.id, { ...d, bytes: d.bytes.slice() }); },
    deleteDump: async (id) => { dumps.delete(id); },
    dumps: () => [...dumps.values()],
    baselineText: () => baseline,
    text: () => stored,
    quarantined: () => [...aside],
    failNextWrites: (count) => { failures = count; },
    failReads: (on) => { failRead = on; },
    failQuarantine: (on) => { failQuar = on; },
  };
}
