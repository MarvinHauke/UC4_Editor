# 0004 — Protocol engine

_Status: built — steps 1–5 done 2026-11-15 (`6f96685`, `194b129`, `9e08301`, `5f1612c`, `527af41`), engine 0.8.0 (0.5.0 at step 5; 0.6.0 = combined-se16; 0.7.0 = enc8g8-CCr1, decisions 12 and 14 applied; 0.8.0 = fader 9 codes, decision 17); interface decisions 3–22._
_Owner: uc4-protocol · Depends on: 0002, 0003_

## Problem

The app needs one place that turns dump bytes into a `uc4-config` setup and back, and that can be
improved as we learn the format without breaking saved files.

## Interface

_Proposal 2026-11-14 (uc4-protocol), to confirm with the user before any engine code (contract). Built on
`frame.ts` (`ParsedFrame`, `DumpRecord`), `image.ts` (`MemoryImage`, `ByteChange`) and `src/model/types.ts`
(`Setup`, `Encoder`, …). Format facts and confidence: `docs/protocol/uc4-sysex.md`._

One idea runs through it: **the raw dump is the truth, the model is a view of it.** `decode` reads a raw dump
into `Setup`s and keeps the dump; `encode` takes `Setup`s and a base dump, compares each field with what
`decode(base)` gives, and **patches only the fields that differ**, in a copy of the base. Everything else —
unknown bytes, `likely` fields, filler, padding — is copied. So decode → encode of an unchanged setup is
byte-identical by construction, and "confirmed only" is enforced at one place: a *changed* field that is not
confirmed stops the encode.

### Types

