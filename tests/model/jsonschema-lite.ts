// A small JSON Schema (draft-07) checker for the keywords schema/uc4-config.schema.json uses, so
// the tests need no validator dependency. Returns the paths that fail.
type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

export function check(schema: Json, value: unknown): string[] {
  const errors: string[] = [];
  const resolve = (s: Json): Json => {
    if (typeof s.$ref !== 'string') return s;
    const name = s.$ref.replace('#/definitions/', '');
    return (schema.definitions as Record<string, Json>)[name]!;
  };
  const go = (raw: Json, v: unknown, path: string): boolean => {
    const s = resolve(raw);
    const before = errors.length;
    const fail = (why: string): void => { errors.push(`${path || '(file)'}: ${why}`); };
    if ('const' in s && v !== s.const) fail(`must be ${JSON.stringify(s.const)}`);
    if (Array.isArray(s.enum) && !s.enum.includes(v)) fail('not one of the allowed values');
    if (s.type === 'integer' && !(typeof v === 'number' && Number.isInteger(v))) fail('must be a whole number');
    if (s.type === 'string' && typeof v !== 'string') fail('must be text');
    if (s.type === 'object' && !isObj(v)) fail('must be an object');
    if (s.type === 'array' && !Array.isArray(v)) fail('must be a list');
    if (typeof v === 'number') {
      if (typeof s.minimum === 'number' && v < s.minimum) fail(`below ${s.minimum}`);
      if (typeof s.maximum === 'number' && v > s.maximum) fail(`above ${s.maximum}`);
    }
    if (typeof v === 'string' && typeof s.pattern === 'string' && !new RegExp(s.pattern).test(v)) fail('does not match the pattern');
    if (Array.isArray(v)) {
      if (typeof s.minItems === 'number' && v.length < s.minItems) fail(`fewer than ${s.minItems} entries`);
      if (typeof s.maxItems === 'number' && v.length > s.maxItems) fail(`more than ${s.maxItems} entries`);
      if (isObj(s.items)) v.forEach((x, i) => go(s.items as Json, x, `${path}[${i}]`));
    }
    if (isObj(v) && (s.type === 'object' || s.properties)) {
      const props = (s.properties ?? {}) as Record<string, Json>;
      for (const r of (s.required ?? []) as string[]) if (!(r in v)) fail(`missing "${r}"`);
      for (const [k, x] of Object.entries(v)) {
        if (props[k]) go(props[k], x, path ? `${path}.${k}` : k);
        else if (s.additionalProperties === false) fail(`unknown field "${k}"`);
      }
    }
    if (isObj(s.if) && errors.length === before) {
      const saved = errors.length;
      go(s.if, v, path);
      const matched = errors.length === saved;
      errors.length = saved;
      if (matched && isObj(s.then)) go(s.then, v, path);
    }
    return errors.length === before;
  };
  go(schema, value, '');
  return errors;
}
