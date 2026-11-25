// The "Send a dump from the UC4" guide's words and its status line (plan 0010 decision 6). Plain data and functions: the state is
// dumpGuide.svelte.ts, the card is GuideCard / ListenCard.
import type { ConnectionState } from '../midi/connection.ts';

/** What the card says while the guide listens, and the one action it offers when the UC4 is not connected. */
export interface ListenStatus { text: string; waiting: boolean; connect: 'connect' | 'again' | null }

export function listenStatus(state: ConnectionState, deviceName: string): ListenStatus {
  switch (state.kind) {
    case 'connected': return { text: `Waiting for a dump from the ${deviceName}…`, waiting: true, connect: null };
    case 'choose-port': return { text: `Several ports match. Select your ${deviceName} under Connections.`, waiting: false, connect: null };
    case 'denied': return { text: state.message, waiting: false, connect: 'again' };
    case 'unsupported': return { text: state.message, waiting: false, connect: null };
    case 'not-connected': return { text: state.message, waiting: false, connect: state.access ? null : 'connect' };
  }
}
