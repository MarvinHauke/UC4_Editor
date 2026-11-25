import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TOUR_AREAS, TOUR_LAST, TOUR_STEPS } from '../../src/app/profile/uc4Tour.ts';

describe('tour steps', () => {
  it('six areas in the plan\'s order, then the closing step', () => {
    expect(TOUR_AREAS.map((a) => a.title)).toEqual(['Toolbar', 'Connections', 'Property panel', 'Device view', 'Setup list', 'Help line']);
    expect(TOUR_STEPS.at(-1)).toBe(TOUR_LAST);
    expect(TOUR_STEPS).toHaveLength(7);
  });
  it('every step has a unique id and two or three sentences; only the closing step has no element', () => {
    expect(new Set(TOUR_STEPS.map((s) => s.id)).size).toBe(7);
    for (const s of TOUR_STEPS) {
      expect(s.sentences.length).toBeGreaterThanOrEqual(2);
      expect(s.sentences.length).toBeLessThanOrEqual(3);
    }
    expect(TOUR_AREAS.every((a) => a.selector !== null)).toBe(true);
    expect(TOUR_LAST.selector).toBeNull();
  });
});

// Drift test: the guide page "The editor" (plan 0012 step 2, uc4-docs) names every area by its title.
// Waits for uc4-docs: switch `describe.skip` to `describe` when the page is committed.
describe.skip('guide page drift (until uc4-docs commits step 2)', () => {
  const page = existsSync('docs/guides/editor.md') ? readFileSync('docs/guides/editor.md', 'utf8') : '';
  it.each(TOUR_AREAS.map((a) => a.title))('editor.md mentions "%s"', (title) => {
    expect(page).toContain(title);
  });
});