```ts
// src/protocol/types.ts — the engine's public vocabulary (pure data, no classes)

export type Confidence = 'confirmed' | 'likely' | 'unknown';

/** Every failure is data: what happened, and what to do next (same shape idea as model `LoadResult`). */
export interface Failure { code: FailureCode; message: string; whatToDo: string }
export type FailureCode =
  | 'not-sysex' | 'wrong-manufacturer' | 'unreadable-token' | 'incomplete-message'
  | 'wrong-length' | 'bad-checksum' | 'unknown-message-type' | 'unknown-firmware'
  | 'not-lossless'                // decode/encode: the frame cannot be written back unchanged
  | 'unreadable-field'            // decode: a byte outside the code tables
  | 'unconfirmed-fields'          // encode: a changed field is not confirmed
  | 'slot-move-unconfirmed'       // encode: setup.slot differs from the base's slot
  | 'no-base' | 'base-mismatch' | 'invalid-setup';

// ---- raw layer -----------------------------------------------------------------------------

export type DumpSource =
  | { kind: 'file'; name: string }
  | { kind: 'device'; port: string }       // received through Web MIDI
  | { kind: 'generated' };                 // made by encode()

/** One SysEx message, stored unchanged. Never edited; a changed dump is a new RawDump. */
export interface RawDump {
  bytes: Uint8Array;                       // F0 … F7, exactly as received or written
  source: DumpSource;
  capturedAt: string;                      // ISO 8601
  engineVersion: string;                   // engine that captured/generated it (CLAUDE.md rule)
}

// ---- parse ---------------------------------------------------------------------------------

export type MessageType = 'all' | 'one';   // SndA | Sndc (header cmd 2 = 03 | 02)

/** A message that framed correctly; `problems` lists what decode must refuse or warn about. */
export interface DumpMessage {
  raw: RawDump;
  type: MessageType;
  firmware: string;                        // '02.05' from header cmd 3/4
  frame: ParsedFrame;                      // frame.ts, unchanged
  image: MemoryImage;                      // image.ts, unchanged
  slots: number[];                         // 1–18 present in the message (one for 'one', all for 'all')
  problems: Failure[];                     // bad-checksum, wrong-length, not-lossless, unknown-firmware …
}

/** A .syx file or a capture may hold several messages (e.g. 18 × SndA, a Sndc series). */
export type ParseResult =
  /** `skipped`: a later message that failed (index = position among the F0…F7 messages, 0-based), with the reason; its bytes are also in `ignoredBytes`. */
  | { ok: true; messages: DumpMessage[]; skipped: { index: number; reason: Failure }[]; ignoredBytes: number }
  | { ok: false; reason: Failure };        // no message at all, or the first is not a UC4 dump

// ---- fields --------------------------------------------------------------------------------

export type ControlKind = 'encoder' | 'pushButton' | 'greenButton' | 'fader';
export type Property = 'type' | 'mode' | 'display' | 'channel' | 'number' | 'lower' | 'upper';

/**
 * Names one value of one setup, in the device's and the model's vocabulary. Fader 9 is
 * `{ control: 'fader', index: 9 }`; `group` is the encoder group for encoders and push buttons, the
 * fader/button group for green buttons and faders. 1-based, as on the display.
 */
export type FieldId =
  | { what: 'control'; control: ControlKind; group: number; index: number; property: Property }
  | { what: 'groupName'; group: number; char: number };         // char 1–4

/** A field of a setup in a slot — what diff and the encode report speak of. */
export interface SlotField { slot: number; field: FieldId }

/** A contiguous range of bytes in the image that no field of the profile covers (or that is `likely`). */
export interface ByteRange { address: number; length: number }

// ---- decode --------------------------------------------------------------------------------

export interface DecodedSetup {
  slot: number;                            // 1–18, from the addresses
  setup: Setup;                            // model type; id from options.makeId, name 'SE16' …
  /** Fields whose bytes were outside the code tables; the model holds the factory value there. */
  unreadable: SlotField[];
}

export type DecodeResult =
  | {
      ok: true;
      raw: RawDump;                        // the dump itself, kept next to its interpretation
      setups: DecodedSetup[];              // ascending slot order
      /** Image bytes not covered by any `confirmed` field. Informational: the bytes stay in `raw`. */
      unknownRegions: ByteRange[];
      warnings: Failure[];
    }
  | { ok: false; reason: Failure };        // bad checksum, wrong length, unknown message type …

export interface DecodeOptions { makeId?: (slot: number) => string }  // default 'slot-NN'; keeps the engine pure

// ---- encode --------------------------------------------------------------------------------

export interface EncodeRequest {
  setups: Array<{ slot: number; setup: Setup; source?: RawDump }>;   // slot = where each setup goes; source = the dump it came from (decision 23)
  /** Dump to patch. Omitted: the profile's factory image. */
  base?: RawDump;
  message: MessageType;                    // 'one' needs exactly one setup
}

export type EncodeResult =
  | {
      ok: true;
      raw: RawDump;                        // source 'generated', engineVersion = ENGINE_VERSION
      written: SlotField[];                // changed fields that were patched
      copied: ByteRange[];                 // every other byte range, taken unchanged from the base
    }
  | { ok: false; reason: Failure; blocked: SlotField[] };  // blocked = the unconfirmed or invalid fields

// ---- diff, capabilities --------------------------------------------------------------------

export interface ByteDiff extends ByteChange {          // image.ts: { address, before, after }
  slot: number | null;                     // null: outside the three per-setup regions
  field: FieldId | null;                   // null: no field covers this byte (or this changed nibble)
  confidence: Confidence | null;           // weakest of the field's position and the codes of both values; null when `field` is null
}

export interface Capabilities {
  engineVersion: string;
  profile: string;                         // 'faderfox-uc4'
  knownFirmware: readonly string[];        // ['02.05']
  /** `null` = the kind has no such property (push button: no display). */
  // `controls` and `fader9` are a per-kind SUMMARY (weakest over all positions / codes); `canEncode(field, value)` is the authority (Q9, Q11, Q14).
  controls: Record<ControlKind, Record<Property, Confidence | null>>;
  fader9: Record<Property, Confidence>;
  /** Per code: the confidence of each choice of an enum field (e.g. fader 9 `type`: CCAb and PrGC confirmed, Pbnd likely; rule: a code is confirmed where a pair shows it as before or after value, `uc4-sysex.md` top). */
  codes: Array<{ control: ControlKind | 'fader9'; property: Property; value: string; confidence: Confidence }>;
  /** Group-name character codes (`factory` in the format doc = `likely` here); the encoder writes only the `confirmed` ones. */
  nameCharacters: Array<{ char: string; code: number; confidence: Confidence }>;
  /** Group-name positions: groups 1–2, character 1 confirmed; the rest likely. */
  namePositions: Array<{ group: number; char: number; confidence: Confidence }>;
  slotPlacement: Confidence;               // the per-setup address strides
  slotMove: Confidence;                    // writing a setup at another slot than its base's
}
```

