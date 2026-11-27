// Control areas and the paths validation and warnings use to point at a control (plan 0008 step 21).
// One helper for "which side is this area on" and one parse/format pair for the paths.

export type ControlArea = 'encoders' | 'pushButtons' | 'faders' | 'buttons';
export type GroupKey = 'encoderGroups' | 'faderButtonGroups';

/** Encoders and push buttons live in the encoder groups; faders and green buttons in the fader/button groups. */
export const isEncoderArea = (area: ControlArea): area is 'encoders' | 'pushButtons' => area === 'encoders' || area === 'pushButtons';
export const groupKeyOf = (area: ControlArea): GroupKey => (isEncoderArea(area) ? 'encoderGroups' : 'faderButtonGroups');

/** `setups[2].encoderGroups[0].encoders[3]`, with `.number` etc. when a property is given. */
export function controlPathOf(setupIndex: number, area: ControlArea, group: number, index: number, property?: string): string {
  return `setups[${setupIndex}].${groupKeyOf(area)}[${group}].${area}[${index}]${property ? `.${property}` : ''}`;
}

export interface ParsedPath {
  setupIndex: number;
  groupKey?: GroupKey;
  group?: number;
  area?: ControlArea;
  index?: number;
  property?: string;
}

const PATH = /^setups\[(\d+)\](?:\.(encoderGroups|faderButtonGroups)\[(\d+)\](?:\.(encoders|pushButtons|faders|buttons)\[(\d+)\](?:\.(\w+))?)?)?/;

/** Parses as far as it goes and does not check the end: a caller that wants an exact control path round-trips it through `controlPathOf`.
 * Where a path points, as far as it goes (setup, group, control, property); null when it does not start with a setup. */
export function parseControlPath(path: string): ParsedPath | null {
  const m = PATH.exec(path);
  if (!m) return null;
  return {
    setupIndex: Number(m[1]),
    ...(m[2] ? { groupKey: m[2] as GroupKey, group: Number(m[3]) } : {}),
    ...(m[4] ? { area: m[4] as ControlArea, index: Number(m[5]) } : {}),
    ...(m[6] ? { property: m[6] } : {}),
  };
}
