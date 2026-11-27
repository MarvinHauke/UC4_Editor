# Status and next steps

The working state: what is in work, what waits for a check, and open questions. Maintained by the architect.
The order of features is in the [plan index](README.md#next-in-dependency-order); decisions live in the numbered
plans; protocol facts in `docs/protocol/uc4-sysex.md`. Finished work is in the git history, not here: when an item is
done, delete it (pruned 2026-11-26, retro).

_Last updated: 2026-11-27 (0008 steps 20–21, the review fixes, in work). Before: 2026-11-27 (0008 steps 13–19 done; code review queued). Before: 2026-11-26 (0008 live view built, code-review fixes done; Split removal and the retro's checks in work)._

## In work

- **0008 live view** (user, 2026-11-26, branch `feat/live-view`, local): monitor, matching, pins, Follow, switch offer,
  warnings with waivers and the Problems and warnings dialog, Map by click and by touch, clearing a colliding
  mapping (decisions 3–28). Steps 1–12 built and browser-checked; the code review's 9 findings fixed (decision 27);
  1477 tests. Not browser-checked: the "● n problems" button, Connect from the dump guide, ✕ on an already-factory
  control (unit-tested). PR only on the user's word. Later: monitor sorting (decision 25 Q5), a control label field,
  DAW feedback, Learn, check mode (decisions 16, 9, 19).
- **Local branches, not pushed** (user tries first, 0010 decision 7): `fix/guide-and-dump-overlay` →
  `feat/onboarding` (0012, welcome card `d6b7a9f`) → `feat/compact-dumps` (0010 step 6 in work).
- **Public:** `MarvinHauke/UC4_Editor` (PR #1 merged and deployed 2026-11-26; the old repo is `UC4_Editor-workshop`).
  0011: PR #2 with the user. 0009 user guide built (`ab52ad4`; preview `npm run docs` on :8000).
- **Retro 2026-11-26** done: CI on every push and pull request (`ac1c652`: plan check, lint, test, build),
  `tools/check-plans.ts` (`7696577`), lint green (`a1a2c2e`), one storage-key module with a lint rule (`a664155`),
  "one right edge" and `docs/agents/browser-checks.md` (`5b9a0b3`), STATUS pruned. 0008 step 12 (no Split) done;
  crossfader centred (`771109b`).

## Next (2026-11-27)

- **Review judgement calls** (user's /code-review of `feat/live-view`, 2026-11-27): one model helper for the message
  key, "what a control sends", the encoder half and slot names. Done from that review: `d26800d`, `c760681`, `809ab0e`
  (Ignore rename, 0008 decision 29); 0008 step 13, the check always reachable (`7766162`, decision 30).
- **0008 steps 14–16 done** (`a1b9589`, `edcc82a`, `e15f082`; decisions 31–34). Left from step 15: a 1024 px browser
  run of the dialog (long "change … instead" lines, a long panel label); "ch 1" wraps before the 1 in dialog rows
  (keep it together in the UI, not in the model text the tests read).
- **0008 steps 17–18 done** (`ceca4c7`, `530b1c1`, decision 35); step 19 (headings, Actions column, factory fold) done (`5ff76d5`).
  Later: idea C, ghost labels on the device view and a docked side panel.
- **Later, own plan:** a warning level setting ("hard" turns warnings into errors; user, 2026-11-27).

- **Fixes from the user's /code-review of `feat/live-view`** (2026-11-27) as 0008 steps 20 (uc4-ui) and 21
  (uc4-model), in work; then a retro, then the PR on the user's word. Architect part done: `src/live/` in CLAUDE.md
  and the layer chain; the unasked-for bits kept as 0008 decision 37 ([Map] on the next-to-map row too).
  Judgement calls for later: `live/session.ts` (579-line closure) and `storage/library.ts` (1547 lines) splits;
  `FakeInput` duplicated in devMidi and tests; shared button CSS.

## Waiting for the user

- **0008:** Ignore and check-line checks by hand (status-bar ✓ item opens the dialog, ignore, reload, the Ignored toggle, `PrGC` widen re-opens, "Send anyway" wording); the hands-on review and the listen-only hardware list; Connect from the dump guide on the real UC4.
- **Look and size checks:** light theme and 1024 px of the Connections column, the guide, Copy / Paste flash,
  Reset all; light theme `--border` `#b9b9b3` on white is 1.97:1 (below 3:1 for field edges; a token pass).
- **Hardware look list** (look only): what the display shows on entering edit mode and whether a value falls back
  to the group name; small or big `c`/`o` in `Acc3`, `Enc1`, `notE`, `toGL`; whether 3-character codes sit left or
  right; how edit mode is entered and which group it edits; which controls the Global labels belong to; unplug
  while a dump notice waits.
- **Next dump session:** confirm the Edit LED / how edit mode is entered (`uc4-device.md` says "to confirm").
- **0011:** Q47 (commit email), step 3's book icon. **0009:** the read-through, hosting, lines over 100 columns.
- **Faderfox mail draft** (0001 decision 14): no small `u` on the display (suggest one for `v`); manual corrections
  (green buttons have no `OFF`; SE18 group 6 is channel 13; push buttons have no display); the push display
  nibble; whether the dump format stays stable across firmware; whether a public editor is welcome.

## For builders, when their area comes up

- **uc4-protocol:** `uc4-sysex.md` stale in §1:57, §9 rows 256/257/260, §9b:285; `tests/protocol/markOLikely.ts`
  mutates the shared profile (use `createEngine` with a modified profile, as `guard.test.ts` does); split the
  "Shift aborts." note out of `sendSteps` into its own field. [needs-triage] a later engine re-reads dumps kept as
  unreadable (0005 decision 10).
- **uc4-ui:** in the Send guide shot, callout 2 covers fader labels 1–3 and callout 1 the numbers of faders 7–8
  (`device-send.png`); a non-JSON file on Import should say what Import reads.

## Known issues

- [needs-triage] Dumps list (user, 2026-11-16): a received dump with the same bytes as a kept one
  shows the kept one's date ("the timestamp seemed wrong"), and the user then exported an older dump
  by mistake. Say "same as the dump of <date>" in the notice and the list. Also: the Export menu and
  the Dumps list's Export share a name; the user saved a setup JSON when a `.syx` was meant. For 0006
  checklist item 13, with milestone 3.
- [needs-triage] A duplicate *file* import doesn't say "same as the dump of …" yet (small).
- [needs-triage] Layer purity by lint: an ESLint rule banning DOM globals and app/midi imports in
  `src/protocol` and `src/model` (reviewer idea). Own small step, likely with 0004.
- `npm audit`: moderate deepmerge (via vite-plugin-svelte, no fix) and a minimatch DoS in the
  typescript-eslint chain. Dev-only; check again on the next dependency update.

## Decisions

Decided by the user and still governing future work: see 0001 "Decisions" (2026-11-13).
