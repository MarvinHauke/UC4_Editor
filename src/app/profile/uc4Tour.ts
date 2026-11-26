// The editor's six areas and the tour's last step (plan 0012 decision 1): one text for the tour and the guide page "The editor"
// (docs/guides/editor.md). Titles are the glossary's words; a test checks that each title appears on the guide page.
// Device profile data: another device keeps its own areas.

/** One step of the tour: an area of the editor, or the closing step (no area, `selector` null). */
export interface TourStep {
  id: string;
  title: string;
  /** Two or three short sentences. */
  sentences: readonly string[];
  /** The element to light; null for the closing step. */
  selector: string | null;
}

/** The six areas, in the order of the guide page (the numbers 1–6 of its overview picture). */
export const TOUR_AREAS: readonly TourStep[] = [
  {
    id: 'toolbar', title: 'Toolbar', selector: 'header.top',
    sentences: [
      'Import opens a configuration (.json) or a dump (.syx) from your computer, and Export saves the library.',
      'Undo and redo step back and forward through your changes.',
      'The book opens the user guide; the gear opens Settings.',
    ],
  },
  {
    id: 'connections', title: 'Connections', selector: 'aside[aria-label="Connections"]',
    sentences: [
      'This column shows whether the UC4 is connected and holds the dumps it sent, with Review, Export and Dismiss.',
      'It only listens: the editor sends nothing to the UC4 until you press Send.',
    ],
  },
  {
    id: 'properties', title: 'Property panel', selector: '[data-area="properties"]',
    sentences: [
      'Here you edit the group names and, once you select a control, its properties.',
      'It shows only the properties that control kind has, in the UC4\'s own words, such as CCr1 or SnAP.',
    ],
  },
  {
    id: 'device', title: 'Device view', selector: '[data-area="device"]',
    sentences: [
      'The drawn UC4 shows the selected setup. Click a control to edit it.',
      'The arrows step through the 8 encoder groups and the 8 fader/button groups, each on its own, as on the device.',
    ],
  },
  {
    id: 'setups', title: 'Setup list', selector: '[data-area="setups"]',
    sentences: [
      'The 18 setups of the library, named SE01 to SE18 like the UC4\'s slots. Click one to show it on the device view.',
      'Rename, copy and paste setups here, and send one to the UC4 with Send.',
    ],
  },
  {
    id: 'help', title: 'Help line', selector: 'footer',
    sentences: [
      'The line at the bottom says what is under the mouse or in focus.',
      'It also shows messages, such as a value that was refused and what to do about it.',
    ],
  },
];

/** The closing step: the setups on screen are factory setups until the user brings their own. Its button opens the dump overlay (step 4). */
export const TOUR_LAST: TourStep = {
  id: 'get-setups', title: 'Get your own setups from the UC4', selector: null,
  sentences: [
    'The 18 setups on screen are factory setups until you bring your own.',
    'Send all setups (SndA) from the UC4 and the editor receives them. Nothing is changed on the UC4.',
  ],
};

/** All steps in order: the six areas, then the closing step. */
export const TOUR_STEPS: readonly TourStep[] = [...TOUR_AREAS, TOUR_LAST];

/** The welcome card's words (plan 0012 decision 8): the device's name and maker are the profile's, not the card's. */
export const MAKER = 'Faderfox';
/** The device's page at its maker, linked from Settings → About. */
export const MAKER_DEVICE_URL = 'https://faderfox.de/uc4.html';

export function welcomeTexts(deviceName: string) {
  return {
    title: `Welcome to the ${deviceName} Editor`,
    lead: `Edit, back up and send the setups of your ${MAKER} ${deviceName}, in the browser.`,
    unofficial: `Unofficial: not made or supported by ${MAKER}.`,
    tourLabel: 'Take the tour',
    tourHelp: `Take the tour: a short walk through the ${TOUR_AREAS.length} areas of the editor`,
    getLabel: `Get my setups from the ${deviceName}`,
    getHelp: `Get my setups from the ${deviceName}: opens the steps for sending all setups from the ${deviceName} · the editor sends nothing to the ${deviceName}`,
    hint: 'The tour is in Settings → Tour any time; the guide is behind the book icon.',
  };
}

/** The tour card's last button: the dump overlay for all setups. */
export function tourGetHelp(deviceName: string): string {
  return `Get your setups: opens the guide for sending all setups from the ${deviceName} · the editor sends nothing to the ${deviceName}`;
}
