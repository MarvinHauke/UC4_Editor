# 0008 — Live view: values from the controller

_Stage: decided 2026-11-26 (spec below, decisions 3–22, steps 1–8); in work. Proposed by the user 2026-11-15._
_Owner: uc4-ui (view), uc4-protocol (MIDI input and matching) · Depends on: 0005 step 1, 0006_

## Problem

When the user moves a fader, turns an encoder or presses a button on the UC4, the editor shows
nothing. The user can't see which control sent what, can't check on the device that a setup does
what the editor says, and the device trainer (0006, ideas) can only check a task through a full
`Sndc` dump.

## Design

Spec written 2026-11-26 (`/to-spec`) from decisions 3–22. Listen only: nothing in this plan sends to the UC4.

### Problem statement

When the user moves a control on the UC4 or turns a knob on a synth, the editor shows nothing. The user can't see
which control sent what, can't tell which group the UC4 is on (it sends nothing on a group change), and has to type
an instrument's channel and number into a control by hand. Two controls that send the same message are not
pointed out.

### Solution

A **MIDI monitor** at the bottom of Connections lists what arrives, one row per message key, its value updating in
place. Messages from the UC4 are **matched** to their controls, ranked by the open setup and its two group
selections; the device view shows live values, offers to switch to the group the UC4 seems to be on, and lets the
user **pin** the right match. Every row has **Map**: arm it, then click a control or move it on the UC4 (**Map by
touch**), and that control sends the row's message. The validator gives **warnings** for collisions; Send asks
before it sends them, and the accepted ones are **waived**.

### User stories

1. As a UC4 owner, I want a MIDI monitor at the bottom of Connections, so that I see what my controllers send.
2. As a UC4 owner, I want one row per control (type, channel, number) whose value updates in place, so that the list
   stays short while I move things.
3. As a UC4 owner, I want new message keys on top and the last-moved row marked, so that I find what I just touched.
4. As a UC4 owner, I want the monitor to say that it listens, or why it doesn't, so that silence is never a mystery.
5. As a UC4 owner, I want to choose "All inputs" or one input, remembered in the browser, so that a noisy device can
   be left out.
6. As a UC4 owner, I want rows from the UC4 marked as such, so that I can tell them from my synth's.
7. As a UC4 owner, I want MIDI clock and active sensing left out, with a quiet "MIDI clock ignored", so that a
   running DAW doesn't flood the list.
8. As a UC4 owner, I want a `CCAh` pair and a note's press and release as one row each, so that one control is one
   row.
9. As a UC4 owner, I want to split such a pair into its single messages for the rest of the tab's life, so that I
   can see the raw messages when I need them.
10. As a UC4 owner, I want raw values (0–127, 0–16383, "on 127 / off 0") and "+1"/"−1" for relative encoders, so
    that I read what was really sent.
11. As a UC4 owner, I want to resize the monitor to many rows with a scrollbar, so that I can collect a synth's
    parameters first and map them one after another.
12. As a UC4 owner, I want to shrink the monitor to one line showing the last message with its match, so that it
    stays out of the way; the Connections column stays foldable.
13. As a UC4 owner, I want a Clear button, so that I can start a fresh collection.
14. As a UC4 owner, I want a UC4 row to name its control ("FAd3 · FG2"), so that I know what I moved.
15. As a UC4 owner, I want the matched control lit in the device view, so that I see it on the drawn UC4.
16. As a UC4 owner, I want faders to move, encoders to show a ring and button presses to light up, so that the
    device view mirrors the UC4.
17. As a UC4 owner, I want controls to stay "unknown" until they first send, so that the editor never invents a
    position.
18. As a UC4 owner, I want matches in the open setup and its two group selections ranked first, then the other
    groups, then the other setups, so that the likeliest control wins.
19. As a UC4 owner, I want "+2" on a row with more matches and the list behind it, so that I see the alternatives.
20. As a UC4 owner, I want to pin the right match for a row until the open setup changes, so that ambiguity is
    settled once.
