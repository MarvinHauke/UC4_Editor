// The storage interface through the in-memory implementation (the IndexedDB one is checked in the browser).
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { memoryStorage } from '../../src/storage/index.ts';

test('nothing stored reads as null; what is written is read back', async () => {
  const s = memoryStorage();
  assert.equal(await s.read(), null);
  await s.write('abc');
  assert.equal(await s.read(), 'abc');
  await s.write('def');
  assert.equal(await s.read(), 'def');
});

test('quarantine keeps unreadable text without touching the library', async () => {
  const s = memoryStorage('a');
  await s.quarantine('bad');
  assert.equal(await s.read(), 'a');
  assert.deepEqual(s.quarantined(), ['bad']);
});
