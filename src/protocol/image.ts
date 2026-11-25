// Memory image of a dump: records laid out by address; plus a diff between two images.
import type { ParsedFrame } from './frame.ts';

export const IMAGE_SIZE = 0x8000;

export interface MemoryImage {
  bytes: Uint8Array;
  /** 1 where a record wrote the byte. */
  covered: Uint8Array;
  /** Addresses written by more than one record with different values. */
  conflicts: number[];
}

export function buildImage(frames: ParsedFrame[]): MemoryImage {
  const bytes = new Uint8Array(IMAGE_SIZE);
  const covered = new Uint8Array(IMAGE_SIZE);
  const conflicts: number[] = [];
  for (const f of frames)
    for (const r of f.records)
      r.data.forEach((v, k) => {
        const a = r.address + k;
        if (a >= IMAGE_SIZE) return;
        if (covered[a] && bytes[a] !== v) conflicts.push(a);
        bytes[a] = v;
        covered[a] = 1;
      });
  return { bytes, covered, conflicts };
}

export interface ByteChange { address: number; before: number | null; after: number | null }

/** Byte-wise difference; `null` = the image does not cover that address. */
export function diffImages(a: MemoryImage, b: MemoryImage): ByteChange[] {
  const out: ByteChange[] = [];
  for (let k = 0; k < IMAGE_SIZE; k++) {
    const x = a.covered[k] ? a.bytes[k]! : null;
    const y = b.covered[k] ? b.bytes[k]! : null;
    if (x !== y) out.push({ address: k, before: x, after: y });
  }
  return out;
}

const KINDS = ['enc', 'push', 'btn', 'fader'] as const;
const FIELDS = ['chan/type', 'number', 'lower', 'upper', 'mode/scale'] as const;

/** Layout names for an address — everything here is `likely` (docs/protocol/uc4-sysex.md). */
export function describeAddress(address: number): string {
  const hex = (n: number): string => '0x' + n.toString(16);
  const se = (i: number): string => 'SE' + String(i + 1).padStart(2, '0');
  if (address >= 0x1480 && address < 0x16c0) {
    const o = address - 0x1480;
    return `${se(o >> 5)} group name G${((o & 31) >> 2) + 1} char ${(o & 3) + 1}`;
  }
  if (address >= 0x1700 && address < 0x1b80) {
    const o = address - 0x1700, r = o & 63;
    return r >= 40 ? `${se(o >> 6)} table padding` : `${se(o >> 6)} fader9 G${Math.floor(r / 5) + 1} ${FIELDS[r % 5]}`;
  }
  if (address >= 0x1c00 && address < 0x7600) {
    const o = address - 0x1c00, r = o % 0x500, f = Math.floor(r / 64), k = r % 64;
    return `${se(Math.floor(o / 0x500))} ${KINDS[Math.floor(f / 5)]} ${FIELDS[f % 5]} G${(k >> 3) + 1}.${(k & 7) + 1}`;
  }
  return hex(address);
}