21. As a UC4 owner, I want clicking a UC4 row to select its control, so that I can edit what I just moved.
22. As a UC4 owner, I want an offer "The UC4 seems to be on encoder group 3 — switch?" after 3 messages in a row
    that match only another group or setup, so that the editor follows the device without guessing on its own.
23. As a UC4 owner, I want "switch" to change the group selections as one undo step, so that I can take it back.
24. As a UC4 owner, I want a "don't ask again" box on the offer that holds until the tab closes, so that it stops
    nagging during a mapping session.
25. As a UC4 owner, I want a Map button on every row, so that a message becomes a control's command.
26. As a UC4 owner, I want Map to stay armed until I click a control, press Esc, press Map again or click empty
    space, so that I can cancel.
27. As a UC4 owner, I want controls that can't send the message dimmed and the reason in the help line, so that I
    see beforehand where it fits.
28. As a UC4 owner, I want the mapping to set only type, channel and number and keep mode, lower, upper and display
    scale, so that my other settings survive.
29. As a UC4 owner, I want a control's current type kept when it already sends that kind of message, so that an
    encoder I set to `CCr1` stays relative.
30. As a UC4 owner, I want CC → `CCAb`/`CC`, note → `notE`, program change → `PrGC`, pitch bend → `Pbnd`,
    aftertouch → `AFtt` otherwise, so that the type follows the message.
31. As a UC4 owner, I want an optional Settings switch (section Connections, off by default) that spots
    `CCr1`/`CCr2` from the values seen, named in the result line, so that relative encoders map right when I want.
32. As a UC4 owner, I want each mapping as one undo step with a result line ("FAd3 · FG2 now sends CC 74 ch 2 ·
    Undo"), so that a wrong click costs nothing.
33. As a UC4 owner, I want to move a control on the UC4 while Map is armed (Map by touch), so that I map without
    looking for it on screen.
34. As a UC4 owner, I want Map by touch to switch the editor to the touched control's group in the same undo step,
    so that I see where it went.
35. As a UC4 owner, I want UC4 rows mappable too, so that an encoder's CC can go on a push button that resets it.
36. As a UC4 owner, I want the property panel opened with Upper focused after mapping a CC onto a button, so that I
    set the reset value at once.
37. As a UC4 owner, I want a mapped row to show its target and the next unmapped row marked, so that I work through
    a collected list.
38. As a UC4 owner, I want a mapping that duplicates another control's message to go through and say "also sent by
    Enc3 · EG1", so that intended doubles are allowed.
39. As a UC4 owner, I want a warning when two controls of one setup that can play at the same time send the same
    message, so that accidental doubles are found.
40. As a UC4 owner, I want warnings in the problem list after the problems and a marker on the control, so that
    there is one place to look.
41. As a UC4 owner, I want the Send dialog to list warnings and offer "Send anyway", so that I decide before the
    device changes.
42. As a UC4 owner, I want accepted warnings waived and hidden, "Show waived" to bring them back, so that they don't
    nag on every send.
43. As a UC4 owner, I want a waiver to lapse when either control's message changes, so that a new double is not
    hidden by an old acceptance.
44. As a UC4 owner, I want export to mention warnings ("2 warnings") without asking, so that files are never
    blocked.
45. As a UC4 owner, I want waivers kept in the browser and never in my `.json` or `.syx` files, so that my files
    stay clean.
46. As a UC4 owner, I want nothing sent to the UC4 by any of this, so that listening is always safe.

### Implementation decisions

- **Live module (new, pure TypeScript on the model, uc4-protocol).** One deep module, a *live session*. In: channel
  messages with their input id and whether that input is the UC4, the time, the open configuration with the open
  setup and its two group selections, and the session options (pairs split, relative spotting, "don't ask again").
  Out: the monitor rows (key, value, last-moved, pair joined or split, matches ranked), the switch offer, and for
  Map a planned edit or a refusal reason per control (for dimming). It never imports Web MIDI, the DOM or Svelte.
  Matching follows the device's rules: a control's message is its type, channel and number; `CCAh` is CC n and n+32;
  `notE` press is note-on with the upper value, release a note-off with the lower; relative encoders send 1/127
  (`CCr1`) or 63/65 (`CCr2`).
- **Ranking**: open setup and its group selections, then the setup's other groups, then other setups (decision 4).
  A pin overrides the ranking for its key until the open setup changes (decision 5). Evidence: 3 messages in a row
  matching only another group or setup give one offer; "no" holds for that target until the open setup changes
  (decisions 6, 10).
- **Map plan**: channel, number and the kind of message from the row; the target's mode, lower, upper and display
  scale stay; the current type stays when it already sends that kind, else the table of decision 8; `CCAh` never
  by itself; relative spotting only with the switch on; the type change goes through the model's `changeType`.
  Kinds that can't send the message are refused with a sentence for the help line (faders and encoders no notes,
  buttons no pitch bend). The plan is an ordinary library edit (one undo step); with Map by touch the group
  switch is part of the same step.
