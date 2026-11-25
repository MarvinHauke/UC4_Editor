// The area guard: nothing leaves the engine that could write outside the three setup areas of the device.
// Rule from the manufacturer (Faderfox, 2026-11-25): write only group names, crossfader and setup data; the download type
// is one setup or all setups, never the firmware. Pure and total: a refusal is a result with the reason, never a throw.
import { parseFrame, splitMessages, type FrameRules } from './frame.ts';
import type { DeviceProfile } from './profile.ts';
import type { Failure } from './types.ts';

export type SendCheck = { ok: true } | { ok: false; reason: Failure };

const hex = (n: number): string => '0x' + n.toString(16).toUpperCase();

/**
 * Checks bytes that are about to leave the editor (one or more `F0 … F7` messages). Refuses when:
 * - there is no message, or something outside a message;
 * - a message cannot be read back exactly (unknown commands such as app functions, stray bytes, a wrong frame);
 * - the download type (header command 2) is not in the profile's `writeTypes` (`02` one setup, `03` all setups; `01` is the firmware);
 * - a record's address range is not wholly inside one of the profile's write areas.
 * It does not check sums or lengths: `parse` does that for what the encoder makes.
 */
export function checkSendable(profile: DeviceProfile, bytes: Uint8Array): SendCheck {
  const refuse = (code: 'outside-write-area' | 'unsafe-download-type' | 'not-sysex' | 'not-lossless', message: string, whatToDo: string): SendCheck =>
    ({ ok: false, reason: { code, message, whatToDo } });
  const rules: FrameRules = { manufacturerId: profile.framing.manufacturerId, recordDataLength: profile.framing.recordDataLength };
  const parts = splitMessages(bytes);
  const covered = parts.reduce((n, p) => n + p.length, 0);
  if (parts.length === 0 || covered !== bytes.length)
    return refuse('not-sysex', 'These bytes are not exactly one or more complete SysEx messages.', `Only dumps made by the editor for the ${profile.deviceName} can be sent.`);
  for (const part of parts) {
    const f = parseFrame(part, rules);
    if (!f.ok) return refuse('not-sysex', `A message cannot be read (${f.reason}).`, `Only dumps made by the editor for the ${profile.deviceName} can be sent.`);
    if (!f.frame.lossless)
      return refuse('not-lossless', `A message holds commands or bytes the editor does not write (${f.warnings.join('; ')}).`, 'Nothing was sent. Make the dump again with the editor.');
    const type = f.frame.header[1]!;
    if (!profile.framing.writeTypes.includes(type))
      return refuse('unsafe-download-type', `Download type ${type.toString(16).padStart(2, '0')} is not a setup download (only ${profile.framing.writeTypes.map((c) => c.toString(16).padStart(2, '0')).join(' and ')} are written; 01 is the firmware).`, 'Nothing was sent.');
    for (const r of f.frame.records) {
      const end = r.address + r.data.length;
      if (!profile.layout.writeAreas.some((a) => r.address >= a.from && end <= a.to))
        return refuse('outside-write-area', `A record at ${hex(r.address)}–${hex(end - 1)} lies outside the areas the ${profile.deviceName} may be written (${profile.layout.writeAreas.map((a) => `${hex(a.from)}–${hex(a.to - 1)}`).join(', ')}).`, 'Nothing was sent. Make the dump again with the editor.');
    }
  }
  return { ok: true };
}
