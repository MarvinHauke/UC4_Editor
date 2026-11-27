import { describe, expect, it, vi } from 'vitest';
import { createSender } from '../../src/app/sender.svelte.ts';

const bytes = (...b: number[]): Uint8Array => new Uint8Array(b);

describe('sender', () => {
  it('records a send the port accepted, and a restore is recognised by its own line', () => {
    const record = vi.fn();
    const s = createSender({ sendDump: () => ({ ok: true, bytes: 2 }) }, 'UC4', record);
    const plan = { bytes: bytes(0xf0, 0xf7), backup: { dumpId: 'd', receivedAt: '2026-11-18T09:41:00.000Z' } };
    s.send(16, plan, 'restore');
    expect(record).toHaveBeenCalledWith(16, plan);
    expect(s.line?.text).toContain('Restored SE16 from the backup');
    expect(s.matches(bytes(0xf0, 0xf7))).toBe(true);
    expect(s.line?.text).toBe('SE16 on the UC4 matches the backup');
  });
  it('a second restore records its own bytes with the same backup', () => {
    const record = vi.fn();
    const s = createSender({ sendDump: () => ({ ok: true, bytes: 2 }) }, 'UC4', record);
    const backup = { dumpId: 'd', receivedAt: '2026-11-18T09:41:00.000Z' };
    s.send(16, { bytes: bytes(0xf0, 1, 0xf7), backup }, 'restore');
    s.send(16, { bytes: bytes(0xf0, 1, 0xf7), backup }, 'restore');
    expect(record).toHaveBeenCalledTimes(2);
    expect(record.mock.calls[1]![1].backup).toEqual(backup);
  });
  it('runs onsent only when the port accepted the send', () => {
    const onsent = vi.fn();
    createSender({ sendDump: () => ({ ok: false, reason: 'not-connected', message: 'No.' }) }, 'UC4').send(5, { bytes: bytes(1), backup: null }, 'send', onsent);
    expect(onsent).not.toHaveBeenCalled();
    createSender({ sendDump: () => ({ ok: true, bytes: 1 }) }, 'UC4').send(5, { bytes: bytes(1), backup: null }, 'send', onsent);
    expect(onsent).toHaveBeenCalledTimes(1);
  });
  it('records nothing when the send failed', () => {
    const record = vi.fn();
    createSender({ sendDump: () => ({ ok: false, reason: 'not-connected', message: 'No.' }) }, 'UC4', record).send(5, { bytes: bytes(1), backup: null });
    expect(record).not.toHaveBeenCalled();
  });
  it('sends once, closes the dialog and says what was sent', () => {
    const sendDump = vi.fn(() => ({ ok: true as const, bytes: 3 }));
    const s = createSender({ sendDump }, 'UC4');
    s.open(5, 'x');
    s.send(5, { bytes: bytes(0xf0, 1, 0xf7), backup: null });
    expect(sendDump).toHaveBeenCalledTimes(1);
    expect(s.dialog).toBeNull();
    expect(s.line).toMatchObject({ tone: 'ok', text: expect.stringContaining('Sent SE05.') });
  });
  it('shows the failure message instead and recognises nothing afterwards', () => {
    const s = createSender({ sendDump: () => ({ ok: false, reason: 'not-connected', message: 'Not connected.' }) }, 'UC4');
    s.send(5, { bytes: bytes(1), backup: null });
    expect(s.line).toEqual({ text: 'Not connected. Nothing was sent.', tone: 'error' });
    expect(s.matches(bytes(1))).toBe(false);
  });
  it('recognises the same bytes coming back, not different ones', () => {
    const s = createSender({ sendDump: () => ({ ok: true, bytes: 2 }) }, 'UC4');
    s.send(16, { bytes: bytes(0xf0, 0xf7), backup: null });
    expect(s.matches(bytes(0xf0, 1, 0xf7))).toBe(false);
    expect(s.matches(bytes(0xf0, 0xf7))).toBe(true);
    expect(s.line?.text).toBe('SE16 on the UC4 matches the editor');
  });
});
