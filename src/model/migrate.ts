// One step per schemaVersion increment. Schema 1 is the first version: no step yet, but the
// machinery is here so version 2 only adds an entry. Old files never go through an old engine.
import { SCHEMA_VERSION } from './types.ts';

type Rec = Record<string, unknown>;
/** steps[n] turns a version-n document into version n+1. */
export const migrationSteps: Record<number, (doc: Rec) => Rec> = {};

/** Migrate a document of version `from` up to the current version. Returns null if a step is missing. */
export function migrate(doc: Rec, from: number): Rec | null {
  let current = doc;
  for (let v = from; v < SCHEMA_VERSION; v++) {
    const step = migrationSteps[v];
    if (!step) return null;
    current = { ...step(current), schemaVersion: v + 1 };
  }
  return current;
}
