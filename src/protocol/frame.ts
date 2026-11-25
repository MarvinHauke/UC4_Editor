// Frame layer of a UC4 dump: bytes -> header, records, trailer. Pure, never throws.
// Format knowledge and its confidence: docs/protocol/uc4-sysex.md (framing and record sums `confirmed`, plan 0004 decision 15).

export const SYSEX_START = 0xf0;
export const SYSEX_END = 0xf7;
/** Bytes after F0 that every UC4 dump starts with (manufacturer id, `likely`). */
export const MANUFACTURER_ID = [0x00, 0x00, 0x00] as const;
/** Data bytes per full record (command D count); a shorter record occurs (Sndc names: 32). */
export const RECORD_DATA_LENGTH = 64;

export interface DumpRecord {
  /** Memory address of the first data byte. */
  address: number;
  data: Uint8Array;
  /** 16-bit sum as written in the dump (commands B/C). */
  sumInDump: number;
  /** 16-bit sum computed from the data. */
  sumComputed: number;
  sumOk: boolean;
  /** Offset of the record's first token (command 9) in the frame bytes. */
  frameOffset: number;
  /** Zero bytes after the record's sum command (30 in every real dump seen). */
  paddingAfter: number;
}

export interface ParsedFrame {
  /** Header commands 1–4 in order, as decoded bytes. */
  header: number[];
  records: DumpRecord[];
  /** Trailer command F value, if present. */
  trailer: number | null;
  /** Zero bytes that belong to no record (before the first record, after the trailer). */
  strayPadding: number;
  /**
   * True when `writeFrame(frame)` reproduces the received bytes exactly. False for a frame with
   * unknown or misplaced commands, stray bytes or odd header order: such a frame must not be
   * re-encoded from this structure (the warnings say why).
   */
  lossless: boolean;
}

/** What the frame layer needs from a device profile; defaults are the UC4 values above. */
export interface FrameRules { manufacturerId: readonly number[]; recordDataLength: number }
export const UC4_FRAME_RULES: FrameRules = { manufacturerId: MANUFACTURER_ID, recordDataLength: RECORD_DATA_LENGTH };

export type FrameFailureCode = 'not-sysex' | 'wrong-manufacturer' | 'unreadable-token' | 'incomplete-message';

export type FrameResult =
  | { ok: true; frame: ParsedFrame; warnings: string[] }
  | { ok: false; code: FrameFailureCode; reason: string; warnings: string[] };

/** Splits a byte stream (a `.syx` file or a capture) into F0…F7 messages. Bytes outside messages are ignored. */
export function splitMessages(bytes: Uint8Array): Uint8Array[] {
  const out: Uint8Array[] = [];
  let start = -1;
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === SYSEX_START) start = i;
    else if (bytes[i] === SYSEX_END && start >= 0) {
      out.push(bytes.subarray(start, i + 1));
      start = -1;
    }
  }
  return out;
}

/** One token = command byte `4c`, then `2h`, `1l`: value (h << 4) | l. */
function readToken(b: Uint8Array, i: number): { cmd: number; value: number } | null {
  if (i + 2 >= b.length) return null;
  const c = b[i]!, h = b[i + 1]!, l = b[i + 2]!; // in range: i + 2 < b.length
  if ((c & 0xf0) !== 0x40 || (h & 0xf0) !== 0x20 || (l & 0xf0) !== 0x10) return null;
  return { cmd: c & 0x0f, value: ((h & 0x0f) << 4) | (l & 0x0f) };
}

