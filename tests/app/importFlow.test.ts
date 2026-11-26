import { describe, expect, it } from 'vitest';
import { memoryStorage, openLibrary } from '../../src/storage/index.ts';
import type { ExportFile } from '../../src/storage/index.ts';
import type { ConfirmSpec } from '../../src/app/confirmSpec.ts';
import { readFileSync } from 'node:fs';
import { exportAll, exportOne, startImport, type FlowLibrary } from '../../src/app/importFlow.ts';
import { formatExported } from '../../src/app/format.ts';

async function setup() {
  const { library } = await openLibrary(memoryStorage());
  const asked: ConfirmSpec[] = [];
  const downloads: ExportFile[] = [];
  const said: string[] = [];
  const warnFor: (string | undefined)[] = [];
  const ui = { ask: (s: ConfirmSpec) => { asked.push(s); }, download: (f: ExportFile) => { downloads.push(f); }, say: (t: string, w?: string) => { said.push(t); warnFor.push(w); } };
  return { library: library as FlowLibrary, lib: library, asked, downloads, said, warnFor, ui };
}
const edit = (lib: Awaited<ReturnType<typeof setup>>['lib']) => {
  const id = lib.getState().selection.setupId;
  lib.setProperty({ setupId: id, area: 'encoders', group: 0, index: 0 }, 'number', 99);
};

describe('export', () => {
  it('downloads the whole file and says its name', async () => {
    const t = await setup();
    exportAll(t.library, t.ui);
    expect(t.downloads[0]!.name).toMatch(/^uc4-config-\d{4}-\d{2}-\d{2}\.json$/);
    expect(t.said[0]).toContain(t.downloads[0]!.name);
  });
  it('asks the line to offer the warnings of what was exported', async () => {
    const t = await setup();
    exportAll(t.library, t.ui);
    expect(t.warnFor[0]).toBe('all');
    exportOne(t.library, t.ui);
    expect(t.warnFor[1]).toBe(t.lib.getState().selection.setupId);
  });
  it('downloads one setup with its slot in the name', async () => {
    const t = await setup();
    t.lib.select({ setupId: t.lib.getState().configuration.setups[4]!.id });
    exportOne(t.library, t.ui);
    expect(t.downloads[0]!.name).toMatch(/^uc4-setup-05-/);
  });
});

describe('import', () => {
  it('explains a refused file and changes nothing', async () => {
    const t = await setup();
    startImport(t.library, t.ui, 'notes.json', 'not json at all');
    expect(t.asked[0]!.confirmLabel).toBeNull();
    expect(t.asked[0]!.body.join(' ')).toContain('Nothing was changed');
    expect(t.lib.getState().canUndo).toBe(false);
  });

  it('asks before replacing the library, and skips "export first" when nothing changed', async () => {
    const t = await setup();
    const file = t.lib.exportWhole().file!.text;
    startImport(t.library, t.ui, 'all.json', file);
    expect(t.asked[0]!.secondary).toBeUndefined();
    expect(t.asked[0]!.title).toContain('all.json');
    t.asked[0]!.run();
    expect(t.lib.getState().canUndo).toBe(true);
  });

  it('offers "export first" only with unexported changes, and exports before asking again', async () => {
    const t = await setup();
    const file = t.lib.exportWhole().file!.text;
    edit(t.lib);
    startImport(t.library, t.ui, 'all.json', file);
    expect(t.asked[0]!.secondary?.label).toBe('Export first');
    t.asked[0]!.secondary!.run();
    expect(t.downloads).toHaveLength(1); // the flow's own export
    expect(t.asked[1]!.secondary).toBeUndefined();
  });

  it('asks which slot when the file\'s slot is used, naming what is replaced, and undo restores it', async () => {
    const t = await setup();
    t.lib.select({ setupId: t.lib.getState().configuration.setups[4]!.id });
    const one = t.lib.exportSetup(t.lib.getState().selection.setupId).file!.text;
    edit(t.lib);
    const before = JSON.stringify(t.lib.getState().configuration.setups[4]);
    startImport(t.library, t.ui, 'one.json', one);
    const spec = t.asked[0]!;
    expect(spec.slots!.initial).toBe(5);
    expect(spec.slots!.options[4]!.replaces).toBe('SE05');
    spec.run(5);
    expect(JSON.stringify(t.lib.getState().configuration.setups[4])).not.toBe(before);
    t.lib.undo();
    expect(JSON.stringify(t.lib.getState().configuration.setups[4])).toBe(before);
  });
});

describe('formatExported', () => {
  it('says never without a date', () => {
    expect(formatExported(null)).toBe('never');
    expect(formatExported('garbage')).toBe('never');
    expect(formatExported('2026-11-14T15:30:00')).toBe('2026-11-14 15:30');
  });
});

describe('.syx import', () => {
  const dump = (name: string) => new Uint8Array(readFileSync(`tests/fixtures/sysex/${name}.syx`));
  it('asks "replace the whole library?" for an SndA dump', async () => {
    const t = await setup();
    startImport(t.library, t.ui, 'factory-SndA.syx', dump('factory-SndA'));
    expect(t.asked[0]!.title).toContain('Replace the whole library');
  });
  it('asks replace-or-another-slot for a one-setup dump into a used slot', async () => {
    const t = await setup();
    startImport(t.library, t.ui, 'base.syx', dump('base'));
    expect(t.asked[0]!.slots).toBeDefined();
    expect(t.asked[0]!.title).toMatch(/Slot \d+ holds/);
  });
  it('refuses a damaged dump with the reason and what to do', async () => {
    const t = await setup();
    const bad = dump('base').slice(0, 40);
    startImport(t.library, t.ui, 'bad.syx', bad);
    expect(t.asked[0]!.confirmLabel).toBeNull();
    expect(t.asked[0]!.body.length).toBeGreaterThanOrEqual(3);
  });
  it('imports a one-setup dump into a free slot without a dialog, and the library says which slot', async () => {
    const t = await setup();
    const whole = JSON.parse(t.lib.exportWhole().file!.text);
    whole.setups = whole.setups.filter((s: { slot?: number }) => s.slot !== 16);
    t.lib.importFile(JSON.stringify(whole));
    const result = t.lib.inspectImport(dump('base'));
    expect(result.status).toBe('setup');
    startImport(t.library, t.ui, 'base.syx', dump('base'));
    expect(t.asked).toHaveLength(0);
    expect(t.lib.getState().message).toMatch(/SE16|slot 16/);
    expect(t.lib.getState().dumps[0]!.fileName).toBe('base.syx');
  });
});
