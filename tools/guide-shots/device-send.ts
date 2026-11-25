// The Send dialog with the callouts on the drawn UC4. A SndA of factory data came first (the backup); SE01 of the demo
// library differs from it, so the dialog lists changes. Nothing reaches a port: the stub only records sends.
import type { Browser } from 'playwright';
import { newShotPage, receiveDump, save } from './rig.ts';

export const name = 'device-send';

export async function run(browser: Browser): Promise<void> {
  const page = await newShotPage(browser);
  await receiveDump(page, 'factory-SndA.syx');
  await page.getByRole('button', { name: /^Send SE01 to UC4/ }).click();
  await page.locator('[role="group"][aria-label="Send"]').waitFor();
  await save(page, name, { crop: { margin: 0, selectors: ['dialog[open]', '[role="group"][aria-label="Send"]', '.centre'] } });
}