export function parseFrame(bytes: Uint8Array, rules: FrameRules = UC4_FRAME_RULES): FrameResult {
  const warnings: string[] = [];
  if (bytes.length < 5 || bytes[0] !== SYSEX_START || bytes[bytes.length - 1] !== SYSEX_END)
    return { ok: false, code: 'not-sysex', reason: 'not a SysEx message (missing F0 … F7)', warnings };
  for (let k = 0; k < rules.manufacturerId.length; k++)
    if (bytes[1 + k] !== rules.manufacturerId[k])
      return { ok: false, code: 'wrong-manufacturer', reason: 'not a dump of this device (wrong manufacturer id)', warnings };

  const header: number[] = [];
  const records: DumpRecord[] = [];
  let trailer: number | null = null;
  let padding = 0;
  let cur: { pad: number; start: number; hi?: number; lo?: number; data: number[]; sumHi?: number; sumLo?: number } | null = null;

  const closeRecord = (): void => {
    if (!cur) return;
    if (cur.hi === undefined || cur.lo === undefined || cur.sumHi === undefined || cur.sumLo === undefined) {
      warnings.push(`incomplete record at frame offset ${cur.start}`);
    } else {
      const data = Uint8Array.from(cur.data);
      let sum = 0;
      for (const v of data) sum = (sum + v) & 0xffff;
      const sumInDump = (cur.sumHi << 8) | cur.sumLo;
      records.push({ address: (cur.hi << 8) | cur.lo, data, sumInDump, sumComputed: sum, sumOk: sum === sumInDump, frameOffset: cur.start, paddingAfter: cur.pad });
    }
    cur = null;
  };

  let i = 1 + rules.manufacturerId.length;
  const end = bytes.length - 1;
  while (i < end) {
    // Zeros go to the open record's paddingAfter, else to strayPadding (written after the trailer); a misplacement shows up as lossless=false.
    if (bytes[i] === 0x00) { if (cur) cur.pad++; else padding++; i++; continue; }
    const t = readToken(bytes, i);
    if (!t) return { ok: false, code: 'unreadable-token', reason: `unreadable byte ${bytes[i]!.toString(16)} at offset ${i}`, warnings };
    const at = i;
    i += 3;
    switch (t.cmd) {
      case 0x1: case 0x2: case 0x3: case 0x4:
        if (records.length > 0 || cur) warnings.push(`header command ${t.cmd} after a record at offset ${at}`);
        if (header[t.cmd - 1] !== undefined) warnings.push(`header command ${t.cmd} repeated at offset ${at}`);
        header[t.cmd - 1] = t.value;
        break;
      case 0x9: closeRecord(); cur = { pad: 0, start: at, hi: t.value, data: [] }; break;
      case 0xa: if (cur) cur.lo = t.value; else warnings.push('address low without high'); break;
      case 0xd: if (cur) cur.data.push(t.value); else warnings.push('data outside a record'); break;
      case 0xb: if (cur) cur.sumHi = t.value; else warnings.push('sum outside a record'); break;
      case 0xc: if (cur) cur.sumLo = t.value; else warnings.push('sum outside a record'); break;
      case 0xf: closeRecord(); trailer = t.value; break;
      default: warnings.push(`unknown command ${t.cmd.toString(16)} at offset ${at}`);
    }
  }
  closeRecord();
  for (let k = 0; k < 4; k++)
    if (header[k] === undefined) return { ok: false, code: 'incomplete-message', reason: `header command ${k + 1} missing`, warnings };
  for (const r of records) {
    if (!r.sumOk) warnings.push(`bad sum in record at 0x${r.address.toString(16)}`);
    if (r.data.length === 0 || r.data.length > rules.recordDataLength) warnings.push(`record at 0x${r.address.toString(16)} has ${r.data.length} data bytes`);
  }
  const frame: ParsedFrame = { header: header.slice(0, 4), records, trailer, strayPadding: padding, lossless: false };
  const back = writeFrame(frame, rules);
  frame.lossless = back.length === bytes.length && back.every((v, k) => v === bytes[k]);
  if (!frame.lossless) warnings.push('frame cannot be written back unchanged (unknown commands, wrong padding or order); do not re-encode it');
  return { ok: true, frame, warnings };
}

/** Zero bytes after each record's sum (`confirmed`: 30 in every record of every fixture). */
export const RECORD_PADDING = 30;

function pushToken(out: number[], cmd: number, value: number): void {
  out.push(0x40 | cmd, 0x20 | (value >> 4), 0x10 | (value & 0x0f));
}

/** Writes a frame back to bytes. For a frame from `parseFrame` of a real dump the result is byte-identical (checked in tests). */
export function writeFrame(frame: ParsedFrame, rules: FrameRules = UC4_FRAME_RULES): Uint8Array {
  const out: number[] = [SYSEX_START, ...rules.manufacturerId];
  frame.header.forEach((v, k) => pushToken(out, k + 1, v));
  for (const r of frame.records) {
    pushToken(out, 0x9, r.address >> 8);
    pushToken(out, 0xa, r.address & 0xff);
    for (const v of r.data) pushToken(out, 0xd, v);
    // The sum as received; an encoder that changes data recomputes it (`sumComputed`) on purpose.
    pushToken(out, 0xb, r.sumInDump >> 8);
    pushToken(out, 0xc, r.sumInDump & 0xff);
    for (let k = 0; k < r.paddingAfter; k++) out.push(0);
  }
  if (frame.trailer !== null) pushToken(out, 0xf, frame.trailer);
  for (let k = 0; k < frame.strayPadding; k++) out.push(0);
  out.push(SYSEX_END);
  return Uint8Array.from(out);
}
