import { describe, expect, it, vi } from 'vitest';
import { exportAllSyx, exportOneSyx, type SyxLibrary, type SyxUi } from '../../src/app/syxFlow.ts';
import type { ConfirmSpec } from '../../src/app/confirmSpec.ts';

function setup(syx: Partial<Pick<SyxLibrary, 'exportSetupSyx' | 'exportAllSyx'>>) {
  const asked: ConfirmSpec[] = [];
  const said: string[] = [];
  const bytes: Array<[string, Uint8Array]> = [];
  const json = vi.fn();
  const lib = {
    getState: () => ({ selection: { setupId: 'a' }, setups: [{ id: 'a', name: 'Bass' }] }),
    exportWhole: () => { json('all'); return { state: 'ok' }; },
    exportSetup: (id: string) => { json(id); return { state: 'ok' }; },
    exportSetupSyx: () => ({ state: 'ok' }),
    exportAllSyx: () => ({ state: 'ok' }),
    ...syx,
  } as unknown as SyxLibrary;
  const ui: SyxUi = { ask: (s) => asked.push(s), download: () => undefined, downloadBytes: (n, b) => bytes.push([n, b]), say: (t) => said.push(t) };
  return { lib, ui, asked, said, bytes, json };
}

describe('syx export flow', () => {
  it('downloads the bytes and says the file name', () => {
    const t = setup({ exportAllSyx: () => ({ state: 'ok', file: { name: 'uc4-all.syx', bytes: new Uint8Array([1]) } }) as never });
    exportAllSyx(t.lib, t.ui);
    expect(t.bytes).toEqual([['uc4-all.syx', new Uint8Array([1])]]);
    expect(t.said[0]).toContain('Exported all setups as uc4-all.syx');
    expect(t.asked).toHaveLength(0);
  });

  it('a refusal opens a dialog with the fields, and its secondary runs the JSON export', () => {
    const refusal = { reason: 'Why.', fields: ['Enc1 of encoder group 1: Command type'], whatToDo: 'Do this.' };
    const t = setup({ exportSetupSyx: () => ({ state: 'ok', message: 'm', refusal }) as never });
    exportOneSyx(t.lib, t.ui);
    expect(t.bytes).toHaveLength(0);
    const spec = t.asked[0]!;
    expect(spec.title).toBe('"Bass" cannot be exported as .syx');
    expect(spec.body).toContain('Why.');
    expect(spec.body).toContain('Do this.');
    expect(spec.list).toEqual(refusal.fields);
    expect(spec.confirmLabel).toBeNull();
    expect(spec.secondary?.label).toBe('Export as JSON instead');
    spec.secondary?.run();
    expect(t.json).toHaveBeenCalledWith('a');
  });

  it('a refusal for all setups exports the whole JSON instead', () => {
    const t = setup({ exportAllSyx: () => ({ state: 'ok', refusal: { reason: 'r', fields: [], whatToDo: 'w' } }) as never });
    exportAllSyx(t.lib, t.ui);
    expect(t.asked[0]!.list).toBeUndefined();
    t.asked[0]!.secondary?.run();
    expect(t.json).toHaveBeenCalledWith('all');
  });
});
