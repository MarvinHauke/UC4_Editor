// What the live view works on: one MIDI channel message with where and when it arrived (plan 0008, decision 13).
// Pure types and the key rule; the MIDI input (`src/midi/inputs.ts`) produces them, the live session consumes them.

/** The kinds of channel message the monitor lists (decision 3). `note` covers note-on and note-off. */
export type MessageKind = 'note' | 'cc' | 'program' | 'pitchBend' | 'aftertouch' | 'polyAftertouch';

/**
 * One channel message as the wire carries it. `channel` is 1–16 (the device's numbering), `number` is the note, the CC
 * or the program (null for pitch bend and channel aftertouch). `value` is the raw value: 0–127, pitch bend 0–16383
 * (centre 8192); a note-off keeps its release velocity. `on` is only set for `note`.
 */
export interface ChannelMessage {
  kind: MessageKind;
  channel: number;
  number: number | null;
  value: number;
  on?: boolean;
}

/** A message with its source: the id of the MIDI input, whether that input is the UC4 (by the profile's port name) and ms since the epoch. */
export interface ChannelEvent {
  message: ChannelMessage;
  inputId: string;
  isUc4: boolean;
  at: number;
}

/** The message key: type, channel and number (decision 3). One monitor row per key. */
export function messageKey(m: Pick<ChannelMessage, 'kind' | 'channel' | 'number'>): string {
  return `${m.kind}:${m.channel}:${m.number ?? ''}`;
}
