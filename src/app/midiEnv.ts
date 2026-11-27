// The MIDI environment the app uses: the browser's, or in development a fake one (`?midi=fake`) so the monitor can be
// tried without hardware. The fake file is only loaded in a dev build; production never contains it.
import { browserMidiEnv } from '../midi/browserEnv.ts';
import type { MidiEnv } from '../midi/connection.ts';

export function appMidiEnv(): MidiEnv {
  if (import.meta.env.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).get('midi') === 'fake') {
    // One fake world shared by the dump connection and the monitor, like the one real browser access.
    const fake = import('./devMidi.ts').then((m) => m.fakeMidiEnv());
    return { supported: true, requestAccess: async () => (await fake).requestAccess(), queryPermission: async () => 'granted' };
  }
  return browserMidiEnv();
}
