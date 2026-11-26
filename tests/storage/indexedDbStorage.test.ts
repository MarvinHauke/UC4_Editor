// indexedDbStorage with a fake IDBFactory: a database another tab holds must not hang the library (known issue, 2026-11-15).
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { indexedDbStorage, openLibrary } from '../../src/storage/index.ts';

type Fake = { onsuccess?: () => void; onerror?: () => void; onblocked?: () => void; onupgradeneeded?: () => void; result?: unknown; error?: unknown };
const factoryWith = (act: (request: Fake) => void) => {
  const requests: Fake[] = [];
  const factory = { open: () => { const r: Fake = {}; requests.push(r); queueMicrotask(() => act(r)); return r; } } as unknown as IDBFactory;
  return { factory, requests };
};

test('an open that never answers times out: the library opens, unsaved, with a message', async () => {
  const { factory } = factoryWith(() => { /* never fires */ });
  const opened = await openLibrary(indexedDbStorage(factory, { openTimeoutMs: 20 }));
  assert.match(opened.message ?? '', /another tab/);
  assert.match(opened.message ?? '', /reload/i);
  assert.equal(opened.library.getState().saveStatus, 'failed');
  assert.equal(opened.library.getState().configuration.setups.length, 18);
});

test('a blocked open ends at once with the same message', async () => {
  const { factory } = factoryWith((r) => r.onblocked?.());
  const started = Date.now();
  const opened = await openLibrary(indexedDbStorage(factory, { openTimeoutMs: 5000 }));
  assert.ok(Date.now() - started < 1000);
  assert.match(opened.message ?? '', /another tab/);
});

test('the open is tried once, not once per read', async () => {
  const { factory, requests } = factoryWith(() => { /* never fires */ });
  await openLibrary(indexedDbStorage(factory, { openTimeoutMs: 20 }));
  assert.equal(requests.length, 1);
});

test('a connection that opens late is closed again, and a connection that is asked to change version closes', async () => {
  let closed = 0;
  const db = { close: () => { closed++; }, onversionchange: null as null | (() => void) };
  const { factory, requests } = factoryWith(() => { /* later */ });
  await openLibrary(indexedDbStorage(factory, { openTimeoutMs: 10 }));
  requests[0]!.result = db;
  requests[0]!.onsuccess?.();
  assert.equal(closed, 1);

  const db2 = { close: () => { closed++; }, onversionchange: null as null | (() => void) };
  const { factory: f2, requests: r2 } = factoryWith((r) => { r.result = db2; r.onsuccess?.(); });
  const storage = indexedDbStorage(f2, { openTimeoutMs: 1000 });
  void storage.read().catch(() => {});
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(r2.length, 1);
  assert.equal(typeof db2.onversionchange, 'function');
  db2.onversionchange?.();
  assert.equal(closed, 2);
});

test('the ignored warnings keep the old key "waived-warnings", so warnings waived before the rename stay ignored', async () => {
  const keys: { get: unknown[]; put: unknown[] } = { get: [], put: [] };
  const db = {
    close: () => {}, onversionchange: null,
    transaction: () => {
      const tx: Fake & { oncomplete?: () => void } = {};
      return {
        objectStore: () => ({
          get: (key: unknown) => { keys.get.push(key); const r: Fake = { result: 'OLD' }; queueMicrotask(() => r.onsuccess?.()); return r; },
          put: (_v: unknown, key: unknown) => { keys.put.push(key); queueMicrotask(() => (tx as { oncomplete?: () => void }).oncomplete?.()); },
        }),
        set oncomplete(f: () => void) { (tx as { oncomplete?: () => void }).oncomplete = f; },
        get oncomplete() { return (tx as { oncomplete?: () => void }).oncomplete as () => void; },
      };
    },
  };
  const { factory } = factoryWith((r) => { r.result = db; r.onsuccess?.(); });
  const storage = indexedDbStorage(factory, { openTimeoutMs: 1000 });
  assert.equal(await storage.readIgnored(), 'OLD');
  await storage.writeIgnored('[]');
  assert.deepEqual(keys.get, ['waived-warnings']);
  assert.deepEqual(keys.put, ['waived-warnings']);
});
