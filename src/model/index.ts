// The schema module's public interface (plan 0002).
export { factorySetup } from './factory.ts';
export { load, save } from './document.ts';
export { validate } from './validate.ts';
export { warnings, describeKey } from './warnings.ts';
export { NAME_CHARS, nameProblems, normalizeGroupName, suggestGroupName } from './names.ts';
export { changeType } from './edit.ts';
export * from './types.ts';
export { buildSchema } from './jsonSchema.ts';
