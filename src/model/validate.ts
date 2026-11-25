// Validation reports, never repairs. Takes any parsed JSON; never throws.
// Reports lengths, types, ranges, enum values per kind, group-name characters, the CCAh number
// rule, setup ids, slots, dates and unknown fields, each with the path where it is.
import {
  BUTTON_MODES, ENCODER_DISPLAYS, ENCODER_MODES, ENCODER_TYPES, FADER_DISPLAYS, FADER_MODES, FADER_TYPES,
  GREEN_DISPLAYS, GREEN_TYPES, PUSH_TYPES, FORMAT, SCHEMA_VERSION,
} from './types.ts';
import { nameProblems } from './names.ts';
import type { Problem } from './types.ts';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;


type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);

type Spec = Record<string, readonly string[] | 'ch' | 'v'>;
const spec = (display: readonly string[] | null, type: readonly string[], mode: readonly string[]): Spec => ({
  ...(display ? { display } : {}), type, mode, channel: 'ch', number: 'v', lower: 'v', upper: 'v',
});
const ENCODER = spec(ENCODER_DISPLAYS, ENCODER_TYPES, ENCODER_MODES);
const PUSH = spec(null, PUSH_TYPES, BUTTON_MODES);
const GREEN = spec(GREEN_DISPLAYS, GREEN_TYPES, BUTTON_MODES);
const FADER = spec(FADER_DISPLAYS, FADER_TYPES, FADER_MODES);