- **MIDI connection (uc4-protocol)**: lists every input (id, name, whether it is the UC4) with plug and unplug, and
  delivers channel messages from the chosen inputs; real-time messages are dropped and counted (for the "clock
  ignored" note); SysEx stays on the existing dump path. No new browser permission: the access granted for the UC4
  covers the other inputs.
- **Warnings (uc4-model)**: the validator gains a warnings check beside `validate`, which keeps returning problems
  only, so existing callers don't change. A warning names its setup, the two controls' paths and the message key.
  Collision rule (decision 7): same setup, same message, and the two controls can play together: an encoder-group
  control against a fader/button-group control in any groups, or two controls of the same group. No
  `schemaVersion` change.
- **Waivers (uc4-model, storage)**: kept in the library in the browser, keyed by setup id, the two control paths and
  the message key; a waiver whose key no longer matches either control lapses. Never written to `.json` or `.syx`
  exports, not read from imports.
- **Send and export (uc4-ui with uc4-model)**: the Send dialog lists unwaived warnings; "Send anyway" waives them
  and sends. Export shows a quiet "n warnings" link. Problems keep blocking as today.
- **UI (uc4-ui)**: monitor at the bottom of Connections, resizable (drag) with a scrollbar, down to one line;
  Clear; input picker; Map per row; dimming and help-line reasons while armed; result line with Undo; the switch
  offer with its checkbox; live values in the device view; warning marker on controls and in the problem list with
  "Show waived"; Settings section **Connections** with the relative-spotting switch. Session state (split pairs,
  "don't ask again") lives in session storage: it survives a reload and ends with the tab (decision 15). Rows are
  not saved.

### Testing decisions

- Good tests go through the module's public interface and check what the user would see (a row, a match, an offer,
  a planned edit or refusal), never internal state.
- **Live module**: the main seam. Message sequences in, rows, rankings, offers and map plans out; factory setups
  from `factorySetup` and setups with deliberate doubles as inputs. Covers pairs (`CCAh`, `notE`, split), relative
  values, the three ranking tiers, pins, evidence (3 in a row, "no" holds), every row of the type table, kept types,
  refusals per kind, `CCAh` never chosen. Prior art: the engine's fixture-driven tests and `tests/app` pure logic
  tests (`copyPaste`, `sendFlow`).
- **Validator warnings**: factory SE01–SE16 give exactly the 8 EG4/FG1 collisions (CC 32–39) each, SE17 and SE18
  exactly 2 each (the factory layout collides by design, `uc4-device.md`); a double inside one group, across the two halves, and in
  two groups of one half (no warning). Prior art: `tests/model/editing.test.ts`, the validator tests.
