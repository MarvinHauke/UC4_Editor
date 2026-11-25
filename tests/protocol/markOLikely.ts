// Test helper: since 2026-11-25 every name character is confirmed (`o` by Faderfox's list), so no field is left that the encoder
// blocks. The tests of the gate itself ("a likely field blocks the encode") need one: this marks `o` (0x17) as `likely` in the UC4
// profile for the importing test file only (vitest isolates modules per file). Import it FIRST in a file, before anything that
// imports the engine (the engine reads the profile when it is created). `tests/protocol/name-o.test.ts` tests the real `o`.
import { faderfoxUc4 } from '../../src/protocol/profiles/uc4.ts';

const o = faderfoxUc4.nameCodes[0x17]!;
if (o.char !== 'o') throw new Error('markOLikely: code 0x17 is not `o`');
(o as { confidence: string }).confidence = 'likely';
