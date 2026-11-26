import { describe, expect, it } from 'vitest';
import { checkPlan } from '../../tools/check-plans.ts';

const plan = (body: string) => `# Plan\n\n${body}\n`;

describe('check-plans', () => {
  it('accepts a well-formed plan', () => {
    expect(checkPlan(plan('## Decisions\n\n1. **A**\n   text\n2. **B**\n\n## Steps\n\n1. **One**\n2. **Two**\n\n## Out of scope'))).toEqual([]);
  });

  it('reports a repeated ## heading with its line', () => {
    const p = checkPlan(plan('## Decisions\n\n1. **A**\n\n## Steps\n\n## Decisions'));
    expect(p).toEqual([{ line: 9, message: 'heading "## Decisions" appears twice (first at line 3)' }]);
  });

  it('reports a duplicate and a decreasing decision number', () => {
    const p = checkPlan(plan('## Decisions\n\n1. **A**\n2. **B**\n2. **C**\n1. **D**'));
    expect(p.map((x) => [x.line, x.message])).toEqual([
      [7, 'Decisions: item 2 appears twice'],
      [8, 'Decisions: item 1 comes after 2 (numbers must increase)'],
    ]);
  });

  it('numbers Steps on their own, and ignores lists elsewhere, nested items, struck-out items and code fences', () => {
    const p = checkPlan(plan([
      '## Open questions', '', '1. **Q**', '1. **Q again**', '',
      '## Decisions', '', '1. **A**', '   1. **nested**', '2. ~~gone~~', '3. **C**', '```', '## Steps', '1. **x**', '1. **x**', '```', '',
      '## Steps', '', '1. **S**',
    ].join('\n')));
    expect(p).toEqual([]);
  });

  it('allows gaps (a removed number)', () => {
    expect(checkPlan(plan('## Steps\n\n1. **A**\n3. **B**'))).toEqual([]);
  });
});
