# 0008 — Live view: values from the controller

_Stage: draft, to grill — proposed by the user 2026-11-15, extended by monitor and learn; monitor, matching and warnings shaped by the user 2026-11-26 (decisions 3–7)._
_Owner: uc4-ui (view), uc4-protocol (MIDI input and matching) · Depends on: 0005 step 1, 0006_

## Problem

When the user moves a fader, turns an encoder or presses a button on the UC4, the editor shows
nothing. The user can't see which control sent what, can't check on the device that a setup does
what the editor says, and the device trainer (0006, ideas) can only check a task through a full
`Sndc` dump.

## Design

Listen only (CLAUDE.md, "Hardware safety"): the app opens the UC4's MIDI input and never sends.

- **Matching**: every incoming message (channel, type, number, value) is looked up in the
  **active setup** of the library with its two **active groups**. The match names the control
  ("fader 3, fader/button group 2"). This is pure logic in `src/protocol/` or a new `src/live/`
  (decided in grilling), with unit tests on the 0002 model; no Web MIDI in it.
- **Device view**: the matched control shows its live value: fader position, encoder value as a
  ring, button pressed/released. A short monitor line under the panel lists the last messages
  ("fader 3 → CC 12 ch 1 = 87"); a message no control matches shows as "unmatched".
- **Unknown until moved**: the UC4 sends only when a control moves, so every control starts as
  "unknown" and gets a value at its first message.
- **Relative encoder modes** (`CCr1`…): only the movement is shown (a tick up or down), no
  position. Absolute modes (`CCAh`, …) show the value.
- **Check mode** (uses the same matching): the user moves each control once and the app marks
  those whose message differs from what the editor's setup says. Finds a device setup that
  differs from the library one without a dump.
- **Trainer**: tasks of the form "turn encoder 3 in encoder group 2" or "set `btn3` to `toGL`,
  then press it twice" can be checked live from the messages; tasks that change properties
  keep the `Sndc` dump diff (0006, ideas). A round can mix both.

- **MIDI monitor and learn** (user, 2026-11-15, 0005 grilling R-1): the monitor lists messages from
  every connected input, not only the UC4. **Learn**: with a control in edit mode, the next channel
  message of another device sets the control's command type, channel and number (CC → `CCAb`, note
  → `notE`, program change → `PrGC`, pitch bend → `Pbnd`, aftertouch → `AFtt`), so the UC4 then
  controls that parameter. Undoable like any edit. SysEx from the UC4 stays the dump flow (0005);
  learn reads channel messages only, so the two don't collide.
- **Live view in the device view** (user, 2026-11-15, 0006 decision 21 and UI-6): with no control
  selected, the device view shows what the UC4 sends; a message from the UC4 leaves edit mode.
  Faders move, encoders show their value as a ring, button presses and LEDs light up. LED states
  the DAW sets are not visible to the browser (see Problem); shown are the UC4's own messages.

## Decisions

1. Listen only. Nothing is sent to the UC4 by this feature; lighting LEDs or writing the
   display from the app would be a separate plan behind the send rules (user, 2026-11-15).
2. No new dependency: Web MIDI in Chromium, the same access as 0005 step 1 (architect,
   2026-11-15).
3. **The MIDI monitor sits at the bottom of the Connections column and works like cmdAbl's `midi monitor`**
   (user, 2026-11-26): one row per message key (type, channel, number); a new key adds a row on top, after that
   only its value changes in place, and the row that moved last is marked. It says that it listens, or why it
   stopped. An input picker: "All inputs" or one input; rows from the UC4's port carry a UC4 mark. An output
   picker comes later (sending is its own decision, decision 1). Why: a log of every value buries the controls;
   one row per control is what learn and matching need.
4. **A message from the UC4 is matched to its controls and ranked by context** (user, 2026-11-26): the active
   setup and its two active groups first, then the other groups of the active setup, then the other setups. The
   device view lights the best match; the row names it ("FAd3 · FG2") with "+n" for the others. Why: the UC4
   sends nothing on a setup or group change (listen check below), so the editor can only rank.
5. **Pinning** (user, 2026-11-26): on a row with several matches the user picks the control it is; the pin holds
   for that message key until the active setup changes. Why: settles what the context can't.
6. **Follow the evidence, as an offer only** (user, 2026-11-26): when messages keep matching another group (or
   setup) better than the active one, the editor offers "The UC4 seems to be on encoder group 3 — switch?". It
   never switches by itself.