### Functions

```ts
export const ENGINE_VERSION: string;       // '0.1.0' from step 1; semver per Decisions below

export interface Engine {
  parse(bytes: Uint8Array, source: DumpSource, now?: () => string): ParseResult;
  decode(message: DumpMessage, options?: DecodeOptions): DecodeResult;
  encode(request: EncodeRequest, now?: () => string): EncodeResult;
  diff(a: DumpMessage, b: DumpMessage): ByteDiff[];
  cutSlot(sndA: RawDump, slot: number, now?: () => string): CutResult;  // decision 25
  capabilities(): Capabilities;
  /**
   * Is this one field with this value writable now? Per control position, per code, per name position. The answer is for a
   * value that differs from the base: an unchanged value always encodes. Read "no" as "you can't change this", not as
   * "this setup can't be exported".
   */
  canEncode(field: FieldId, value?: string | number): boolean;
}

export function createEngine(profile: DeviceProfile): Engine;
export const uc4Engine: Engine;            // createEngine(faderfoxUc4)
```

- **Pure and total.** No function throws at a user action; `now` is injected so tests are deterministic.
- **Messages vs dumps.** `parse` splits a file into messages (`splitMessages`), frames each (`parseFrame`),
  builds its image and checks sums, length and firmware. A problem is recorded in `problems`; `decode` refuses a
  message with a `bad-checksum`, `wrong-length` or `not-lossless` (`parse` already refused an `unknown-message-type`) and decodes one with only
  `unknown-firmware` (with a warning). So an import shows the reason instead of garbage.
