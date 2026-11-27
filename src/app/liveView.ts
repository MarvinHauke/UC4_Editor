// What the live view draws and says (plan 0008 step 2): the match label of a monitor row, how a match is selected in the
// editor, and the shapes of a control's live state (fader mark, encoder ring). Pure; the matching itself is `src/live/`.
import { isEncoderArea } from '../model/index.ts';
import type { ControlRef, ControlState, LiveRow, Match } from '../live/index.ts';

export interface MatchLabel { name: string; more: number; where: string | null }

/** "FAd3 · FG2" with "+2" for the other matches; `where` says why it isn't in the open groups ("other group", the setup's name). Null: no control sends the message. */
export function matchLabel(row: Pick<LiveRow, 'best' | 'more'>): MatchLabel | null {
  const m = row.best;
  if (!m) return null;
  return { name: m.control.name, more: row.more, where: whereWord(m) };
}

export function whereWord(m: Match): string | null {
  return m.tier === 1 ? null : m.tier === 2 ? 'other group' : m.control.setupName;
}

/** The commands selecting a match needs (the library store has them). */
export interface SelectCommands {
  selectSetup(setupId: string): unknown;
  selectGroup(kind: 'encoder' | 'faderButton', group: number): unknown;
  selectControl(control: { area: ControlRef['area']; index: number }): unknown;
}

/** Shows a match in the editor: its setup (tier 3), its group and the control itself. */
export function selectMatch(commands: SelectCommands, match: Match, currentSetupId: string): void {
  const c = match.control;
  if (c.setupId !== currentSetupId) commands.selectSetup(c.setupId);
  commands.selectGroup(isEncoderArea(c.area) ? 'encoder' : 'faderButton', c.group);
  commands.selectControl({ area: c.area, index: c.index });
}

/** The ring of an absolute encoder: an arc over 270° (from 7 to 5 o'clock, through the top) at radius `r`, filled to `fraction`. */
export function ringPath(cx: number, cy: number, r: number, fraction: number): string {
  const f = Math.min(1, Math.max(0, fraction));
  if (f === 0) return '';
  const start = -135, sweep = 270 * f; // degrees, 0 = up, clockwise
  const point = (deg: number) => {
    const a = (deg * Math.PI) / 180;
    return `${(cx + r * Math.sin(a)).toFixed(2)} ${(cy - r * Math.cos(a)).toFixed(2)}`;
  };
  return `M${point(start)} A${r} ${r} 0 ${sweep > 180 ? 1 : 0} 1 ${point(start + sweep)}`;
}

/** Where a relative encoder's marker sits on the 270° sweep (-135° = 7:30, +135° = 4:30, 0 = up): each net tick turns it 13.5° (20 ticks per sweep), wrapping exactly within it. */
export function relativeAngle(total: number): number {
  return ((total * 13.5) % 270 + 270) % 270 - 135;
}

/** A control's live state in words for its help line; null while it is unknown. */
export function stateText(s: ControlState | undefined): string | null {
  if (!s) return null;
  switch (s.kind) {
    case 'absolute': return s.fraction === null ? `last sent ${s.value}` : `${s.value} · ${Math.round(s.fraction * 100)}%`;
    case 'relative': return `${s.delta > 0 ? '+' : '−'}${Math.abs(s.delta)} · net ${s.total > 0 ? '+' : s.total < 0 ? '−' : ''}${Math.abs(s.total)}`;
    case 'button': return s.on ? 'on' : 'off';
    case 'trigger': return `pressed ${s.count}×`;
  }
}