- **MIDI connection**: with `fakeMidi`: input list with plug/unplug, chosen inputs only, real-time dropped, SysEx
  still on the dump path. Prior art: `tests/midi/connection.test.ts`.
- **Library waivers**: stored, survive reload, lapse on a changed message, absent from exports. Prior art:
  `tests/storage/library.test.ts`.
- **Browser** (architect, MIDI stub): monitor rows, resize, Map with click and dimming, undo, Send dialog warnings.
  **Hardware list** (user, listen only): moving controls lights them, Map by touch, the switch offer.

### Out of scope

DAW feedback and the ARS rig (decision 16, later step), Learn (decision 9), check mode and the trainer (decision
19), CC tables (plan 0013), any sending to the UC4 or to other devices, NRPN, recording or playback.

### Further notes

Facts the design rests on: the listen check (2026-11-16, below); the type lists per kind in
`docs/reference/uc4-device.md`. The earlier draft ideas (check mode, trainer) stay as later steps.

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
   **The message key includes the input** (architect, 2026-11-26, from step 1's review): the same CC from the UC4
   and from a synth are two rows, so a row always has one source for matching and Map. Why: one shared row would
   show the latest sender only and mix a UC4 match with a synth's message.
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
   **Message key** (architect, 2026-11-26, from the step 1/5 review): one message kind for the model and the live
   module, with the wire names `cc`, `note`, `program`, `pitchBend`, `aftertouch`, `polyAftertouch`; a key is kind,
   channel and number. A control can send several keys (`CCAh`: n and n+32). Pitch bend and aftertouch have no
   number and collide by channel. **Program change collides by program**: a button's program is its upper value,
   an encoder's or fader's the range lower…upper; two `PrGC` controls on one channel collide only where their
   programs overlap. Why: scene buttons on one channel with different programs are a normal layout, not a mistake.
   **Factory collisions** (uc4-model, confirmed against `uc4-device.md`): the factory layout itself collides,
   EG4 encoders and FG1 faders on CC 32–39 in SE01–SE16, and 2 note pairs each in SE17/SE18. How these show is
   the user's call (open, before step 6).
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
   **Exceptions** (architect, 2026-11-26, from the step 7/8 review): a **program change row** onto a button also sets
   Upper to the row's program (the button's program is its Upper); onto an encoder or fader the range Lower…Upper
   stays (browsing programs is the point) and the result line names it ("Enc3 · EG1 now sends programs 0–127 ch 2").
   **Map by touch on another setup** is allowed: the touch is the strongest evidence, so opening that setup, the
   group switch and the edit are one undo step, and the result line names the setup ("SE02 · Enc1 · EG3 now sends
   …"); pins clear as on any setup change.
9. **"Map" now, "Learn" later** (user, 2026-11-26, Q1): Learn is a later quick mode that maps each new message to
   the next control slot, from any input, not only the UC4. The UC4's own learn (hold encoder 6) is the device's.
10. **The switch offer can be silenced** (user, 2026-11-26, Q11): after 3 messages in a row that match only another
   group or setup; the offer has a checkbox "don't ask again" that holds for the session.
11. **Monitor size** (user, 2026-11-26, Q12, R3): about 8 rows by default, resizable by dragging to show more and
   with a vertical scrollbar, so a synth's parameters can be collected first and mapped one after another; newest
   key on top, Clear; it can be shrunk to one line at the bottom; the Connections column stays foldable. Rows are
   not saved.
12. **Pairs as one row, unchainable** (user, 2026-11-26, Q13): a `CCAh` pair (CC n and n+32) is one row with a
   14-bit value, a `notE` press and release one row; a pair can be split into its single messages, and the
   monitor remembers the split for the session.
13. **Code and order** (user, 2026-11-26, Q14): matching, ranking, the evidence check and the mapping table in a new
   `src/live/` (pure TypeScript on the model, uc4-protocol); the monitor's input in `src/midi/`; warnings in the
   validator (uc4-model); the UI with uc4-ui. Steps: monitor and input picker → matching, highlight, pinning →
   warnings → Map → the switch offer; live values in the device view (Design, "Live view in the device view") are
   part of the matching step.

14. **Spotting relative modes is a Settings switch, off by default** (user, R2-Q4); the result line names the
   choice ("as `CCr1`: only 1/127 seen"). It sits in a Settings section named **Connections** (user, R3-Q6);
   Settings keeps clear, separate sections.
15. **Session = until the tab closes** (user, R2-Q5): "don't ask again" and split pairs survive a reload and end
   with the tab.
16. **DAW feedback is a later step** (user, R2-Q6): a second input (an IAC bus the DAW copies to) whose values the
   device view shows; the same step serves the ARS test rig (brief below), so the editor can be the rig for
   developing Remote Scripts with the remote-script MCP. Version 1 shows the UC4's own messages.
17. **After mapping a CC onto a button** (user, R2-Q7): the property panel opens on it with Upper focused (the
   value the press sends); any other mapping just selects the control.
18. **The one-line monitor** (user, R2-Q8) shows the last message with its match and keeps Map.

19. **Grilling round 3** (user, 2026-11-26): the active setup and groups are the editor's open setup and its two
   group selections, and "switch" changes them as one undoable step (R3-Q1). **Selection steps** (architect, 2026-11-26, from the step 4 review): the library's undo history gets entries that hold a selection change, so Switch is one Cmd-Z, and Map by touch puts the selection change and the edit into one entry; plain group clicks stay out of the history. The "Switched to … · Back" note stays as a shortcut that calls undo; MIDI clock, active sensing and other
   real-time messages are not listed, a quiet note says "MIDI clock ignored", SysEx stays with the dump flow
   (R3-Q2); check mode and the trainer come later, version 1 is monitor, matching, live values, warnings, Map and
   the switch offer (R3-Q3); the ARS rig's points are grilled with the DAW-feedback step (R3-Q5); the input
   picker starts on "All inputs" and remembers the choice in the browser (R3-Q7); a row shows the raw value, 14-bit
   pairs 0–16383, notes "on 127 / off 0", and "+1"/"−1" for a relative encoder match (R3-Q8).

20. **Map by touch** (user, grilling round 4, 2026-11-26, R4-Q1–Q4): while Map is armed, a message from the UC4
   picks the target instead of a click: the device view jumps to its match (best or pinned) and the mapping is
   made the same way. Both ways follow one rule: channel, number and the kind of message come from the monitor
   row; mode, lower, upper and display scale stay the target's; the control's current type stays when it already
   sends that kind of message (an encoder on `CCr1` that gets a synth's CC stays `CCr1`), otherwise decision 8's
   table. A touched control in a group not active in the editor switches the editor to that group, in the same
   undo step as the mapping. A mapped row shows its target ("→ Enc3 · EG1"), and after a mapping the next unmapped
   row is marked, so Map and a touch continue the list; auto-advance stays with Learn (decision 9). Why "by
   touch", not "smart learn": Learn is the later quick mode.
21. **CC tables are plan 0013** (user, R4-Q5–Q7): version 1 of 0008 shows raw messages. 0013 fetches a CC table on
   demand, never bundled (CC BY-SA data, credited in Settings → About and the monitor), suggests one from the port
   name and lets the user pick from a list.

22. **Other devices** (user, R4-Q8): any MIDI device besides the UC4 is an *other device*: an *instrument* (a
   synth, drum machine or effect, which may have a CC table) or a *third-party controller*. "Device" alone stays
   the UC4.

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

Grilled in four rounds with the user; answers in decisions 7–22. Open for the steps that come later: the ARS rig
(brief above) and DAW feedback (decision 16), check mode and the trainer (decision 19).

## Steps

Cut 2026-11-26 (`/to-tickets`, approved by the user). Tracer bullets; each names who builds it and what gates it.

1. **Monitor, first rows** — done 2026-11-26: uc4-protocol (`2101d1b`), uc4-ui (`624ec19`, browser-checked by the architect on `/?midi=fake`; the blocked-MIDI state and the hardware list left for the user) · blocked by: none ·
   the connection lists every input with plug and unplug and delivers channel messages of the chosen inputs,
   real-time dropped and counted; the live module turns messages into rows (one per key, value in place, newest on
   top, last-moved marked); the monitor at the bottom of Connections with the input picker ("All inputs",
   remembered), Clear, "Listening…" or why not, "MIDI clock ignored". Stories 1–7, 13. Checks: connection tests with
   `fakeMidi`, live-module tests, browser list with a MIDI stub.
2. **Matching and live values** — done 2026-11-26: uc4-protocol (`66dfa17`), uc4-ui (`931d9f6`, browser-checked by the architect: match line, +1 list, pin ◆, row click switches groups without an undo step, ring and button fill; the relative tick and the PrGC pulse left for the user) · blocked by: 1 · UC4 rows name their match, ranked in
   three tiers, "+n" with the list, pins, a click on a UC4 row selects its control; the device view lights the
   match and shows live values (fader, ring, press), "unknown" until first sent. Stories 14–21. Hardware list.
3. **Pairs, values and monitor size** — done 2026-11-26: uc4-protocol (`ba09253`; a note's press and release are one row for every input, a `CCAh` pair only when it matches), uc4-ui (`841cf2a`, browser-checked by the architect: split/join, one line, height kept; row actions as small icon buttons on line 1, architect) · blocked by: 2 · `CCAh` pair and `notE` press and
   release as one row, split for the tab's life; values 0–16383, "on/off", "+1/−1"; resize with a scrollbar, one
   line. Stories 8–12.
4. **Switch offer** — done 2026-11-26: uc4-protocol (`218308d`; a message that matches several other groups is no evidence), uc4-model (selection steps `8962e47`), uc4-ui (offer under the monitor heading or in the status bar, Switch one undo step, Back = undo; browser-checked by the architect) · blocked by: 2 · 3 in a row → offer; switch as one undo step; "no"
   holds; "don't ask again" until the tab closes. Stories 22–24.
5. **Warnings in the validator** — done 2026-11-26: uc4-model (`8da5b93`), uc4-ui (`5977db3`, orange `--warn`, stepper in the status bar; browser-checked by the architect) · blocked by: none · the collision check beside `validate`
   (same group, or across the two halves; factory SE01–SE16 give 8 each, SE17/18 2 each), warnings in the problem list after the
   problems, a marker on the control. Stories 39–40.
6. **Waivers, Send and export** — uc4-model, then uc4-ui · blocked by: 5 · Send dialog lists warnings, "Send
   anyway" waives; waivers in the library, lapse on a changed message, never in files; "Show waived"; export says
   "n warnings". Stories 41–45.
7. **Map by click** — done 2026-11-26: uc4-protocol (`b2811df`), uc4-model (`setControl` `1e9fd47`), uc4-ui (`1be40dd`, glyphs `73cea31`, marks `cefddff`; browser-checked by the architect: dimming, result line, Upper focused, "already sends", Esc, header Undo clears the mark) · blocked by: 1, 5 · Map per row, armed state, dimming
   with the reason in the help line, one undo step with a result line, the type rule, Settings section Connections
   with the relative switch, Upper focused after a CC onto a button, the mapped row's target and the next row
   marked, "also sent by". Stories 25–32, 35–38.
8. **Map by touch** — done 2026-11-26 (`b2811df`, `1be40dd`; browser-checked: switch to EG3 and mapping in one undo step) · blocked by: 2, 7 · a UC4 message picks the target while Map is
   armed; the group switch in the same undo step. Stories 33–34.

## Out of scope

- Sending anything to the UC4 (LEDs, display, values).
- Recording or playing back controller movements.
- Values the DAW sends to the UC4.
