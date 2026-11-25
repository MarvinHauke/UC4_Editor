// The Connections column with a dump the UC4 just sent: 1 the waiting notice, 2 the kept dump. Factory data only.
import type { Browser } from 'playwright';
import { newShotPage, receiveDump, save } from './rig.ts';
import { addMarkers } from './markers.ts';

export const name = 'device-connections';

export async function run(browser: Browser): Promise<void> {
  const page = await newShotPage(browser);
  await page.getByRole('button', { name: /^Connections: UC4 connected/ }).click();
  await receiveDump(page, 'base.syx');
  await page.locator('[aria-label="Received"]').waitFor();
  // The picture is about the two sections: the text around them is hidden (not removed), so no cut-off words remain.
  await page.addStyleTag({ content: '.conn [aria-label="Connection"], .conn details, .conn .panel > h2 { visibility: hidden }' });
  await addMarkers(page, [
    { selector: '[aria-label="Received"]', n: 1, dot: 'top-right' },
    { selector: '[aria-label="Kept dumps"]', n: 2, dot: 'top-right' },
  ]);
  await save(page, name, { crop: { margin: 4, within: '.conn .panel' } });
}
