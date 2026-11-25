// The device view with three markers: 1 the encoder group selection (the arrows), 2 an encoder, 3 the command type field.
import type { Browser } from 'playwright';
import { newShotPage, save } from './rig.ts';
import { addMarkers } from './markers.ts';

export const name = 'editor-overview';

export async function run(browser: Browser): Promise<void> {
  const page = await newShotPage(browser);
  await page.locator('[data-control="encoders:0"]').click();
  await addMarkers(page, [
    { selector: '[aria-label$="encoder group"]', n: 1 },
    { selector: '[data-control="encoders:0"]', n: 2 },
    { selector: '[aria-label="Properties"] [data-property="type"] label, [aria-label="Properties"] [data-property="type"] select', n: 3, union: true },
  ]);
  await save(page, name);
}
