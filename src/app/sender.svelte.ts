// The Send flow as Svelte state (plan 0005 step 13): which dialog is open, the line Connections shows after a send, and the
// bytes last sent (so a `Sndc` coming back can be recognised). The only caller of `device.sendDump`, on the Send button.
import type { Device } from './deviceStore.svelte.ts';
import { failedLine, matchLine, restoredLine, restoreMatchLine, sameBytes, sentLine } from './sendFlow.ts';

export interface SendLine { text: string; tone: 'ok' | 'error' }

export type SendKind = 'send' | 'restore';

/** `record` runs after a send or restore the UC4's port accepted: the library remembers it (`recordSend`). */
export function createSender(device: Pick<Device, 'sendDump'>, deviceName: string, record?: (slot: number, plan: { bytes: Uint8Array; backup: { dumpId: string; receivedAt: string } | null }) => void) {
  let dialog = $state.raw<{ slot: number; name: string; kind: SendKind } | null>(null);
  let line = $state.raw<SendLine | null>(null);
  let sent: { slot: number; bytes: Uint8Array; kind: SendKind } | null = null;
  return {
    get dialog() { return dialog; },
    /** The one line under Send in Connections: what was sent, a failure, or that the UC4 matches. */
    get line() { return line; },
    open(slot: number, name: string, kind: SendKind = 'send'): void { dialog = { slot, name, kind }; },
    close(): void { dialog = null; },
    /** The Send button: one `Sndc` out; `onsent` runs only when the port accepted it ("Send anyway" waives then, not before). The dialog closes either way; a failure's message takes the place of the "Sent" line. */
    send(slot: number, plan: { bytes: Uint8Array; backup: { dumpId: string; receivedAt: string } | null }, kind: SendKind = 'send', onsent?: () => void): void {
      const r = device.sendDump(plan.bytes);
      dialog = null;
      if (r.ok) {
        sent = { slot, bytes: plan.bytes.slice(), kind };
        line = { text: kind === 'restore' ? restoredLine(slot, deviceName) : sentLine(slot, deviceName), tone: 'ok' };
        record?.(slot, plan);
        onsent?.();
      }
      else { sent = null; line = { text: failedLine(r.message), tone: 'error' }; }
    },
    /** A dump arrived from the UC4: true (and the matching line) when it is byte for byte what was last sent. */
    matches(bytes: Uint8Array): boolean {
      if (!sent || !sameBytes(sent.bytes, bytes)) return false;
      line = { text: sent.kind === 'restore' ? restoreMatchLine(sent.slot, deviceName) : matchLine(sent.slot, deviceName), tone: 'ok' };
      return true;
    },
  };
}
export type Sender = ReturnType<typeof createSender>;