// Takes a configuration as load returns it (already migrated): an older schemaVersion is a problem here.
export function validate(config: unknown): Problem[] {
  const problems: Problem[] = [];
  const add = (path: string, message: string): void => { problems.push({ path, message }); };

  const at = (path: string, key: string): string => (path ? `${path}.${key}` : key);
  const unknownFields = (o: Rec, known: string[], path: string): void => {
    for (const k of Object.keys(o)) if (!known.includes(k)) add(at(path, k), `unknown field "${k}"`);
  };
  const optString = (o: Rec, key: string, path: string): void => {
    if (o[key] !== undefined && typeof o[key] !== 'string') add(at(path, key), `${key} must be text`);
  };
  const requiredString = (o: Rec, key: string, path: string): void => {
    if (typeof o[key] !== 'string') add(at(path, key), `${key} must be text`);
  };
  const array = (v: unknown, length: number, path: string): unknown[] | null => {
    if (!Array.isArray(v)) { add(path, `must be a list of ${length}`); return null; }
    if (v.length !== length) add(path, `must have exactly ${length} entries, has ${v.length}`);
    return v;
  };

  const control = (c: unknown, s: Spec, path: string): void => {
    if (!isRec(c)) { add(path, 'must be an object'); return; }
    unknownFields(c, ['label', ...Object.keys(s)], path);
    optString(c, 'label', path);
    for (const [key, rule] of Object.entries(s)) {
      const v = c[key];
      if (rule === 'ch' || rule === 'v') {
        const [lo, hi] = rule === 'ch' ? [1, 16] : [0, 127];
        if (typeof v !== 'number' || !Number.isInteger(v) || v < lo || v > hi) add(`${path}.${key}`, `${key} must be a whole number ${lo}–${hi}`);
      } else if (typeof v !== 'string' || !rule.includes(v)) {
        add(at(path, key), `${key} must be one of ${rule.join(' ')}, found ${JSON.stringify(v)}`);
      }
    }
    // CCAh is two CCs (MSB 0–31, LSB number + 32): the number is 0–31.
    if (s === ENCODER && c.type === 'CCAh' && typeof c.number === 'number' && c.number > 31 && c.number <= 127) {
      add(at(path, 'number'), `CCAh numbers are 0–31 (the LSB is number + 32), found ${c.number}`);
    }
  };
  const controls = (v: unknown, length: number, s: Spec, path: string): void => {
    array(v, length, path)?.forEach((c, i) => { control(c, s, `${path}[${i}]`); });
  };

  const encoderGroup = (g: unknown, path: string): void => {
    if (!isRec(g)) { add(path, 'must be an object'); return; }
    unknownFields(g, ['name', 'label', 'encoders', 'pushButtons'], path);
    optString(g, 'label', path);
    if (typeof g.name !== 'string') add(`${path}.name`, 'name must be text');
    else for (const m of nameProblems(g.name)) add(`${path}.name`, m);
    controls(g.encoders, 8, ENCODER, `${path}.encoders`);
    controls(g.pushButtons, 8, PUSH, `${path}.pushButtons`);
  };
  const faderButtonGroup = (g: unknown, path: string): void => {
    if (!isRec(g)) { add(path, 'must be an object'); return; }
    unknownFields(g, ['label', 'faders', 'buttons'], path);
    optString(g, 'label', path);
    controls(g.faders, 9, FADER, `${path}.faders`);
    controls(g.buttons, 8, GREEN, `${path}.buttons`);
  };
  const setup = (s: unknown, path: string): void => {
    if (!isRec(s)) { add(path, 'must be an object'); return; }
    unknownFields(s, ['id', 'name', 'notes', 'slot', 'encoderGroups', 'faderButtonGroups'], path);
    requiredString(s, 'id', path);
    requiredString(s, 'name', path);
    optString(s, 'notes', path);
    if (s.slot !== undefined && (typeof s.slot !== 'number' || !Number.isInteger(s.slot) || s.slot < 1 || s.slot > 18)) {
      add(`${path}.slot`, 'slot must be a whole number 1–18');
    }
    array(s.encoderGroups, 8, `${path}.encoderGroups`)?.forEach((g, i) => { encoderGroup(g, `${path}.encoderGroups[${i}]`); });
    array(s.faderButtonGroups, 8, `${path}.faderButtonGroups`)?.forEach((g, i) => { faderButtonGroup(g, `${path}.faderButtonGroups[${i}]`); });
  };

  if (!isRec(config)) return [{ path: '', message: 'a configuration must be an object' }];
  unknownFields(config, ['$schema', 'format', 'schemaVersion', 'device', 'createdAt', 'updatedAt', 'setups'], '');
  optString(config, '$schema', '');
  if (config.format !== FORMAT) add('format', `format must be "${FORMAT}", found ${JSON.stringify(config.format)}`);
  if (config.schemaVersion !== SCHEMA_VERSION) add('schemaVersion', `schemaVersion must be ${SCHEMA_VERSION}, found ${JSON.stringify(config.schemaVersion)}`);
  for (const key of ['createdAt', 'updatedAt']) {
    const v = config[key];
    if (typeof v !== 'string') add(key, `${key} must be text`);
    else if (!ISO_DATE.test(v) || Number.isNaN(Date.parse(v))) add(key, `${key} must be an ISO 8601 date and time, found "${v}"`);
  }
  if (!isRec(config.device) || config.device.profile !== 'faderfox-uc4') add('device.profile', 'profile must be "faderfox-uc4"');
  else {
    unknownFields(config.device, ['profile', 'firmware'], 'device');
    optString(config.device, 'firmware', 'device');
  }
  if (!Array.isArray(config.setups) || config.setups.length < 1) add('setups', 'must hold at least one setup');
  else {
    config.setups.forEach((s, i) => { setup(s, `setups[${i}]`); });
    const ids = new Map<string, number>();
    config.setups.forEach((s, i) => {
      const id = isRec(s) ? s.id : undefined;
      if (typeof id !== 'string') return;
      const first = ids.get(id);
      if (first === undefined) ids.set(id, i);
      else add(`setups[${i}].id`, `id "${id}" is already used by setups[${first}]`);
    });
    const seen = new Map<number, number>();
    config.setups.forEach((s, i) => {
      const slot = isRec(s) ? s.slot : undefined;
      if (typeof slot !== 'number') return;
      const first = seen.get(slot);
      if (first === undefined) seen.set(slot, i);
      else add(`setups[${i}].slot`, `slot ${slot} is already used by setups[${first}]`);
    });
  }
  return problems;
}
