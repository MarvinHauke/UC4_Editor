// Name code `o` (0x17) is confirmed by Faderfox's list of the device's characters (2026-11-25), no pair shows it:
// the encoder writes it like every other character. (Other tests mark it likely on purpose, see markOLikely.ts.)
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { uc4Engine } from '../../src/protocol/engine.ts';
import { faderfoxUc4 } from '../../src/protocol/profiles/uc4.ts';

const src = { kind: 'file', name: 'x.syx' } as const;
const now = (): string => '2026-11-25T00:00:00.000Z';
const base = { bytes: new Uint8Array(readFileSync(new URL('../fixtures/sysex/base.syx', import.meta.url))), source: src, capturedAt: now(), engineVersion: '0' };

test('every name code is confirmed, `o` included', () => {
  assert.ok(faderfoxUc4.nameCodes.every((c) => c.confidence === 'confirmed'));
  assert.equal(faderfoxUc4.nameCodes[0x17]!.char, 'o');
  assert.equal(uc4Engine.canEncode({ what: 'groupName', group: 1, char: 1 }, 'o'), true);
});

test('a name with `o` encodes as code 0x17 and reads back', () => {
  const m = uc4Engine.parse(base.bytes, src, now);
  assert.ok(m.ok);
  const d = uc4Engine.decode(m.messages[0]!);
  assert.ok(d.ok);
  const setup = structuredClone(d.setups[0]!.setup);
  setup.encoderGroups[0]!.name = 'orp1';
  const e = uc4Engine.encode({ message: 'one', base, setups: [{ slot: 16, setup }] }, now);
  assert.ok(e.ok, e.ok ? '' : e.reason.message);
  const back = uc4Engine.parse(e.raw.bytes, src, now);
  assert.ok(back.ok);
  assert.equal(back.messages[0]!.image.bytes[0x1660], 0x17);
  const d2 = uc4Engine.decode(back.messages[0]!);
  assert.ok(d2.ok);
  assert.equal(d2.setups[0]!.setup.encoderGroups[0]!.name, 'orp1');
});
