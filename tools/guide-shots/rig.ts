// The shot rig (plan 0009 decision 6): a fresh Chrome context per shot, Web MIDI replaced by a stub,
// the demo library loaded through the app's own import. Nothing here touches the user's library or a real MIDI port.
import { chromium, type Browser, type Page } from 'playwright';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TOUR_SEEN_KEY } from '../../src/app/tour.ts';

// 5174 by default; GUIDE_SHOTS_PORT picks another when something else holds it. Never 5173 (the architect's dev server).
export const PORT = Number(process.env.GUIDE_SHOTS_PORT ?? 5174);
if (PORT === 5173) throw new Error('the shot rig never uses port 5173');
export const BASE = `http://localhost:${PORT}/`;
export const IMAGES = fileURLToPath(new URL('../../docs/guides/images/', import.meta.url));
const DEMO = fileURLToPath(new URL('./demo-library.json', import.meta.url));

/** Runs in the page before any page code. One input and one output named like the UC4; sends are only recorded. */
function installMidiStub(): void {
  const sent: number[][] = [];
  (window as unknown as { __sent: number[][] }).__sent = sent;
  const port = (id: string, type: 'input' | 'output') => ({
    id, name: 'Faderfox UC4', manufacturer: 'Faderfox', type, state: 'connected', connection: 'open', version: '1',
    onmidimessage: null, onstatechange: null,
    addEventListener() {}, removeEventListener() {},
    ...(type === 'output' ? { send(data: ArrayLike<number>) { sent.push(Array.from(data)); } } : {}),
  });
  const input = port('stub-in', 'input');
  const output = port('stub-out', 'output');
  (window as unknown as { __midiIn: unknown }).__midiIn = input;
  const access = {
    inputs: new Map([[input.id, input]]), outputs: new Map([[output.id, output]]),
    sysexEnabled: true, onstatechange: null, addEventListener() {}, removeEventListener() {},
  };
  // The app asks the permission first; the stub answers for 'midi' only (the browser's real permission stays off).
  const query = navigator.permissions.query.bind(navigator.permissions);
  navigator.permissions.query = (d) =>
    (d as { name?: string }).name === 'midi'
      ? Promise.resolve({ state: 'granted', onchange: null, addEventListener() {}, removeEventListener() {} } as unknown as PermissionStatus)
      : query(d);
  navigator.requestMIDIAccess = () => Promise.resolve(access as unknown as MIDIAccess);
}

export async function launch(): Promise<Browser> {
  // The installed Chrome; no browser download.
  return chromium.launch({ channel: 'chrome' });
}

/** A fresh, empty browser profile with the stub, the demo library imported and the editor ready. */
export async function newShotPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({
    viewport: { width: 1100, height: 700 }, deviceScaleFactor: 2,
    colorScheme: 'light', reducedMotion: 'reduce', locale: 'en-US', timezoneId: 'UTC',
    permissions: [], // never the real 'midi' permission
  });
  const page = await context.newPage();
  await page.addInitScript(installMidiStub);
  // The first-run tour (plan 0012) would dim every shot: the fresh profile counts as having seen it (key from src/app/tour.ts).
  await page.addInitScript((key) => { try { localStorage.setItem(key, '1'); } catch { /* shots do not need it */ } }, TOUR_SEEN_KEY);
  // The clock stands still, so times in the editor (a kept dump's time) are the same in every run.
  await page.clock.setFixedTime(new Date('2026-11-19T10:30:00Z'));
  await page.goto(BASE);
  await page.locator('input[type=file]').setInputFiles(DEMO);
  await page.getByRole('button', { name: 'Replace library' }).click();
  await page.getByRole('button', { name: 'Replace library' }).waitFor({ state: 'detached' });
  return page;
}

export interface SaveOptions {
  allowSends?: boolean;
  /** Crop to the marked outlines (and their numbers) plus this margin in CSS px; the whole window when absent. */
  crop?: { margin: number; /** Crop to these elements instead of the markers. */ selectors?: string[]; /** Keep the picture inside this element's left and right edges. */ within?: string };
}

const FIXTURES = fileURLToPath(new URL('../../tests/fixtures/sysex/', import.meta.url));

/**
 * The UC4 sends a dump: one complete SysEx message handed to the stub input, as Chrome does. Only these two
 * fixtures are allowed (factory data); never a file from dumps/, which holds a user's real setups.
 */
export async function receiveDump(page: Page, fixture: 'factory-SndA.syx' | 'base.syx'): Promise<void> {
  const bytes = [...readFileSync(`${FIXTURES}${fixture}`)];
  await page.evaluate((data) => {
    const input = (window as unknown as { __midiIn: { onmidimessage: ((e: { data: Uint8Array }) => void) | null } }).__midiIn;
    if (!input.onmidimessage) throw new Error('the editor is not listening to the stub input');
    input.onmidimessage({ data: Uint8Array.from(data) });
  }, bytes);
}

export async function save(page: Page, name: string, options: SaveOptions = {}): Promise<void> {
  // A shot never sends anything unless its script says so; an accidental send fails the shot.
  const sent = await page.evaluate(() => (window as unknown as { __sent: number[][] }).__sent.length);
  if (sent > 0 && !options.allowSends) throw new Error(`shot ${name}: ${sent} send(s) reached the MIDI stub`);
  // Let focus rings and the help line settle; the mouse must not hover anything.
  await page.mouse.move(0, 0);
  let clip: { x: number; y: number; width: number; height: number } | undefined;
  if (options.crop) {
    const m = options.crop.margin;
    const box = await page.evaluate((selectors) => {
      let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
      for (const el of document.querySelectorAll(selectors.length ? selectors.join(',') : '[data-guide-markers] [data-guide-box]')) {
        const q = el.getBoundingClientRect();
        l = Math.min(l, q.left); t = Math.min(t, q.top); r = Math.max(r, q.right); b = Math.max(b, q.bottom);
      }
      return { l, t, r, b };
    }, options.crop.selectors ?? []);
    if (!Number.isFinite(box.l)) throw new Error(`shot ${name}: crop needs markers`);
    const vw = page.viewportSize()!;
    let minX = 0, maxX = vw.width;
    if (options.crop.within) {
      const w = await page.locator(options.crop.within).boundingBox();
      if (!w) throw new Error(`shot ${name}: no element for ${options.crop.within}`);
      minX = w.x; maxX = w.x + w.width;
    }
    const x = Math.max(minX, box.l - m), y = Math.max(0, box.t - m);
    clip = { x, y, width: Math.min(maxX, box.r + m) - x, height: Math.min(vw.height, box.b + m) - y };
  }
  await page.screenshot({ path: `${IMAGES}${name}.png`, animations: 'disabled', ...(clip ? { clip } : {}) });
  await page.context().close();
}
