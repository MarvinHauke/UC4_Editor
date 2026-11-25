// The words of the reset confirmations: what exactly is lost (UX checklist item 8). Plain functions, tested as data.
import type { ConfirmSpec } from './confirmSpec.ts';

const slotName = (slot: number | undefined, name: string): string =>
  slot === undefined ? `"${name}"` : `"${name}" (SE${String(slot).padStart(2, '0')})`;

export function resetSetupTexts(slot: number | undefined, name: string): Omit<ConfirmSpec, 'run'> {
  return {
    title: `Reset ${slotName(slot, name)} to factory?`,
    body: [
      'Lost: the setup\'s name, all 8 encoder groups (names, encoders, push buttons), all 8 fader/button groups (faders, crossfaders, green buttons), and every label and note. All go back to the factory setup of this slot.',
      'You can undo this with Cmd-Z.',
    ],
    confirmLabel: 'Reset setup',
  };
}

export function resetEncoderGroupTexts(group: number, groupName: string, setupName: string): Omit<ConfirmSpec, 'run'> {
  return {
    title: `Reset encoder group ${group + 1} to factory?`,
    body: [
      `Lost in "${setupName}": the group's name (${groupName.trim() || 'blank'}), its label, and its 8 encoders and 8 push buttons. Other groups stay as they are.`,
      'You can undo this with Cmd-Z.',
    ],
    confirmLabel: 'Reset group',
  };
}

export function resetFaderButtonGroupTexts(group: number, setupName: string): Omit<ConfirmSpec, 'run'> {
  return {
    title: `Reset fader/button group ${group + 1} to factory?`,
    body: [
      `Lost in "${setupName}": the group's label, its 9 faders (including the crossfader) and its 8 green buttons. Other groups stay as they are.`,
      'You can undo this with Cmd-Z.',
    ],
    confirmLabel: 'Reset group',
  };
}

/** Reset all (plan 0006 decision 37): what is lost, and when the last export was (the status bar's "last exported"). */
export function resetAllTexts(lastExported: string): Omit<ConfirmSpec, 'run'> {
  return {
    title: 'Reset all 18 setups to factory?',
    body: [
      `Every setup's name, controls, group names, labels and notes go back to factory. Your changes are lost unless exported (last export: ${lastExported}).`,
      'Kept dumps and the UC4 are not touched, and nothing is sent. You can undo this with Cmd-Z.',
    ],
    confirmLabel: 'Reset all',
  };
}
