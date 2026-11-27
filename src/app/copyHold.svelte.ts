// What the user has copied (a snapshot, a Clip: plan 0006 decision 35), and the commands that copy and paste (plan 0006 decisions 30–34). One copy is held at a time;
// it survives selecting another setup, so groups and controls paste across setups. The library does the pasting (one
// undo step each, a refusal comes back as the state's message for the help line).
import { getContext } from 'svelte';
import type { Store } from './libraryStore.svelte.ts';
import type { Clip, ControlArea, CopySource } from '../storage/index.ts';
import { groupOf } from './selectors.ts';
import { levelOfHeld, type Level } from './copyPaste.ts';
import type { Flash } from './flash.ts';

export function createCopyHold(getStore: () => Store | null, section: () => 'encoder' | 'faderButton') {
  // The commands run from the UI, which exists only once the library has opened.
  const S = (): Store => getStore()!;
  let clip = $state.raw<Clip | null>(null);
  // The last Copy or Paste, for the visual answer (decision 36): the rows, steps and controls it names flash once.
  let flash = $state.raw<Flash | null>(null);
  let events = 0;
  const ping = (kind: Flash['kind'], ...targets: string[]): void => { flash = { kind, targets, n: ++events }; };
  const sectionOf = (k: 'encoderGroup' | 'faderButtonGroup' | 'encoder' | 'faderButton'): 'encoder' | 'faderButton' => (k.startsWith('encoder') ? 'encoder' : 'faderButton');
  /** A paste flashes only when it changed the library (a refusal says why on the help line instead). */
  const pasted = (run: () => void, ...targets: string[]): void => {
    const before = S().state.configuration;
    run();
    if (S().state.configuration !== before) ping('paste', ...targets);
  };
  /** Copy takes the snapshot now; a refusal's reason goes to the help line (the library says it) and a copy already held stays. */
  const snap = (source: CopySource): Clip | null => S().copy(source).clip ?? null;
  const say = (text: string): void => { S().say(text); };
  const nothing = (): void => { say('Nothing is copied. Press Copy on a setup, a group or a control first.'); };
  return {
    /** What the copy was taken from (the copied item stays marked); the pastes use the Clip itself. */
    get held() { return clip?.from ?? null; },
    /** The last Copy or Paste with the targets it names (`setup:<id>`, `group:<section>:<n>`, `area:<section>`, `control:<area>:<index>`). */
    get flash() { return flash; },
    /** The device view's controls named (`control:<area>:<index>`) flash once: what a Resolve plan changed. */
    pulse(targets: readonly string[]): void { if (targets.length > 0) ping('paste', ...targets); },
    stop(): void { clip = null; },
    /** Copy the selected setup, the group on show in the active section, or the selected control. */
    copy(level: Level): void {
      const st = S().state;
      const setupId = st.selection.setupId;
      let source: CopySource;
      if (level === 'setup') source = { kind: 'setup', setupId };
      else if (level === 'group') { const k = section(); source = { kind: k === 'encoder' ? 'encoderGroup' : 'faderButtonGroup', setupId, group: k === 'encoder' ? st.selection.encoderGroup : st.selection.faderButtonGroup }; }
      else {
        const c = st.selection.control;
        if (!c) { say('Pick a control first to copy it.'); return; }
        source = { kind: 'control', setupId, area: c.area, group: groupOf(st, c.area), index: c.index };
      }
      const taken = snap(source);
      if (!taken) return;
      clip = taken;
      if (source.kind === 'setup') ping('copy', `setup:${source.setupId}`);
      else if (source.kind === 'control') ping('copy', `control:${source.area}:${source.index}`);
      // The group steps appear with this very Copy (they can't flash), so the group on show, the device area, pulses too.
      else ping('copy', `group:${sectionOf(source.kind)}:${source.group}`, `area:${sectionOf(source.kind)}`);
    },
    /** Paste the held item onto the selected setup, the group on show, or the selected control (Cmd-V, the Paste buttons). */
    paste(level: Level): void {
      const held = clip?.from;
      if (!held) { nothing(); return; }
      // The device view shows the group too: with a group held, Cmd-V there pastes the group.
      if (level === 'control' && levelOfHeld(held) === 'group') level = 'group';
      if (levelOfHeld(held) !== level) { say(`That is not the kind you copied. Paste ${levelOfHeld(held) === 'group' ? 'onto a group' : levelOfHeld(held) === 'setup' ? 'onto a setup' : 'onto a control'}.`); return; }
      const st = S().state;
      if (held.kind === 'setup') this.pasteSetupOnto(st.selection.setupId);
      else if (held.kind === 'control') { const c = st.selection.control; if (c) this.pasteControlOnto(c.area, c.index); else say('Pick the control to paste onto first.'); }
      else this.pasteGroupOnto(held.kind === 'encoderGroup' ? st.selection.encoderGroup : st.selection.faderButtonGroup);
    },
    /** A setup row's paste icon: the held setup, else the selected one (decision 31), onto that row. */
    pasteSetupOnto(targetId: string): void {
      // With nothing held the selected setup is copied at this moment (decision 31); a held copy of another kind is not a setup.
      if (clip && clip.kind !== 'setup') { say('That is not a setup. Copy a setup first.'); return; }
      const taken = clip ?? snap({ kind: 'setup', setupId: S().state.selection.setupId });
      if (taken) pasted(() => { S().pasteSetup(taken, targetId); }, `setup:${targetId}`);
    },
    /** A group number of the selected setup. */
    pasteGroupOnto(group: number): void {
      if (clip?.kind !== 'encoderGroup' && clip?.kind !== 'faderButtonGroup') { nothing(); return; }
      const to = { setupId: S().state.selection.setupId, group };
      const c = clip;
      const sec = sectionOf(c.kind as 'encoderGroup' | 'faderButtonGroup');
      const shown = sec === 'encoder' ? S().state.selection.encoderGroup : S().state.selection.faderButtonGroup;
      pasted(() => { if (c.kind === 'encoderGroup') S().pasteEncoderGroup(c, to); else S().pasteFaderButtonGroup(c, to); },
        `group:${sec}:${group}`, ...(group === shown ? [`area:${sec}`] : []));
    },
    /** A control of the shown group of the selected setup. */
    pasteControlOnto(area: ControlArea, index: number): void {
      if (clip?.kind !== 'control') { nothing(); return; }
      const st = S().state;
      const c = clip;
      pasted(() => { S().pasteControl(c, { setupId: st.selection.setupId, area, group: groupOf(st, area), index }); }, `control:${area}:${index}`);
    },
  };
}
export type CopyHold = ReturnType<typeof createCopyHold>;
export const COPY_CONTEXT = Symbol('uc4-copy');
export const useCopyHold = (): CopyHold => getContext<CopyHold>(COPY_CONTEXT);