7. **Collisions are warnings, not problems** (user, 2026-11-26; refined in grilling R2-Q1–Q3): the validator gives
   a **warning** when two controls of one setup send the same message (type, channel, number) and can play at the
   same time: an encoder-group control and a fader/button-group control in any groups, or two controls of the
   same group (Enc3 in EG1 and Enc3 in EG2 never play together). A warning blocks nothing, since mapping one CC
   twice can be intended. The Send dialog lists the warnings and **Send anyway** waives them; export only says
   "2 warnings" with a link. A waiver is kept in the library in the browser, never in a `.json` or `.syx` file (no
   `schemaVersion` change); the problem list hides waived warnings and "Show waived" brings them back, like a DRC
   waiver. It lapses when either control's message changes. Why: a waiver is a check before sending, not part of
   the setup; a file field would add clutter without value.
8. **Map, from a monitor row** (user, grilling 2026-11-26, Q1–Q7): every row has a **Map** button. Map arms the
   row; the next click on a control in the device view sets that control's command type, channel and number from
   the row's message, as one undo step, with a result line ("FAd3 · FG2 now sends CC 74 ch 2 · Undo"). Esc, Map
   again or a click on empty space cancels; one click maps one control. Controls whose kind can't send the message
   are dimmed and not clickable while Map is armed, and the help line says why ("Faders can't send notes").
   Type per kind: CC → encoder `CCAb`, fader `CCAb`, button `CC`; note → button `notE`; program change → `PrGC`;
   pitch bend → encoder or fader `Pbnd`; aftertouch → `AFtt`; `CCAh` never by itself. Spotting `CCr1`/`CCr2` from
   the values seen (only 1/127, only 63/65) is an option the user turns on. Only type, channel and number change;
   mode, lower, upper and display scale stay, and the type goes through `changeType`. A mapping that makes a
   collision goes through and becomes a warning (decision 7; "also sent by Enc3 · EG1"). Rows from the UC4 can be
   mapped too (an encoder's CC on a push button that sets it back to a value); clicking a UC4 row selects its match.
   Why: a mapping is an ordinary edit with a different source; dimming shows beforehand where the message fits.
9. **"Map" now, "Learn" later** (user, 2026-11-26, Q1): Learn is a later quick mode that maps each new message to
   the next control slot, from any input, not only the UC4. The UC4's own learn (hold encoder 6) is the device's.
10. **The switch offer can be silenced** (user, 2026-11-26, Q11): after 3 messages in a row that match only another
   group or setup; the offer has a checkbox "don't ask again" that holds for the session.
11. **Monitor size** (user, 2026-11-26, Q12): about 8 rows, scrolling, newest key on top, Clear; it can be shrunk
   to one line at the bottom; the Connections column stays foldable. Rows are not saved.
12. **Pairs as one row, unchainable** (user, 2026-11-26, Q13): a `CCAh` pair (CC n and n+32) is one row with a
   14-bit value, a `notE` press and release one row; a pair can be split into its single messages, and the
   monitor remembers the split for the session.
13. **Code and order** (user, 2026-11-26, Q14): matching, ranking, the evidence check and the mapping table in a new
   `src/live/` (pure TypeScript on the model, uc4-protocol); the monitor's input in `src/midi/`; warnings in the
   validator (uc4-model); the UI with uc4-ui. Steps: monitor and input picker → matching, highlight, pinning →
   warnings → Map → the switch offer; live values in the device view (Design, "Live view in the device view") are
   part of the matching step.

14. **Spotting relative modes is a Settings switch, off by default** (user, R2-Q4); the result line names the
   choice ("as `CCr1`: only 1/127 seen"). Settings keeps clear, separate sections (a "MIDI monitor" section).
15. **Session = until the tab closes** (user, R2-Q5): "don't ask again" and split pairs survive a reload and end
   with the tab.
16. **DAW feedback is a later step** (user, R2-Q6): a second input (an IAC bus the DAW copies to) whose values the
   device view shows; the same step serves the ARS test rig (brief below), so the editor can be the rig for
   developing Remote Scripts with the remote-script MCP. Version 1 shows the UC4's own messages.
17. **After mapping a CC onto a button** (user, R2-Q7): the property panel opens on it with Upper focused (the
   value the press sends); any other mapping just selects the control.
18. **The one-line monitor** (user, R2-Q8) shows the last message with its match and keeps Map.

## Open questions

Hints from the UC4 Configurator, not evidence ([other editors](../reference/other-uc4-editors.md), item 4): it
matches by channel and number and switches group on a match elsewhere, so the UC4 probably
sends nothing on a group change; it also has a **learn** mode worth grilling.

1. **Does the UC4 send anything when the setup or a group changes?** Check: `receivemidi` in a
   visible pane while the user switches setup, encoder group and fader/button group. Recommended:
   if it sends, the app follows the device; if not, the user picks the active setup and groups
   in the app, and the app suggests a switch when messages match another group better.
2. ~~Two controls with the same message~~ — answered by decisions 4 and 7: both light up, ranked; a warning,
   waivable.
3. ~~Where the matching lives~~ — answered by decision 13: `src/live/`.
4. **Push buttons and Shift layers**: does the UC4 send the push of encoder n and Shift
   combinations as their own commands? Check in the same listen session as question 1.
5. **Note-type commands** (velocity, note off as note on with 0): which forms does the UC4 send?
   Same listen session.
6. ~~What the DAW sends back~~ — answered by decision 16: a later step with a second input.

**Listen check, 2026-11-16** (`receivemidi` in a visible pane, listen only; log
`dumps/listen/2026-11-16-listen.txt`; SE16 with the combined-dump changes, groups 1/1 then fader/button group 8):

- **Q1 answered: the UC4 sends nothing** when the setup, the encoder group or the fader/button group
  changes (setup SE16→SE15→SE16, Shift + encoder 2/1, Shift + green button 2/1: no message). So the
  recommended answer holds: the user picks the active setup and groups in the app; the app suggests a
  switch when messages match another group better.
- **Q4 answered:** the push button of encoder 1 sends its own command (`Pbt1` g1: note 0, on 127 /
  off 0). Shift + turning an encoder or moving a fader sends the **same** command as without Shift
  (CC 8 and CC 32 on ch 16, finer steps). Shift + green button selects the fader/button group and
  sends nothing (step 10, the group was already 1).
- **Q5 answered:** a `notE` button sends note-on with the upper value (127) on press and a real
  note-off with the lower value (0) on release (`btn1` g1 = note 64; held 2 s → off 2.2 s later).
  `toGL` (`btn8` fg8, note 127): first press note-on 127, second press note-off 0.
- Absolute encoder `CCAb` `Acc3`: values 1…19 and back to 0 (CC 8). Fader `CCAb`: full 0…127 both ways.
- To look at (user): pressing `btn1` in fader/button group 8 lit LEDs 1 **and** 2. Which LED shows
  the button, which the group? Look list.

### Brief: play a Remote Script through the ARS test rig (2026-11-18, to grill)

From the ableton-remote-script-mcp session (its plan 0002, decision 24), agreed with the user there; nothing is
built in this repo by that session. `rig serve` holds a virtual MIDI port "ARS Test Rig" that Live uses as a Control
Surface; `rig panel <script>` serves `ws://127.0.0.1:9879/ws` (protocol 1, `docs/rig-panel-protocol.md` in that repo;
localhost origins only). Frames: a `model` frame first (check `protocol == 1`), replayed last values, then `midi`
events (`dir` "in" = Live → controller: LEDs, values; "out" = played into Live by `panel` or `driver`); play with
`{"op":"send","message":[…]}` the exact bytes the UC4 sends in the active setup (buttons: press then release;
`CCr1`: 1 up, 127 down, tested in Live 12.4.16). Nothing reaches the UC4 hardware. Observed: Live answers a press with
a 0/127 pair, then the settled value about 40 ms later (show the last); values come back only on change.
Gives: a playable device view for Live, LED and value feedback the browser can't get from the UC4, a test of the
script against the setup's real messages. To grill:
1. A source switch in the device view: UC4 over Web MIDI (listen only) or the test rig (play and listen).
2. Sending into Live is new for the editor: its own decision, and the UI note that an automated check run may play too.
3. Which setup and groups apply (the script expects SE17; the rig can't know the UC4's active group).
4. Relative modes other than `CCr1` are untested.

### Grilled (2026-11-26)

Questions 1–8 of the first list answered in decisions 7–18.

## Steps

Written by `/to-tickets` after grilling.

## Out of scope

- Sending anything to the UC4 (LEDs, display, values).
- Recording or playing back controller movements.
- Values the DAW sends to the UC4.
