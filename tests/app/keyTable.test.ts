import { describe, expect, it } from 'vitest';
import { KEY_ROWS, helpSections, matchKey } from '../../src/app/keyTable.ts';

const press = (key: string, o: Partial<{ altKey: boolean; shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }> = {}) =>
  ({ key, altKey: false, shiftKey: false, metaKey: false, ctrlKey: false, ...o });

describe('key table', () => {
  it('has unique ids', () => {
    const ids = KEY_ROWS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('matches undo, redo, settings and the key help', () => {
    const ids = ['undo', 'redo', 'settings', 'keys'] as const;
    expect(matchKey(press('z', { metaKey: true }), ids)?.id).toBe('undo');
    expect(matchKey(press('Z', { ctrlKey: true, shiftKey: true }), ids)?.id).toBe('redo');
    expect(matchKey(press(',', { metaKey: true }), ids)?.id).toBe('settings');
    expect(matchKey(press('?', { shiftKey: true }), ids)?.id).toBe('keys');
    expect(matchKey(press('z', { metaKey: true, altKey: true }), ids)).toBeNull();
  });
  it('matches the control arrows only plain', () => {
    expect(matchKey(press('ArrowUp'), ['controlMove'])).toMatchObject({ id: 'controlMove', press: { dirName: 'up', dir: -1 } });
    expect(matchKey(press('ArrowUp', { shiftKey: true }), ['controlMove'])).toBeNull();
    expect(matchKey(press('ArrowUp', { altKey: true }), ['controlMove'])).toBeNull();
  });
  it('shows Vim rows in the help only with Vim keys on', () => {
    const rows = (vim: boolean) => helpSections(vim).flatMap((s) => s.rows.map((r) => r.id));
    expect(rows(false)).not.toContain('vimCopy');
    expect(rows(true)).toContain('vimCopy');
    expect(matchKey(press('y'), ['vimCopy'], false)).toBeNull();
  });
  it('lists the sections the plan names, in order', () => {
    expect(helpSections(false).map((s) => s.title)).toEqual(['Setups', 'Groups', 'Controls', 'Copy and paste', 'Dialogs', 'Send', 'Tour', 'Anywhere']);
  });
  it('matches the tour keys: plain arrows page, Esc ends', () => {
    expect(matchKey(press('ArrowRight'), ['tourPage'])).toMatchObject({ id: 'tourPage', press: { dir: 1 } });
    expect(matchKey(press('ArrowLeft'), ['tourPage'])).toMatchObject({ press: { dir: -1 } });
    expect(matchKey(press('ArrowRight', { altKey: true }), ['tourPage'])).toBeNull();
    expect(matchKey(press('Escape'), ['tourEnd', 'tourPage'])?.id).toBe('tourEnd');
  });
  it('Esc closes the welcome card and the dump guide through the table', () => {
    expect(matchKey(press('Escape'), ['welcomeEnd'])?.id).toBe('welcomeEnd');
    expect(matchKey(press('Escape'), ['dumpGuideEnd'])?.id).toBe('dumpGuideEnd');
  });
});
