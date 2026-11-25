// The names printed on the UC4 panel for the Ableton setups SE17/SE18 (photo of the panel, user, 2026-11-14;
// docs/reference/uc4-device.md "Printed Ableton names"). They name the GROUPS that shift + encoder n and
// shift + green button n select. Device profile data.
export interface PrintedGroupNames {
  /** The slots whose factory setup the panel's print belongs to. */
  slots: readonly number[];
  /** Under encoder n: encoder group n. */
  encoder: readonly string[];
  /** Above green button n: fader/button group n. */
  faderButton: readonly string[];
}

export const PRINTED_GROUP_NAMES: PrintedGroupNames = {
  slots: [17, 18],
  encoder: ['Send 1', 'Send 2', 'Send 3', 'Send 4', 'Track', 'Rack', 'Pan', 'Global'],
  faderButton: ['Launch', 'Stop', 'Active', 'Solo', 'Record', 'Monitor', 'Track', 'Select'],
};
