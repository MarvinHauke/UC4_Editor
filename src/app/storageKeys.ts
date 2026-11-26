/** Every `uc4-editor-*` browser-storage key, in one place so no two collide. Never change a value: stored state would be lost.
 * (The IndexedDB name `uc4-editor` belongs to src/storage and stays there.) */
export const LIST_WIDTH_KEY = 'uc4-editor-list-width';
export const TOUR_SEEN_KEY = 'uc4-editor-tour-seen';
export const SETTINGS_KEY = 'uc4-editor-settings';
export const CONNECTIONS_KEY = 'uc4-editor-connections-open';
export const FOLLOW_KEY = 'uc4-editor-follow';
export const INPUT_KEY = 'uc4-editor-monitor-input';
export const SESSION_STATE_KEY = 'uc4-editor-live-session';
export const FOLD_KEY = 'uc4-editor-connections-folds';

export const ALL_STORAGE_KEYS: readonly string[] = [
  LIST_WIDTH_KEY,
  TOUR_SEEN_KEY,
  SETTINGS_KEY,
  CONNECTIONS_KEY,
  FOLLOW_KEY,
  INPUT_KEY,
  SESSION_STATE_KEY,
  FOLD_KEY,
];
