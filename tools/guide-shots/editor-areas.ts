// The six areas of the editor, numbered 1–6 in the order of the guide page (src/app/profile/uc4Tour.ts, TOUR_AREAS).
import type { Browser } from 'playwright';
import { newShotPage, save } from './rig.ts';
import { addMarkers, type Marker } from './markers.ts';
import { TOUR_AREAS } from '../../src/app/profile/uc4Tour.ts';

// Where each number sits: inside its area, in an empty place (never over a title or a text).
const DOTS: Record<string, Marker['dot']> = {
  toolbar: 'middle', connections: 'bottom-center', properties: 'bottom-center', device: 'top-left', setups: 'bottom-right', help: 'middle-right',
};

export const name = 'editor-areas';

export async function run(browser: Browser): Promise<void> {
  const page = await newShotPage(browser);
  // The idle help line, not the import message: select a control, leave edit mode, drop the focus.
  await page.locator('[data-control="encoders:0"]').click();
  await page.keyboard.press('Escape');
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.mouse.move(2, 2);
  await addMarkers(page, TOUR_AREAS.map((a, i) => ({ selector: a.selector as string, n: i + 1, dot: DOTS[a.id] })), { dim: false, inset: 6 });
  await save(page, name);
}
