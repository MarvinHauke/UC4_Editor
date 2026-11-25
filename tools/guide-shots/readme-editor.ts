// The README's picture: the whole editor with encoder 1 selected, no markers.
import type { Browser } from 'playwright';
import { newShotPage, save } from './rig.ts';

export const name = 'readme-editor';

export async function run(browser: Browser): Promise<void> {
  const page = await newShotPage(browser);
  await page.locator('[data-control="encoders:0"]').click();
  await save(page, name);
}