- **`decode` keeps `raw`.** `unknownRegions` is derived (the image minus the confirmed field map), not stored
  state. Nothing needs it to rebuild the bytes: `encode` copies from `base.raw`. It is for the UI ("12 bytes of
  this dump are not understood") and for `diff`.
- **`encode` algorithm.** (1) base = `request.base` or the profile's factory image; its message type is rebuilt (only to the base's own type until Q12 is decided: 'one' without a 'one' base is blocked, so from the factory image only 'all' works)
  to `request.message` (a `Sndc` is the 22 records of one slot; a `SndA` is all 430). (2) For each setup,
  `decode` the base slot and compare field by field. (3) Equal → keep the base bytes. Different → the field
  must be `confirmed` (and the control position, the enum code and the name position confirmed, per `capabilities()`; and
  the slot equal to the base's unless `slotMove` is confirmed) or the whole call returns `unconfirmed-fields` with the list in `blocked`. (4)
  Recompute the sum of every changed record; keep padding, header and trailer as in the base. (5) Parse the result
  again (one clean message of the base's type, length and slots), then return the new `RawDump` (`source: generated`).
  A field that is unreadable in the base is written only when the request differs from its factory fallback; a `Setup`
  whose own `slot` differs from the target slot is `slot-move-unconfirmed`. `encode` does not check model rules (for
  example `CCAh` ≤ 31): the caller runs the model's `validate` first.
- **Encode also writes bytes that are only `likely`, by necessity**: the sum of every changed record and, when
  the request's message type differs from the base's (or there is no base), the rebuilt header and record set.
  These are framing, not fields; the plan says so instead of implying it (question 12).
- **`decode` never hides a problem.** `DecodedSetup.unreadable` holds the factory value so the `Setup` stays
  valid; the UI must show these fields as a problem, never as the device's value.
- **Restore from JSON alone loses what the model cannot hold.** `encode` without a base resets every byte the
  model has no field for (e.g. SE02's push-button `+4` low nibble) to the factory value. The raw dump in the
  backup is what keeps them; the UI says so before such a restore.
- **Round-trip test (always runs).** For every fixture: `encode({ setups: decode(m).setups, base: m.raw,
  message: m.type }).raw.bytes` equals `m.raw.bytes`. A fixture that breaks it is a finding.
- **Setup fields that are not in a dump** (`id`, `name`, `notes`, `label`s) are model-only. `decode` fills `name`
  with the slot's display name (`SE16`) and `id` with `makeId`; `encode` ignores them.

### Where the device profile sits

```
src/protocol/
  types.ts           the types above (engine vocabulary)
  engine.ts          createEngine(profile): the algorithms; knows no UC4 constant
  frame.ts image.ts  record framing and memory image (their UC4 constants stay in `frame.ts` as defaults, which `profiles/uc4.ts` imports; `parseFrame`/`writeFrame` take them as `FrameRules`)
  profile.ts         interface DeviceProfile
  profiles/uc4.ts    faderfoxUc4: DeviceProfile
tests/fixtures/sysex/   fixtures (+ .json notes); tests/protocol/…
```

```ts
export interface DeviceProfile {
  id: 'faderfox-uc4';
  knownFirmware: readonly string[];
  framing: { manufacturerId: number[]; recordDataLength: number; padding: number; messageTypes: Record<number, MessageType>;
             recordsPerMessage: Record<MessageType, number> };
  layout: { slotCount: 18; regions: Region[] };            // names, fader 9 table, block; strides per setup
  /** One entry per (kind, property): where the bytes are, how to read/write them, how sure we are. */
  fields: FieldSpec[];
  nameCodes: Array<{ char: string; code: number; confidence: Confidence }>;
  factoryDump(): Uint8Array;                               // the factory SndA bytes, for encode without a base (step 4)
}
```

The engine core is device-neutral; only `faderfoxUc4` knows the manufacturer id, the strides, the code tables and
the confidence per field. The model types stay UC4's (`Setup`), so a second device would add its own model next to
the first; the profile only keeps *this engine* free of UC4 constants. Confidences live **only** in the
profile's `fields`/`nameCodes` tables, written from `uc4-sysex.md`; `capabilities()` and `canEncode` read them.

Step-1 skeleton (`profile.ts`): `id` is a plain string; `deviceName`, `framing.messageNames`, `messageLength` and
`slotsPerMessage` were added (message text uses the device's words); `fields`, `nameCodes` and `factoryDump` come with
steps 2–5. `ENGINE_VERSION` is `'0.1.0'` from step 1 (first release, `parse`); step 2 bumps it to the next minor.

## Decisions

1. Byte-identical round trip of every fixture is a test that always runs.
2. Engine version bumps: patch for a fix, minor for newly confirmed fields, major for a changed
   interpretation of an existing field.
3. **Interface confirmed** (user, 2026-11-15: "all as recommended", the 14 questions of
   2026-11-14). The interface above is the contract; a change to it goes to the user again.
4. `encode` patches a base dump; it doesn't build bytes from the model (Q1). Why: byte-identical
   output is impossible while most bytes are unknown.
5. No base = the factory `SndA` image shipped in the engine as a generated TS asset, tested against
   `factory-SndA.syx`; message type `all` only until the send test (Q2).
6. A changed field that isn't confirmed fails the whole encode with `unconfirmed-fields` and the
   list (Q3). Rejected: skipping them, since a restored backup would silently differ from the edit.
7. Writing a setup to another slot than its base's is `slotMove: likely`, blocked until the
   copy-to-slot test on a scratch slot with the user's yes (Q4). The block reads `profile.slot.move`; once it is confirmed,
   a 'one' base without the target slot's addresses still fails, as `base-mismatch` ("no byte at 0x…").
8. (reworded by 18) `bad-checksum`, `wrong-length`, `not-lossless` make `decode` refuse, and `parse` refuses `unknown-message-type`
   (decisions 18–19); `unknown-firmware` only warns, and `encode` works on a known-firmware base only (Q5).
9. `decode` invents `Setup.id` from an injected `makeId` (default `slot-NN`) and `Setup.name` =
   the slot name (`SE16`), no `notes`/`label`; storage replaces the id on import (Q6).
10. `createEngine(profile)` plus `uc4Engine`; the UI imports `uc4Engine` (Q7).
11. `parse` returns several messages (18 `SndA`, a `Sndc` series); the device page and `.syx`
    import share one path (Q8).
12. **Nibbles with one-sided evidence stay `likely`** (Q9; architect's recommendation, accepted by
    the user): green-button `mode`, fader `display` and the encoder `type` at control 8 are
    confirmed at control 1 only. They become confirmed with the combined dump of decision 14.
   **Applied 2026-11-16** (`combined-se16`): green `mode` at control 8 (`btn8` `btn` → `toGL`) and fader `display` at control 8 (`FAd8` `Std` → `OFF`) are confirmed; with control 1 they are confirmed between the ends too (engine 0.6.0). The encoder `type` at control 8 (`Enc8` `CCAb` → `CCr1`) was not confirmed by that dump (an unpredicted byte on that control, the `CCAh` clamp, 0003 decision 8). **Applied 2026-11-16 (second):** the single-change dump `enc8g8-CCr1` (turned down via `CCr2`, one byte `0x673F`) confirms it at control 8, so the encoder `type` is confirmed between the ends too (engine 0.7.0). Decision 12 is complete.
   Applied (architect, 2026-11-15, step 2 review): within one kind a nibble is confirmed between the ends only if it is confirmed at both ends, so the encoder `type` is `likely` at every position but g1c1.
13. Fader 9 is `{ control: 'fader', index: 9 }` in `FieldId`; its own table stays an engine
    detail (Q10).
14. Push button, green button and fader: "confirmed at g1c1/g8c8, order likely"; the encoder
    writes those kinds only there, the decoder reads all (Q11). **One combined SE16 dump** settles
    the order and decision 12: `Pbt8` of group 1, `btn1` of group 8, `FAd8` of group 1, plus the
    three nibbles at control 8.
    **Applied 2026-11-16** (`combined-se16`): the three off-diagonal controls landed at the group-major bytes (7, 56, 7), so the order is confirmed for push button, green button and fader, and the encoder writes them at every control (engine 0.6.0). This dump has six changes and so overrides the limit of three in 0003 decision 8, as decision 14 asked.
15. Framing and record sums are confirmed by the rule matching every record of every fixture (a
    test); rebuilding a message type other than the base's waits for the send test (Q12).
16. Slot placement counts as confirmed: the device wrote the addresses (six `Sndc`, the factory
    match over 14 setups), nothing is guessed (Q13).
17. Confidence is carried per code (`Capabilities.codes`): fader 9 `JMP`, `Std`, `CCAb`
    confirmed; `Pbnd`, `AFtt`, `bPoL` not (Q14).
    **Applied 2026-11-16** (`fad9g1-Pbnd`, `fad9g1-AFtt`, `fad9g1-bPoL`, three single-change dumps): all fader 9 codes are confirmed (engine 0.8.0). Faders 1–8 were confirmed already by `fad1-*`.

18. **`parse` refuses `unknown-message-type`;** `decode` refuses `bad-checksum`, `wrong-length` and
    `not-lossless` (user, 2026-11-15, step 1 review). Rewords decision 8, which named `decode` for
    all three: a message of unknown type can't become a `DumpMessage` ('all' | 'one').
19. **New failure code `not-lossless`:** a frame where writing back what was read doesn't give the
    same bytes. `decode` refuses it and `encode` refuses it as a base (user, 2026-11-15). Why:
    `encode` patches `base.raw` through the frame, so a lossy base would drop bytes silently.
    `unreadable-token` keeps its one meaning (a byte that isn't a token).
20. **`ParseResult` (ok) carries `skipped: { index; reason: Failure }[]`:** a later message of a
    capture that fails is listed with its reason, not only counted in `ignoredBytes` (user,
    2026-11-15). Why: in an 18-message `SndA` capture the user must learn why message 5 is missing.
21. **Conflicting records are `not-lossless`:** a message whose records write different values to one address is refused like any other lossy frame. The Failure names the count, the first address and its setup (user, 2026-11-15, step 2 review). Why: never seen in any fixture; the image is built per message, so it can only come from a damaged or foreign file. A new code was rejected, and so was last-write-wins (a silent guess).
22. **`encode(request, now?)`** takes the injected clock like `parse` (uc4-architect OK, 2026-11-15, step 3): `capturedAt` of the generated dump needs one, and tests stay deterministic.
23. **`EncodeRequest.setups[i].source?: RawDump`** (uc4-architect, 2026-11-16, plan 0007 step 3.1; engine 0.9.0). Before patching, `encode` copies that setup's three per-slot regions (group names, fader 9 row, block) from `source` into the message built on `base` (or the factory image), then patches the setup against the result. Why: a `SndA` made of setups from different dumps keeps every setup's unknown bytes (decision 4). Rules: the source must hold the slot, else `slot-move-unconfirmed` with no blocked fields; a source that does not read losslessly (or has a wrong sum, unknown firmware) fails with that code; a source that is not exactly one message, or lacks a byte of the slot, fails with `base-mismatch` (the text says "the dump a setup came from", so the UI must not call it "the base"); `copied` counts source bytes as copied, `written` only patched fields. Without `source` nothing changes. Tests: `tests/protocol/engine-encode-source.test.ts`.
24. **Group names confirmed** (engine 0.10.0, 2026-11-16): two combined name dumps (`names-g1-4`, `names-g5-8`; the user's decision that names may be changed in combined dumps overrides 0003 Q15 for this session) confirm all 32 positions and every character code except `o` (`17`): the planned `o` was set as `a`. `confirmedNamePositions` lists all 32; the encoder writes any position, any confirmed character. Observation only: a name byte `FF` (after a paste of an empty clipboard on the device) reads as unreadable, the byte is kept. Why: each pair encodes byte-identical from its predecessor, and every changed byte is a predicted name character.
25. **`cutSlot(sndA, slot, now?)`** (uc4-editor-a2 via uc4-architect, 2026-11-18, plan 0005 decision 30; engine 0.11.0). Returns the `Sndc` the UC4 sends for that slot, cut from a `SndA`: the SndA's header with message type `02`, the slot's 22 records in the device's order (group names 32 bytes, fader 9 row, 20 block records) at the slot's own addresses, the SndA's data, recomputed sums, the same padding and trailer. `encode` is unchanged: it takes the cut as its `base`. Refusals are results: not exactly one clean `SndA` (the `parse` codes, `bad-checksum`, `wrong-length`, `unknown-firmware`, `base-mismatch` for a `Sndc`), slot outside 1–18 or not an integer (`invalid-setup`), a byte of the slot missing (`base-mismatch`). The result is parsed again before it is returned (`not-lossless` if it is not a clean `Sndc` of that slot). Why: any setup can be sent from the fresh `SndA` without an imported `Sndc`, and step 14 restores one setup from a backup. Tests (`tests/protocol/engine-cutslot.test.ts`): SE16 cut from `2026-11-18-SndA-before-damaged-C` equals `2026-11-18-SE16-after-rESc` byte for byte; SE01, SE02, SE09, SE17, SE18 cut from `2026-11-13-SndA-before-rESA` equal the five 2026-11-13 `Sndc` dumps; the factory SndA's SE16 with group-1 name `send` encoded on the cut equals `2026-11-17-send2-SE16-g1-send`.

## Open questions

None for the interface. Decisions 12 and 14 are settled (`combined-se16`, `enc8g8-CCr1`, 2026-11-16).


## Steps

1. Interface confirmed by the user; framing + `parse` with fixtures (`createEngine`, profile skeleton, `DumpMessage`). **Done** (`6f96685`, 428 tests).
2. `decode` for confirmed fields, `unknownRegions` derived; round-trip test needs step 3, so the test starts
   as "decode then compare fields with the fixture notes". **Done** (`194b129`, 513 tests). `factory-SndA` decodes to `factorySetup(1…18)`; every
   fixture pair changes exactly its noted field in the decoded model. `ENGINE_VERSION` is `'0.2.0'`.
3. `encode` with a base (patch algorithm, sums; per-position and per-code gate), round trip of every fixture green. **Done** (`9e08301`, 683 tests). Every fixture pair is also reproduced byte for byte from its predecessor (sums included). `ENGINE_VERSION` is `'0.3.0'`.
4. `encode` without a base (factory image asset) and `diff`. **Done** (`5f1612c`, 769 tests). The asset is `src/protocol/profiles/uc4FactoryImage.ts` (27,520 bytes as base64, 37 KB source, 3 KB gzipped), generated by `tools/uc4-factory.ts` and tested against the fixture. `DeviceProfile.factoryDump()` returns the SndA bytes (instead of the sketched `factoryImage()`: `encode` parses them like any base). `ENGINE_VERSION` is `'0.4.0'`.
5. `capabilities` / `canEncode`, driven by the profile tables. **Done** (`527af41`, 777 tests). `controls` is the weakest confidence over every position of a kind (`canEncode` is the authority); `fader9` the weakest over its codes. `canEncode` and `encode` share one rule, and a property test checks that they agree. `ENGINE_VERSION` is `'0.5.0'`. This finishes 0004.
