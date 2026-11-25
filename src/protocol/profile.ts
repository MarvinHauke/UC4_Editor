// A device profile: everything the engine core must not know about one device (plan 0004, "Where the device profile sits").
// Holds the framing, the slot layout and the field tables with their confidence. Name codes of the encoder groups
// and the factory image for `encode` without a base come with later steps.
import type { Confidence, ControlKind, MessageType, Property } from './types.ts';

/** One per-setup region of the memory image: setup `s` (1-based) starts at `base + stride·(s−1)`. */
export interface Region { name: string; base: number; stride: number; size: number }

/** How sure we are of a field at a control: group 1 control 1, group 8 control 8, any other. */
export interface PositionConfidence { first: Confidence; last: Confidence; between: Confidence }

/** One choice of an enum field: the model's name, the device code, how sure we are. */
export interface CodeSpec { name: string; code: number; confidence: Confidence }

/**
 * Where one property of a control lives, and how sure we are. `field` is the byte field within the kind's
 * five (block fields 0–4; for fader 9 the byte offset in the record). A byte holds one property
 * (`nibble: 'byte'`) or two (`'high'` and `'low'`).
 */
export interface FieldSpec {
  control: ControlKind;
  property: Property;
  field: number;
  nibble: 'byte' | 'high' | 'low';
  /** Absent: the value is plain (number, lower, upper) or the channel (low nibble = channel − 1). */
  codes?: readonly CodeSpec[];
  confidence: PositionConfidence;
}

export interface DeviceProfile {
  id: string;
  /** Name shown in messages, e.g. 'UC4'. */
  deviceName: string;
  /** MIDI port name as the OS lists it (docs/reference/uc4-device.md, "Setup mode"); `src/midi` matches ports by it. */
  portName: string;
  /** Ordered steps, in the device's words, to make the device send a dump (`Sndc` = 'one', `SndA` = 'all'); the UI lists them. */
  sendSteps: Readonly<Record<MessageType, readonly string[]>>;
  knownFirmware: readonly string[];
  framing: {
    manufacturerId: readonly number[];
    recordDataLength: number;
    /** Zero bytes after every record's sum (as the device writes them). */
    padding: number;
    /**
     * Header command 2 values a dump may be sent with (`02` one setup, `03` all setups). A separate list from `messageTypes` on
     * purpose: a type the engine learns to read is not thereby allowed to go out. `01` is the firmware and never written.
     */
    writeTypes: readonly number[];
    /** Header command 2 value → message type. */
    messageTypes: Readonly<Record<number, MessageType>>;
    recordsPerMessage: Readonly<Record<MessageType, number>>;
    /** Exact byte length of a message of each type. */
    messageLength: Readonly<Record<MessageType, number>>;
    /** Device vocabulary for messages, e.g. 'Sndc'. */
    messageNames: Readonly<Record<MessageType, string>>;
    slotsPerMessage: Readonly<Record<MessageType, number>>;
  };
  layout: {
    slotCount: number;
    regions: readonly Region[];
    /** Size of one byte field of the setup block (one property of every control of a kind). */
    fieldSize: number;
    /** Where each kind's five fields start in the block, and its groups × controls (fader 9 is separate). */
    controls: Readonly<Record<ControlKind, { firstField: number; groups: number; perGroup: number }>>;
    /** Fader 9 table: `groups` records of `recordSize` bytes. */
    fader9: { groups: number; recordSize: number };
    /** Group names: `groups` names of `chars` bytes. */
    names: { groups: number; chars: number };
    /**
     * The only address ranges a dump may write (`from` inclusive, `to` exclusive), as the manufacturer's documentation sizes them
     * (private: Faderfox's UC4 format, 2026-11-25). Includes the two internal copy slots 19 and 20. `checkSendable` refuses a record
     * outside them.
     */
    writeAreas: readonly { name: string; from: number; to: number }[];
  };
  /** Block fields of the four kinds (fader 1–8). */
  fields: readonly FieldSpec[];
  /** Fader 9 record fields (control 'fader'). */
  fader9Fields: readonly FieldSpec[];
  /** How sure we are of the slot layout (stride per setup) and of writing a setup to another slot than its base's. */
  slot: { placement: Confidence; move: Confidence };
  /** The profile's factory SndA as dump bytes: what `encode` patches when it is given no base. */
  factoryDump(): Uint8Array;
  /** Group-name characters by device code (index = code); `confidence` is per code. */
  nameCodes: ReadonlyArray<{ char: string; code: number; confidence: Confidence }>;
  /** Name positions confirmed by a pair, as [group, char] (1-based); the rest are likely. */
  confirmedNamePositions: ReadonlyArray<readonly [number, number]>;
}
