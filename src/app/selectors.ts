// Reading the configuration for display. No editing here: edits go through the library's commands.
import type { Encoder, Fader, GreenButton, PushButton, Setup, Uc4Config } from '../model/index.ts';
import type { ControlArea, LibraryState } from '../storage/index.ts';

export type AnyControl = Encoder | PushButton | GreenButton | Fader;

export const isEncoderArea = (area: ControlArea): boolean => area === 'encoders' || area === 'pushButtons';

export function selectedSetup(state: LibraryState): { setup: Setup; index: number } {
  const { configuration, selection } = state;
  const index = Math.max(0, configuration.setups.findIndex((s) => s.id === selection.setupId));
  return { setup: configuration.setups[index]!, index };
}

/** The group of an area that is on show (each area has its own selection). */
export const groupOf = (state: LibraryState, area: ControlArea): number =>
  isEncoderArea(area) ? state.selection.encoderGroup : state.selection.faderButtonGroup;

export function controlAt(config: Uc4Config, setupId: string, area: ControlArea, group: number, index: number): AnyControl | undefined {
  const setup = config.setups.find((s) => s.id === setupId);
  if (!setup) return undefined;
  if (area === 'encoders' || area === 'pushButtons') return setup.encoderGroups[group]?.[area][index];
  return setup.faderButtonGroups[group]?.[area][index];
}
