// The UC4's 4-digit 7-segment display as data (plan 0006 decision 15): one glyph per name character,
// as the segments it lights. Segments are named as on any 7-segment digit:
//    aaa
//   f   b
//    ggg
//   e   c
//    ddd
// Device profile data: another device with a different display adds its own table.
export type Segment = 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g';

const g = (segments: string): readonly Segment[] => [...segments] as Segment[];

/** Segments lit per group-name character (every character in `NAME_CHARS` has an entry). */
export const GLYPHS: Readonly<Record<string, readonly Segment[]>> = {
  '0': g('abcdef'), '1': g('bc'), '2': g('abdeg'), '3': g('abcdg'), '4': g('bcfg'),
  '5': g('acdfg'), '6': g('acdefg'), '7': g('abc'), '8': g('abcdefg'), '9': g('abcdfg'),
  a: g('abcefg'), b: g('cdefg'), c: g('adef'), d: g('bcdeg'), e: g('adefg'), f: g('aefg'),
  g: g('acdef'), h: g('cefg'), i: g('bc'), // `i` is drawn like `1`: the panel photo shows `Ed1t` for "Edit"
   j: g('bcde'), l: g('def'), m: g('abcef'),
  n: g('ceg'), o: g('abcdef'), p: g('abefg'), q: g('abcfg'), r: g('eg'), s: g('acdfg'),
  t: g('defg'), u: g('bcdef'), x: g('bcefg'), y: g('bcdfg'), z: g('abdeg'),
  // `z` looks like `2` and `x` like `H`, as on the device (docs/reference/uc4-device.md).
  '-': g('g'), '_': g('d'), "'": g('f'), '"': g('bf'), '=': g('dg'), ' ': g(''),
};

/**
 * Characters never seen on the UC4's display (their codes are `likely` in docs/protocol/uc4-sysex.md
 * §5): their glyphs are a guess until the user has looked once. Look only, nothing is sent.
 */
export const UNSEEN_GLYPHS = ['e', 'f', 'h', 'm', 'q'] as const;

/** One digit's drawing box and the segment shapes inside it (as SVG `points`). */
export const DIGIT = { width: 26, height: 38, pitch: 36 } as const;
const T = 4; // segment thickness
const H = DIGIT.width;
const V = DIGIT.height;
const horizontal = (y: number): string =>
  `${T},${y + T / 2} ${T + 2},${y} ${H - T - 2},${y} ${H - T},${y + T / 2} ${H - T - 2},${y + T} ${T + 2},${y + T}`;
const vertical = (x: number, y0: number, y1: number): string =>
  `${x + T / 2},${y0} ${x + T},${y0 + 2} ${x + T},${y1 - 2} ${x + T / 2},${y1} ${x},${y1 - 2} ${x},${y0 + 2}`;
const MID = (V - T) / 2;
export const SEGMENT_POINTS: Readonly<Record<Segment, string>> = {
  a: horizontal(0), g: horizontal(MID), d: horizontal(V - T),
  f: vertical(0, 2, MID + T / 2 - 1), b: vertical(H - T, 2, MID + T / 2 - 1),
  e: vertical(0, MID + T / 2 + 1, V - 2), c: vertical(H - T, MID + T / 2 + 1, V - 2),
};
export const SEGMENT_ORDER: readonly Segment[] = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
