// The LibraryStorage the app uses: one IndexedDB database with one key-value store. Raw IndexedDB,
// no wrapper. Browser-checked (plan 0006 step 1); the busy/timeout paths are unit-tested in tests/storage/indexedDbStorage.test.ts.
import { StorageBusyError, type LibraryStorage, type StoredDump } from './storage.ts';

const DB_NAME = 'uc4-editor';
const STORE = 'kv';
const KEY = 'library';
const BASELINE_KEY = 'export-baseline';
const MARKS_KEY = 'dump-marks';
const LINKS_KEY = 'dump-links';
const SENDS_KEY = 'last-sends';
const WAIVERS_KEY = 'waived-warnings';
// Kept dumps: one entry each, `dump:<id>`; ';' is the character after ':' so the range holds exactly them.
const DUMP_PREFIX = 'dump:';
const QUARANTINE_PREFIX = 'library-unreadable-';

const done = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });

const OPEN_TIMEOUT_MS = 4000;

function openDb(factory: IDBFactory, timeoutMs: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (e: unknown) => { if (!settled) { settled = true; clearTimeout(timer); reject(e); } };
    // A database another tab holds never answers: give up after a while.
    const timer = setTimeout(() => fail(new StorageBusyError()), timeoutMs);
    let request: IDBOpenDBRequest;
    try { request = factory.open(DB_NAME, 1); } catch (e) { fail(e); return; }
    request.onupgradeneeded = () => { request.result.createObjectStore(STORE); };
    request.onsuccess = () => {
      const database = request.result;
      // Never block another tab's delete or upgrade.
      database.onversionchange = () => database.close();
      if (settled) { database.close(); return; } // opened after we gave up
      settled = true;
      clearTimeout(timer);
      resolve(database);
    };
    request.onerror = () => fail(request.error ?? new Error('IndexedDB could not be opened'));
    request.onblocked = () => fail(new StorageBusyError());
  });
}

/** Whether this browser has IndexedDB at all. */
export const indexedDbAvailable = (): boolean => typeof indexedDB !== 'undefined';

export interface IndexedDbOptions { openTimeoutMs?: number }

export function indexedDbStorage(factory: IDBFactory = indexedDB, options: IndexedDbOptions = {}): LibraryStorage {
  let db: Promise<IDBDatabase> | undefined;
  const connection = (): Promise<IDBDatabase> => {
    // A busy database stays failed until reload: later reads must not wait for another timeout.
    db ??= openDb(factory, options.openTimeoutMs ?? OPEN_TIMEOUT_MS).catch((e) => { if (!(e instanceof StorageBusyError)) db = undefined; throw e; });
    return db;
  };
  const get = async (key: string): Promise<string | null> => {
    const value: unknown = await done((await connection()).transaction(STORE).objectStore(STORE).get(key));
    // Anything but text is returned as text, so `load` refuses it and it is put aside, not overwritten.
    if (value === undefined) return null;
    return typeof value === 'string' ? value : JSON.stringify(value) ?? String(value);
  };
  const put = async (key: string, text: string): Promise<void> => {
    const tx = (await connection()).transaction(STORE, 'readwrite');
    const finished = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'));
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB write was aborted'));
    });
    tx.objectStore(STORE).put(text, key);
    await finished;
  };
  return {
    read: () => get(KEY),
    write: (text) => put(KEY, text),
    readExportBaseline: () => get(BASELINE_KEY),
    writeExportBaseline: (text) => put(BASELINE_KEY, text),
    readLinks: () => get(LINKS_KEY),
    writeLinks: (text) => put(LINKS_KEY, text),
    readSends: () => get(SENDS_KEY),
    writeSends: (text) => put(SENDS_KEY, text),
    readWaivers: () => get(WAIVERS_KEY),
    writeWaivers: (text) => put(WAIVERS_KEY, text),
    readDumps: async () => {
      const store = (await connection()).transaction(STORE).objectStore(STORE);
      const all: unknown[] = await done(store.getAll(IDBKeyRange.bound(DUMP_PREFIX, 'dump;', false, true)));
      return all.filter((d): d is StoredDump => typeof d === 'object' && d !== null && (d as StoredDump).bytes instanceof Uint8Array);
    },
    putDump: async (dump) => {
      const tx = (await connection()).transaction(STORE, 'readwrite');
      const finished = new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'));
        tx.onabort = () => reject(tx.error ?? new Error('IndexedDB write was aborted'));
      });
      tx.objectStore(STORE).put(dump, `${DUMP_PREFIX}${dump.id}`);
      await finished;
    },
    deleteDump: async (id) => {
      const tx = (await connection()).transaction(STORE, 'readwrite');
      const finished = new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('IndexedDB delete failed'));
        tx.onabort = () => reject(tx.error ?? new Error('IndexedDB delete was aborted'));
      });
      tx.objectStore(STORE).delete(`${DUMP_PREFIX}${id}`);
      await finished;
    },
    readMarks: () => get(MARKS_KEY),
    writeMarks: (text) => put(MARKS_KEY, text),
    quarantine: (text) => put(`${QUARANTINE_PREFIX}${new Date().toISOString()}`, text),
  };
}
