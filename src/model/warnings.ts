// Warnings (plan 0008 decision 7): controls of one setup that can play together and send the same message.
// Beside `validate`, which keeps returning problems only. Pure; never throws.
import type { MessageKey, Uc4Config, Warning } from './types.ts';

interface Entry {
  path: string;
  name: string; // "Enc3 · EG1"
  half: 'enc' | 'fad';
  group: number;
  order: number;
  keys: MessageKey[];
}

type Sender = { type: string; channel: number; number: number; lower?: number; upper?: number };

// What a control sends: CC types and the button `CC` are all CC; `CCAh` is CC n and n + 32; `OFF` sends nothing.
// PrGC sends programs: a button's is its upper value, an encoder's or fader's the range lower…upper.
/**
 * The programs a PrGC control sends, 0–127 only (load() accepts out-of-range values as problems, so a bad file must
 * not build a huge list or an invented program): a button sends its upper value; an encoder or fader the range
 * lower…upper (either order) cut to 0–127. Non-integers or nothing left in range → none.
 */
export function programsOf(c: { lower?: number; upper?: number }, isButton: boolean): number[] {
  const { lower, upper } = c;
  if (!Number.isInteger(upper)) return [];
  if (isButton || typeof lower !== 'number') return upper! >= 0 && upper! <= 127 ? [upper!] : [];
  if (!Number.isInteger(lower)) return [];
  const lo = Math.max(0, Math.min(lower, upper!)), hi = Math.min(127, Math.max(lower, upper!));
  return Array.from({ length: Math.max(0, hi - lo + 1) }, (_, i) => lo + i);
}

function keysOf(c: Sender, isButton: boolean): MessageKey[] {
  const channel = c.channel;
  if (typeof channel !== 'number' || typeof c.number !== 'number') return [];
  switch (c.type) {
    case 'CCr1': case 'CCr2': case 'CCAb': case 'CC': return [{ kind: 'cc', channel, number: c.number }];
    case 'CCAh': return [{ kind: 'cc', channel, number: c.number }, { kind: 'cc', channel, number: c.number + 32 }];
    case 'notE': return [{ kind: 'note', channel, number: c.number }];
    case 'PrGC': {
      return programsOf(c, isButton).map((n) => ({ kind: 'program' as const, channel, number: n }));
    }
    case 'Pbnd': return [{ kind: 'pitchBend', channel }];
    case 'AFtt': return [{ kind: 'aftertouch', channel }];
    default: return [];
  }
}

const keyId = (k: MessageKey): string => `${k.kind}:${k.channel}:${k.number ?? ''}`;

const KIND_NAME: Record<MessageKey['kind'], string> = {
  cc: 'CC', note: 'note', program: 'program', pitchBend: 'pitch bend', aftertouch: 'aftertouch', polyAftertouch: 'poly aftertouch',
};
export function describeKey(k: MessageKey): string {
  const n = k.number === undefined ? '' : ` ${k.number}`;
  return `${KIND_NAME[k.kind]}${n} ch ${k.channel}`;
}

const canPlayTogether = (a: Entry, b: Entry): boolean => a.half !== b.half || a.group === b.group;

// Note: the factory layout collides by design (EG4 encoders ↔ FG1 faders, CC 32–39; docs/reference/uc4-device.md).
export function warnings(config: Uc4Config): Warning[] {
  const out: Warning[] = [];
  for (const [si, setup] of (Array.isArray(config?.setups) ? config.setups : []).entries()) {
    const entries: Entry[] = [];
    const add = (path: string, name: string, half: Entry['half'], group: number, c: Sender | undefined, button = false): void => {
      if (c) entries.push({ path, name, half, group, order: entries.length, keys: keysOf(c, button) });
    };
    (setup.encoderGroups ?? []).forEach((g, gi) => {
      g?.encoders?.forEach((c, i) => { add(`setups[${si}].encoderGroups[${gi}].encoders[${i}]`, `Enc${i + 1} · EG${gi + 1}`, 'enc', gi, c); });
      g?.pushButtons?.forEach((c, i) => { add(`setups[${si}].encoderGroups[${gi}].pushButtons[${i}]`, `Pbt${i + 1} · EG${gi + 1}`, 'enc', gi, c, true); });
    });
    (setup.faderButtonGroups ?? []).forEach((g, gi) => {
      g?.faders?.forEach((c, i) => { add(`setups[${si}].faderButtonGroups[${gi}].faders[${i}]`, `FAd${i + 1} · FG${gi + 1}`, 'fad', gi, c); });
      g?.buttons?.forEach((c, i) => { add(`setups[${si}].faderButtonGroups[${gi}].buttons[${i}]`, `btn${i + 1} · FG${gi + 1}`, 'fad', gi, c, true); });
    });

    const byKey = new Map<string, Entry[]>();
    for (const e of entries) for (const k of e.keys) {
      const id = keyId(k);
      const list = byKey.get(id);
      if (list) list.push(e); else byKey.set(id, [e]);
    }
    // One warning per pair; a pair sharing several messages (CCAh twice) is named by its lowest one.
    const found = new Map<string, { a: Entry; b: Entry; key: MessageKey }>();
    for (const list of byKey.values()) {
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        const a = list[i]!, b = list[j]!;
        if (a === b || !canPlayTogether(a, b)) continue;
        const key = a.keys.find((k) => b.keys.some((o) => keyId(o) === keyId(k)))!;
        const id = `${a.order}:${b.order}`;
        const prev = found.get(id);
        if (!prev || (key.number ?? 0) < (prev.key.number ?? 0)) found.set(id, { a, b, key });
      }
    }
    for (const { a, b, key } of [...found.values()].sort((x, y) => x.a.order - y.a.order || x.b.order - y.b.order)) {
      out.push({
        setupId: setup.id,
        ...(setup.slot === undefined ? {} : { slot: setup.slot }),
        controls: [a.path, b.path],
        key,
        signature: `${a.keys.map(keyId).join(',')}|${b.keys.map(keyId).join(',')}`,
        message: `${a.name} and ${b.name} both send ${describeKey(key)}`,
      });
    }
  }
  return out;
}
