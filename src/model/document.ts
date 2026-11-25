// load and save: JSON text <-> configuration.
import { migrate } from './migrate.ts';
import { validate } from './validate.ts';
import { FORMAT, SCHEMA_VERSION } from './types.ts';
import type { LoadResult, Uc4Config } from './types.ts';

const refuse = (reason: string, whatToDo: string): LoadResult => ({ status: 'refused', reason, whatToDo });

export function load(text: string): LoadResult {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch {
    return refuse('The file is not valid JSON.', 'Open it in a text editor and fix the syntax, or pick another file.');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed) || (parsed as Record<string, unknown>).format !== FORMAT) {
    return refuse(`The file is not a ${FORMAT} file.`, 'Pick a configuration saved by this editor.');
  }
  const doc = parsed as Record<string, unknown>;
  const version = doc.schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return refuse('The file has no valid schemaVersion.', 'Set "schemaVersion" to a whole number, or pick another file.');
  }
  if (version > SCHEMA_VERSION) {
    return refuse(
      `The file is schema version ${version}; this editor reads up to ${SCHEMA_VERSION}.`,
      'Update the editor, or export the configuration again from the editor that made it.',
    );
  }
  const migrated = migrate(doc, version);
  if (!migrated) return refuse(`No way to read schema version ${version}.`, 'Pick a newer file or an older backup.');
  if (!Array.isArray(migrated.setups)) {
    return refuse('The file has no list of setups.', 'Check that "setups" is a list, or pick another file.');
  }
  const broken = unreadable(migrated);
  if (broken) {
    return refuse(`The file's structure cannot be read: ${broken}.`, 'Fix that part in a text editor (run tools/uc4-config.ts check on it), or pick another file.');
  }
  return { status: 'loaded', configuration: migrated as unknown as Uc4Config, problems: validate(migrated) };
}

// A loaded configuration may have wrong values, but every setup, group and control must be an
// object and every list a list of its fixed length (8 groups; 8/8/9/8 controls), so callers never
// meet null or a missing or short list. Returns where not.
function unreadable(doc: Record<string, unknown>): string | null {
  const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
  const lists: [string, string, number][] = [['encoderGroups', 'encoders', 8], ['encoderGroups', 'pushButtons', 8], ['faderButtonGroups', 'faders', 9], ['faderButtonGroups', 'buttons', 8]];
  const sized = (v: unknown, n: number, path: string): string | null => (!Array.isArray(v) ? `${path} is not a list` : v.length !== n ? `${path} must have exactly ${n} entries, has ${v.length}` : null);
  const setups = doc.setups as unknown[];
  if (setups.length < 1 || setups.length > 18) return `setups must hold 1 to 18 setups, has ${setups.length}`;
  for (const [i, s] of setups.entries()) {
    if (!isObj(s)) return `setups[${i}] is not an object`;
    for (const gk of ['encoderGroups', 'faderButtonGroups']) {
      const groups = s[gk];
      const gp = `setups[${i}].${gk}`;
      const gerr = sized(groups, 8, gp);
      if (gerr) return gerr;
      for (const [j, g] of (groups as unknown[]).entries()) {
        if (!isObj(g)) return `setups[${i}].${gk}[${j}] is not an object`;
        for (const [pg, ck, len] of lists) {
          if (pg !== gk) continue;
          const cs = g[ck];
          const cerr = sized(cs, len, `setups[${i}].${gk}[${j}].${ck}`);
          if (cerr) return cerr;
          const k = (cs as unknown[]).findIndex((c) => !isObj(c));
          if (k >= 0) return `setups[${i}].${gk}[${j}].${ck}[${k}] is not an object`;
        }
      }
    }
  }
  return null;
}

// Stable key order so a reload and resave is identical; unknown fields follow, in file order.
const ORDER: Record<string, string[]> = {
  config: ['$schema', 'format', 'schemaVersion', 'device', 'createdAt', 'updatedAt', 'setups'],
  device: ['profile', 'firmware'],
  setup: ['id', 'name', 'notes', 'slot', 'encoderGroups', 'faderButtonGroups'],
  encoderGroup: ['name', 'label', 'encoders', 'pushButtons'],
  faderButtonGroup: ['label', 'faders', 'buttons'],
  control: ['label', 'display', 'type', 'mode', 'channel', 'number', 'lower', 'upper'],
};
const KIND_OF_KEY: Record<string, string> = {
  device: 'device', setups: 'setup', encoderGroups: 'encoderGroup', faderButtonGroups: 'faderButtonGroup',
  encoders: 'control', pushButtons: 'control', faders: 'control', buttons: 'control',
};

function ordered(value: unknown, kind: string): unknown {
  if (Array.isArray(value)) return value.map((v) => ordered(v, kind));
  if (typeof value !== 'object' || value === null) return value;
  const o = value as Record<string, unknown>;
  const order = ORDER[kind] ?? [];
  const keys = [...order.filter((k) => k in o), ...Object.keys(o).filter((k) => !order.includes(k))];
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = ordered(o[k], KIND_OF_KEY[k] ?? '');
  return out;
}

const isPrimitive = (v: unknown): boolean => typeof v !== 'object' || v === null;

// Two-space JSON, but an object that holds only plain values (a control) is one line, so 264
// controls stay readable and editable in a text editor.
function write(v: unknown, indent: string): string {
  if (Array.isArray(v)) {
    if (v.length === 0) return '[]';
    const inner = indent + '  ';
    return `[\n${v.map((x) => inner + write(x, inner)).join(',\n')}\n${indent}]`;
  }
  if (typeof v === 'object' && v !== null) {
    const entries = Object.entries(v).filter(([, x]) => x !== undefined);
    if (entries.length === 0) return '{}';
    if (entries.every(([, x]) => isPrimitive(x))) {
      return `{ ${entries.map(([k, x]) => `${JSON.stringify(k)}: ${JSON.stringify(x)}`).join(', ')} }`;
    }
    const inner = indent + '  ';
    return `{\n${entries.map(([k, x]) => `${inner}${JSON.stringify(k)}: ${write(x, inner)}`).join(',\n')}\n${indent}}`;
  }
  return JSON.stringify(v);
}

export function save(config: Uc4Config): string {
  return write(ordered(config, 'config'), '') + '\n';
}
