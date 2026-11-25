// The engine's public vocabulary (plan 0004, "Interface"). Pure data, no classes.
// Step 1 holds what `parse` touches; later steps add decode/encode/diff/capabilities types.
import type { ParsedFrame } from './frame.ts';
import type { ByteChange, MemoryImage } from './image.ts';
import type { Setup } from '../model/types.ts';

export type Confidence = 'confirmed' | 'likely' | 'unknown';

/** Every failure is data: what happened, and what to do next. */
export interface Failure { code: FailureCode; message: string; whatToDo: string }
export type FailureCode =
  | 'not-sysex' | 'wrong-manufacturer' | 'unreadable-token' | 'incomplete-message'
  | 'wrong-length' | 'bad-checksum' | 'unknown-message-type' | 'unknown-firmware'
  | 'not-lossless'                // decode/encode: the frame cannot be written back unchanged
  | 'unreadable-field'            // decode: a byte outside the code tables
  | 'unconfirmed-fields'          // encode: a changed field is not confirmed
  | 'slot-move-unconfirmed'       // encode: setup.slot differs from the base's slot
  | 'no-base' | 'base-mismatch' | 'invalid-setup'
  | 'outside-write-area'          // checkSendable: a record lies outside the three areas the device allows writing
  | 'unsafe-download-type';       // checkSendable: not a one-setup or all-setups download (e.g. firmware, type 01)

export type DumpSource =
  | { kind: 'file'; name: string }
  | { kind: 'device'; port: string }       // received through Web MIDI
  | { kind: 'generated' };                 // made by encode()

/** One SysEx message, stored unchanged. Never edited; a changed dump is a new RawDump. */
export interface RawDump {
  bytes: Uint8Array;                       // F0 … F7, exactly as received or written
  source: DumpSource;
  capturedAt: string;                      // ISO 8601
  engineVersion: string;                   // engine that captured/generated it
}

export type MessageType = 'all' | 'one';   // SndA | Sndc (header cmd 2 = 03 | 02)

/** A message that framed correctly; `problems` lists what decode must refuse or warn about. */
export interface DumpMessage {
  raw: RawDump;
  type: MessageType;
  firmware: string;                        // '02.05' from header cmd 3/4
  frame: ParsedFrame;
  image: MemoryImage;
  slots: number[];                         // 1–18 present in the message
  problems: Failure[];
}

/** A .syx file or a capture may hold several messages (e.g. 18 × SndA, a Sndc series). */
export type ParseResult =
  /** `skipped`: a later message that failed (index = its position among the F0…F7 messages, 0-based), with the reason; its bytes are also in `ignoredBytes`. */
  | { ok: true; messages: DumpMessage[]; skipped: { index: number; reason: Failure }[]; ignoredBytes: number }
  | { ok: false; reason: Failure };

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
  | { ok: false; reason: Failure };        // bad checksum, wrong length, not lossless …

export interface DecodeOptions { makeId?: (slot: number) => string }  // default 'slot-NN'; keeps the engine pure

// ---- encode --------------------------------------------------------------------------------

export interface EncodeRequest {
  /**
   * `slot` = the slot each setup goes to. `source` = the dump the setup came from: its three per-slot regions
   * (group names, fader 9 row, block) are copied from it into the message before the setup is patched, so the
   * bytes the engine does not understand survive. The source must hold that slot (else `slot-move-unconfirmed`)
   * and read losslessly. Omitted: the setup is patched on `base` (or the factory image).
   */
  setups: Array<{ slot: number; setup: Setup; source?: RawDump }>;
  /** Dump to patch. Omitted: the profile's factory image (step 4; until then `no-base`). */
  base?: RawDump;
  message: MessageType;                    // 'one' needs exactly one setup
}

export type EncodeResult =
  | {
      ok: true;
      raw: RawDump;                        // source 'generated', engineVersion = ENGINE_VERSION
      written: SlotField[];                // changed fields that were patched
      copied: ByteRange[];                 // every other byte range, taken unchanged from the base or, for a setup with `source`, from that dump (decision 23) (a byte with one nibble patched counts as written)
    }
  | { ok: false; reason: Failure; blocked: SlotField[] };  // blocked = the unconfirmed or invalid fields; empty for base refusals and slot moves

// ---- cutSlot -------------------------------------------------------------------------------

export type CutResult =
  | { ok: true; raw: RawDump }             // a Sndc, source 'generated'
  | { ok: false; reason: Failure };

// ---- diff ----------------------------------------------------------------------------------

export interface ByteDiff extends ByteChange {          // image.ts: { address, before, after }
  slot: number | null;                     // null: outside the three per-setup regions
  field: FieldId | null;                   // null: no field covers this byte (or this changed nibble)
  confidence: Confidence | null;           // weakest of the field's position and the codes of both values; null when `field` is null
}

// ---- capabilities --------------------------------------------------------------------------

export interface Capabilities {
  engineVersion: string;
  profile: string;                         // 'faderfox-uc4'
  knownFirmware: readonly string[];        // ['02.05']
  /**
   * Per kind and property: the weakest confidence over every position of the kind; `null` = the kind has no such
   * property (push button: no display). A SUMMARY: `canEncode(field, value)` is the authority, because the position
   * (group 1 control 1 only, say) and the code both matter.
   */
  controls: Record<ControlKind, Record<Property, Confidence | null>>;
  /** Fader 9: the weakest confidence over its codes; the codes list has the detail. */
  fader9: Record<Property, Confidence>;
  /** Per code of an enum field: the code's own confidence (position is separate). */
  codes: Array<{ control: ControlKind | 'fader9'; property: Property; value: string; confidence: Confidence }>;
  /** Group-name characters with their code's confidence; the encoder writes only the `confirmed` ones. */
  nameCharacters: Array<{ char: string; code: number; confidence: Confidence }>;
  /** Group-name positions: groups 1–2, character 1 confirmed; the rest likely. */
  namePositions: Array<{ group: number; char: number; confidence: Confidence }>;
  slotPlacement: Confidence;               // the per-setup address strides
  slotMove: Confidence;                    // writing a setup at another slot than its base's
}
