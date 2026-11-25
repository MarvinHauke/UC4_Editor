// Configuration helper. Run with Node >= 22.18 (runs .ts directly):
//   node tools/uc4-config.ts factory <slot 1-18> > se03.json    a factory setup as a uc4-config file
//   node tools/uc4-config.ts factory <slot> --schema <path>    the same, with a "$schema" line so an editor checks it
//   node tools/uc4-config.ts schema > schema/uc4-config.schema.json   (re)write the JSON Schema
//   node tools/uc4-config.ts check <file.json>                  load a file and list its problems
// Reads and writes text only; never touches MIDI.
import { readFileSync } from 'node:fs';
import { FORMAT, SCHEMA_VERSION, buildSchema, factorySetup, load, save } from '../src/model/index.ts';

const [cmd, arg, ...rest] = process.argv.slice(2);
const schemaPath = rest[0] === '--schema' ? rest[1] : undefined;
const badArgs = rest.length > 0 && !(rest.length === 2 && rest[0] === '--schema' && rest[1]);

if (badArgs) {
  console.error('usage: node tools/uc4-config.ts factory <slot 1-18> [--schema <path>] | schema | check <file.json>');
  process.exit(1);
} else if (cmd === 'factory') {
  const slot = Number(arg);
  if (!Number.isInteger(slot) || slot < 1 || slot > 18) {
    console.error('usage: node tools/uc4-config.ts factory <slot 1-18>');
    process.exit(1);
  }
  const now = new Date().toISOString();
  process.stdout.write(save({
    ...(schemaPath ? { $schema: schemaPath } : {}),
    format: FORMAT, schemaVersion: SCHEMA_VERSION, device: { profile: 'faderfox-uc4' },
    createdAt: now, updatedAt: now, setups: [factorySetup(slot)],
  }));
} else if (cmd === 'schema') {
  process.stdout.write(JSON.stringify(buildSchema(), null, 2) + '\n');
} else if (cmd === 'check' && arg) {
  let text: string;
  try { text = readFileSync(arg, 'utf8'); } catch {
    console.error(`cannot read ${arg}`);
    process.exit(1);
  }
  const r = load(text);
  if (r.status === 'refused') {
    console.error(`refused: ${r.reason}\n  ${r.whatToDo}`);
    process.exit(1);
  }
  console.log(`${arg}: ${r.configuration.setups.length} setup(s), ${r.problems.length} problem(s)`);
  for (const p of r.problems) console.log(`  ${p.path || '(file)'}: ${p.message}`);
  process.exit(r.problems.length ? 2 : 0);
} else {
  console.error('usage: node tools/uc4-config.ts factory <slot 1-18> [--schema <path>] | schema | check <file.json>');
  process.exit(1);
}
