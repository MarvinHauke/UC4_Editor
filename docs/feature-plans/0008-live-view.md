# 0008 — Live view: values from the controller

_Stage: draft — proposed by the user 2026-11-15, extended by monitor and learn; grill when milestone 2 is built._
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

## Open questions

Hints from the UC4 Configurator, not evidence ([other editors](../reference/other-uc4-editors.md), item 4): it
matches by channel and number and switches group on a match elsewhere, so the UC4 probably
sends nothing on a group change; it also has a **learn** mode worth grilling.

1. **Does the UC4 send anything when the setup or a group changes?** Check: `receivemidi` in a
   visible pane while the user switches setup, encoder group and fader/button group. Recommended:
   if it sends, the app follows the device; if not, the user picks the active setup and groups
   in the app, and the app suggests a switch when messages match another group better.
2. **Two controls with the same message** in the active groups: mark both, or the first?
   Recommended: mark both, with a hint in the problem list (0006) that they collide.
3. **Where the matching lives**: `src/protocol/` (MIDI meaning of a command) or `src/live/`.
   Recommended: a small `src/live/` module that uses the model only; the protocol engine stays
   SysEx-only.
4. **Push buttons and Shift layers**: does the UC4 send the push of encoder n and Shift
   combinations as their own commands? Check in the same listen session as question 1.
5. **Note-type commands** (velocity, note off as note on with 0): which forms does the UC4 send?
   Same listen session.
6. **What the DAW sends back to the UC4** (LED feedback) is not visible to the browser. Show
   nothing, or let the user route a copy (`routemidi`) to a second input? Recommended: show
   nothing in the first version.

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

## Steps

Written by `/to-tickets` after grilling.

## Out of scope

- Sending anything to the UC4 (LEDs, display, values).
- Recording or playing back controller movements.
- Values the DAW sends to the UC4.
