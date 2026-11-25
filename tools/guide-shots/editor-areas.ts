// The six areas of the editor, numbered 1–6 in the order of the guide page (src/app/profile/uc4Tour.ts, TOUR_AREAS).
import type { Browser } from 'playwright';
import { newShotPage, save } from './rig.ts';
import { addMarkers, type Marker } from './markers.ts';
import { TOUR_AREAS } from '../../src/app/profile/uc4Tour.ts';

// Where each number sits: the areas touch each other, so most numbers stand inside their area, in an empty corner.
const DOTS: Record<string, Marker['dot']> = {
  toolbar: 'middle', connections: 'bottom-left', properties: 'bottom-left', device: 'bottom-left', setups: 'bottom-right', help: 'middle',
};

export const name = 'editor-areas';

export async function run(browser: Browser): Promise<void> {
  const page = await newShotPage(browser);
  await addMarkers(page, TOUR_AREAS.map((a, i) => ({ selector: a.selector as string, n: i + 1, dot: DOTS[a.id] })), { dim: false });
  await save(page, name);
}
