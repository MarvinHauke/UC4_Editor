# 0005 — Web MIDI transfer

_Status: **milestone 2 built** (steps 1–4, 2026-11-15): the editor receives `Sndc`/`SndA` from the UC4 and imports `.syx` files; listen only. Send (milestone 4) decided 2026-11-18 (decisions 20–27), steps 11–13._
_Owner: uc4-protocol (connection), uc4-model (library), uc4-ui (chip, notice) · Depends on: 0004, 0006_

## Problem

The user wants to read setups from the UC4 and send them back without a separate SysEx tool.

## Design

- `navigator.requestMIDIAccess({ sysex: true })` on a user action, in a secure context (localhost or
  HTTPS), Chromium. Denied or unsupported → a message that says what to do; the rest of the app
  keeps working (files still work).
- Port detection by name (the UC4's USB port name — to be noted from the device), with a manual
  choice when several match. React to plug/unplug (`statechange`).
- **Receive**: the user presses `Sndc`/`SndA` on the device; the app collects the SysEx messages
  until the dump is complete (length/framing from 0003), shows progress, stores the raw dump, then
  decodes.
- **Send** (milestone 4): an explicit button; the page names the setups it will overwrite and asks
  whether a fresh `SndA` backup exists (offers to receive one first). The user puts the device in
  `rEc`. The app sends in chunks with pauses (rate to be measured), to the USB port only (manual:
  never USB and MIDI at once), then asks the user to check the display (`SE..` or `Err`) and offers a
  read-back with `Sndc` and a compare.

## Spec: milestone 2 (read the device)

Written by `/to-spec` (2026-11-15) from decisions 1–8. Listen only: nothing in this milestone
sends anything to the UC4.

### Problem statement

The user's setups live on the UC4. To edit them in the editor today, the user has to capture a
dump with a separate tool and has no way to load it: the editor reads only JSON. The other way,
the user can't see what a dump holds, can't keep a device state as a rollback point, and has to
trust that an edit started from factory values matches the device.

### Solution

A **device chip** in the top bar connects the editor to the UC4 over Web MIDI on the user's click.
From then on the editor listens: when the user presses `Sndc` or `SndA` on the device, the dump
arrives, is kept unchanged with its date, and a **dump notice** says so without touching the setup
being edited. Opening the notice shows the same import dialog as a JSON or `.syx` file: a single
setup goes to its slot ("replace, or another slot?"), all 18 ask "replace the whole library?".
The import is one undo step. Values the engine can't read are marked as problems, never fixed.
A `.syx` file goes through the same path. Every kept dump can be exported as it came or used to
revert its setup.

### User stories

1. As a UC4 owner, I want to connect the editor to my UC4 with one click, so that I don't need a separate SysEx tool.
2. As a UC4 owner, I want the browser to ask for MIDI access only when I click "Connect UC4", so that opening the editor never asks for anything.
3. As a UC4 owner, I want the editor to reconnect by itself on my next visit, so that I don't click "Connect" every time.
4. As a UC4 owner, I want the chip to show "UC4: not connected / connected", so that I know whether the editor hears my device.
5. As a UC4 owner, I want the editor to find my UC4 by its port name, so that I don't choose ports by hand.
6. As a UC4 owner with several matching ports, I want to choose the port, so that the right device is used.
7. As a UC4 owner, I want unplugging and replugging to update the chip at once, so that I trust what it shows.
8. As a user of a browser without Web MIDI (or who denied access), I want a message that says what to do, so that I'm not stuck; files keep working.
9. As a UC4 owner, I want the device panel to show the steps for `Sndc` and `SndA` on the UC4, so that I don't need the manual.
10. As a UC4 owner, I want to press `Sndc` on the device at any time while connected, so that I stay at the device and don't click "Receive" first.
11. As a UC4 owner editing a setup, I want an arriving dump to show only a notice, so that my current work isn't interrupted.
12. As a UC4 owner, I want the notice to name what arrived ("SE16", "all 18 setups"), so that I know what I sent.
13. As a UC4 owner, I want to review or dismiss the notice, so that nothing changes until I decide.
14. As a UC4 owner, I want several dumps in a row to wait as notices, so that none is lost.
15. As a UC4 owner, I want a received `Sndc` to go to its slot, asking "replace, or another slot?" when the slot holds a setup, so that I choose what is replaced.
16. As a UC4 owner, I want a received `SndA` to ask "replace the whole library?", so that I never lose my library by accident.
17. As a UC4 owner, I want to undo a dump import in one step, so that a wrong import costs nothing.
18. As a UC4 owner, I want to import a `.syx` file through the same Import button and dialog, so that files and the device work alike.
19. As a UC4 owner, I want a file that is neither JSON nor a dump to be refused with what Import reads, so that I know what to do.
20. As a UC4 owner, I want a damaged dump refused with the reason and "save the dump again on the UC4", so that I can fix it.
21. As a UC4 owner, I want a value the engine can't read shown as a problem ("unreadable in the dump, factory value shown"), so that nothing is silently changed.
22. As a UC4 owner, I want a dump from unknown firmware imported with a warning, so that I can still work and know the risk.
23. As a UC4 owner, I want every received or imported dump kept unchanged with its date, so that I have a rollback point.
24. As a UC4 owner, I want to export a kept dump exactly as it came, as `.syx`, so that I have a device backup.
25. As a UC4 owner, I want to revert a setup to the dump it came from, so that I can undo a whole session of edits at once.
26. As a UC4 owner, I want to delete a kept dump only by my own choice, after a question, so that a rollback point never disappears by itself.
27. As a UC4 owner, I want the setup imported from a dump to remember that dump, so that a later `.syx` export or send keeps the bytes the editor doesn't understand.
28. As a UC4 owner, I want the name of a setup imported from a dump to be its slot (`SE16`) unless it replaces a named setup, so that I can tell where it came from.
29. As a UC4 owner, I want the help line to explain the chip, the notice and each step, so that the flow teaches itself.
30. As a UC4 owner, I want nothing ever sent to my UC4 in this milestone, so that my device is safe.

### Implementation decisions

- **New module `src/midi/`, the device connection** (owner uc4-protocol). It wraps Web MIDI and
  offers: connect on request, a state (`unsupported`, `denied`, `not-connected`, `connected` with
  the port, `choose-port` with the candidates), silent reconnect when the permission is already
  granted, plug and unplug through `statechange`, and a subscription that hands over every
  complete SysEx message from the UC4's input as bytes with its arrival time. It has **no send
  method** in this milestone. Port matching uses the device profile's port name (`Faderfox UC4`,
  seen 2026-11-15). Web MIDI access is injected, so tests use a fake.
- **Chrome delivers a SysEx message only when it is complete**, so there is no progress while
  receiving; the chip shows "connected", then the notice. (Replaces "shows progress" in the draft.)
- **The library takes dumps** (owner uc4-model): import inspection and import accept a dump's
  bytes as well as JSON text, and lead to the same results (`refused`, `whole`, `setup`,
  `needs-slot`, `slot-occupied`, `imported`). Inside, the library calls the protocol engine
  (`parse`, `decode`), which is allowed (storage → protocol). A `SndA` is a whole import, a `Sndc`
  a one-setup import into its slot. Engine refusals become `refused` with the engine's reason
  and what to do. Unreadable values and unknown firmware become problems and a message.
- **Kept dumps** (uc4-model): the library keeps a list of raw dumps (id, date, source: received
  or file, message type, slots, firmware, bytes), stored next to the library in IndexedDB, not in
  the configuration. A setup imported from a dump is linked to it. New commands: export a kept
  dump as `.syx` (the bytes unchanged), revert a setup to its dump (one undo step), delete a kept
  dump. Adding to the list is not an undo step; deleting asks first. **No change to the
  configuration's shape or `schemaVersion`**: the link and the bytes live beside it, so a JSON
  export carries neither (the `.zip` backup of 0007 carries the dump).
- **The dump notice and the device chip** (owner uc4-ui): the chip in the top bar opens a small
  device panel (Connect, port, port choice, the `Sndc`/`SndA` steps). Dumps from the connection
  queue as notices next to the status line; "Review" opens the import dialog of 0006 step 7 with
  the dump, "Dismiss" drops the notice (the dump stays kept). Import from file accepts `.syx`.
- **Layers**: UI → `src/midi` and `src/storage` → `src/protocol` → `src/model`. The UI never
  touches bytes beyond passing them on; `src/midi` knows nothing of the engine.
- **Device profile** gains the port name and the `Sndc`/`SndA` steps (texts in the device's
  words, checked against the manual).

### Testing decisions

- A good test drives a module through its public commands and checks what the user would see
  (states, results, messages), not internals.
- **Device connection**: a fake Web MIDI access (ports appearing, disappearing, SysEx arriving,
  permission denied, no Web MIDI). Checks states, port choice, silent reconnect and that dumps
  are handed over. A test asserts the module has no way to send.
- **Library with dumps**: real fixtures from `tests/fixtures/sysex/` (the factory `SndA`, a
  `Sndc` of SE16, a damaged copy) through inspection and import, kept-dump export byte-identical,
  revert as one undo step, unreadable values as problems. Prior art: the library tests of 0006
  steps 1 and 3 in `tests/storage/`.
- **UI**: pure helpers (notice queue, dialog choice) with unit tests as in `tests/app/`
  (`importFlow`). The page by the architect's browser test with a fake dump injected; the
  real device by the user's hardware test list (connect, `Sndc`, `SndA`, unplug).

### Out of scope

Sending to the UC4 (step 3, milestone 4), the full device page, compare and read-back, the MIDI
monitor, learn and live values (0008), `.syx` export of edited setups (0007 step 3), the `.zip`
backup (0007 step 4), other Faderfox devices.

### Further notes

- Seams (to confirm with the user): the device connection (`src/midi`) and the library's
  import commands. Two seams, because the connection is the only code that touches Web MIDI.
- Hint, not evidence (other editors, item 3): the Configurator's steps for `Sndc` and `rEc`.

## Decisions

1. Nothing is sent on page load, in tests or by tools (CLAUDE.md, "Hardware safety").

Grilling round 1 (user, 2026-11-15, questions R-1 to R-7):

2. **Milestone 2 = connect, receive and `.syx` import**, one flow; sending stays in milestone 4.
   A MIDI monitor and learn for other controllers go to 0008, not here.
3. **MIDI access is asked for on "Connect UC4"** only; later visits connect silently when the
   permission is already given.
4. **Always listening while connected**: a dump the user sends from the device is received at
   any time. It shows a **dump notice** that doesn't interrupt the work ("Dump received: SE16 ·
   Review · Dismiss"); nothing changes until the user opens it. Why: a dump must never break the
   setup being edited (user).
5. **One import dialog** for `.json`, `.syx` and received dumps: `Sndc` to its slot ("replace, or
   another slot?"), `SndA` "replace the whole library?"; it always asks, and the step can be undone.
6. **Every raw dump is kept unchanged** in the library with its date, also after an edit: a
   decoded setup points to the dump it came from, `.syx` export and send patch that dump, and the
   user can export a received dump as it came or revert a setup to it (the rollback the user asked
   for). Deleting a kept dump is the user's choice.
7. **A device chip** (replaced by decision 11, 2026-11-16) in the top bar ("UC4: not connected / connected") opens a small panel with
   Connect, the port and the steps for `Sndc`/`SndA`. The device page comes in milestone 4.
8. **A value the engine can't read is a problem** ("unreadable in the dump, factory value
   shown"), never silently fixed.
9. **Unreadable marks are kept by the library** (architect, 2026-11-15, step 1 review): per setup,
   as setup-relative paths, saved with the library in IndexedDB beside the configuration (no
   shape or `schemaVersion` change), part of undo and redo; dropped when the property or name is
   edited or its group or setup is reset or replaced. `state.problems` = validation + marks. Why:
   the factory value is valid, so validation alone would lose the problem, and a problem that
   vanishes on reload is the silent fix decision 8 forbids. A JSON export doesn't carry marks.
10. **A received dump is kept even when the engine refuses it** (architect, 2026-11-15, on the
    reviewer's proposal in the step 2 review): kept as unreadable with the refusal reason, no
    links, no import or revert, but export as it came and delete. The dump notice says "Dump
    received but unreadable: <reason> · Export · Dismiss". A refused **file** stays unkept (the user
    still has it). Why: received bytes can't be captured again, and they are evidence for the
    format (0003); decision 6 says every raw dump is kept.

Connections grilling (user, 2026-11-16; Files side in 0007 decisions 17–21):

11. **The Connections column replaces the device chip** (Q12, Q14, Q16): a collapsible column at the
    far left. Collapsed, a strip of about 48 px with the UC4's state (and later a dot per other
    input); open, about 240 px (280 px since decision 19), pushing the layout on wide windows and sliding over the properties
    column on narrow ones; open or closed is remembered per viewer. Title **Connections**
    (glossary). Why left: with 0008 it shows mostly incoming data; a permanent fourth column would
    leave the device view about 300 px at 1024 px. Replaces decision 7's chip and panel.
12. **Sections, top to bottom** (Q14): Connection (state in words, port, Connect) · Received (waiting
    dump notices; hidden when empty) · Send to UC4… (milestone 4) · Kept dumps · How to send a dump
    from the UC4 (collapsed help). 0008 adds **Other devices** below, listen only (Q16).
13. **A dump coming in** (Q13): the strip lights up, pulses once and shows a count badge until the dump
    is reviewed or dismissed; the dump notice moves from the status bar into Received; the status bar
    keeps one clickable line ("Dump received: open Connections"). The column never opens by itself:
    it would cover the edit and take focus. Kept dumps and the notice say `Export .syx` (Q7).
14. **Send only from Connections** (Q9; moved under the setup list by decision 32): `Send to UC4…` never sits in the Export menu, and always asks.
15. **Kept dumps list** (Q15): newest first; a row = kind and setup (`SndA`, `Sndc SE05`), received or
    file, time; the 5 newest, then `Show all (n)`; `Export .syx` and `×` per row; **Clear old dumps…**
    keeps the newest of each kind and slot and every dump a setup still needs (Revert, `Sndc`
    export, 0007 decision 16), and its dialog names what stays and why. Deleting a needed dump asks
    and names the setup and what stops working.
16. **Copy buffer** (Q6, glossary): where the editor shows dump differences, bytes of the device's copy
    buffer (`0x16C0`, `0x1B80`, `0x7600`–`0x7AFF`, `docs/protocol/uc4-sysex.md`) are labelled "Copy
    buffer", apart from the setups. The editor shows no byte differences yet; the label comes with
    the first view that does (the engine's `diff` gives them `slot: null` now).

17. **The open column closes with an arrow** (user, 2026-11-17): when open, the toggle at the column's
    top shows a `‹` arrow (the dot alone read as a status light, not a button); its help says "Close
    Connections (Esc)". The green state dot stays visible beside the heading (user, 2026-11-17, same
    day); it is hidden from screen readers, which read the state in the Connection section. The state stays in words in the Connection section; the closed strip keeps its dot, words
    and badge.
18. **Kept dump rows are compact** (user, 2026-11-17): `Export .syx` becomes a download icon button
    beside the `×`, both on the row's first line at the right; the row is two lines (kind and setup;
    received or file · time). The icon's tooltip, aria-label and help keep the words "Export .syx"
    (decision 13 stays the wording). The Received notices keep their text buttons: they are the
    prompt to act.
19. **The open column is 280 px** (user, 2026-11-17), was 240: more room between the text and the icon
    buttons. It pushes the layout from 1320 px window width (was 1280), so the device view keeps the
    width it had when pushed; below that it floats over the properties column (288 px) as before.

Send grilling (user, 2026-11-17/18, Q1–Q7, Q12, Q13; after the first send test). They replace the
Design's send paragraph where it differs (no chunks, no guided read-back):

20. **The first Send is one `Sndc`: the selected setup to its own slot** (Q1). `SndA` (restore) and a
    send into another slot come later, each after its own device test. Why: the send test covered
    exactly this case.
21. **Send builds the dump the way `Export ▾ → SEnn → Dump` does** (Q2, 0007 decisions 12–16): only
    confirmed fields, the setup's kept `Sndc` as the base so unknown bytes survive, the built dump read
    back and checked before it goes out. Where the export refuses, Send refuses with the same message.
    One way to build a dump, two ways out.
22. **A fresh `SndA` is required, for now** (Q3; made optional by decision 31): a `SndA` received since the UC4 was connected in this
    browser session. A re-plug or another port counts as a new connection, so it needs a new `SndA` (architect,
    2026-11-18, step 12). Without one the dialog shows the `SndA` steps and waits; there is no "send anyway".
    It becomes **optional** (offered, one click) once the UC4 is shown to refuse a damaged dump without
    storing it (decision 26) and a `SndA` send restores all setups. Why: until then the backup is the
    only way back; the user wants it gone later because it breaks the flow.
23. **One quiet dialog** (Q4): "Send SE05 "Hand made" to the UC4?", "It replaces SE05 on the device.",
    the changes (decision 24), "Put the UC4 in `rEc` first: setup mode, encoder 7, hold until `rc00`.",
    Cancel · Send. After sending, Connections shows one line: "Sent SE05. The UC4 shows SE05 when it's
    stored, Err if not." No further steps or questions. A `Sndc` the UC4 sends afterwards that equals
    what was sent is recognised: "SE05 on the UC4 matches the editor" instead of a dump notice.
    Why: the user wants it calm; the guided read-back was the test procedure, not a feature.
24. **The dialog lists what changes on the device** (Q5): from the engine's dump diff of the built dump
    against the base, in device words ("Encoder group 1: name `GrP1` → `send`"), at most 8 lines, then
    "+ 12 more"; "No changes" when equal, and Send still works. Why: the user still wants to see what
    goes out while the format is being debugged.
25. **It says it can't be undone** (Q6): "A send can't be undone in the editor. Your backup from 01:41
    holds the old state." (the time of the `SndA` of decision 22).
26. **The device's check is tested before the backup relaxes** (Q7): device session on SE16, from
    `base`. File A: one name byte of encoder group 1 changed (`GrP1` → `ArP1`) with the record's sum
    left as it was; `Err` and SE16 unchanged = the UC4 checks sums. File B, only if A is stored: the
    closing `F7` missing in the middle of a record (structure). Each file has a note in `dumps/` naming
    the byte, address, old and new value, and the sum expected versus written; after each: `Sndc`,
    compare, `rESc`.
27. **Order** (Q12): the damaged-file session, then Send (steps 12–13), then Copy / Paste (0006
    decisions 30–34). Send finishes milestone 4; the two don't depend on each other.
28. **After `Err`, send again; restore one setup from the backup** (user, 2026-11-18, Q15, after file C showed the
    UC4 stores good records before a bad one). The "Sent" line of decision 23 becomes: "Sent SE05. The UC4 shows
    SE05 when it's stored. If it shows Err, SE05 may be half written: send again." (a second send rewrites every
    record). Next comes **Restore SE05**: the old SE05 taken from the backup `SndA` of decision 22 as a `Sndc` at
    the same addresses and sent the same way (step 14). Decision 22's backup stays required until Restore has
    passed one device test; that replaces its condition (a). Why: the editor never sees `Err`, and restoring one
    setup is the undo a send lacks, without a whole `SndA` send.
29. ~~**A matching `Sndc` becomes the setup's dump**~~ (replaced by decision 30, user 2026-11-18) (architect, 2026-11-18, on uc4-reviewer's step 13 finding): when
    the UC4's `Sndc` equals what was sent, the setup links to that received dump as its base (decision 6), so the
    next send lists only new changes and "No changes" can show. Revert then goes back to what is on the device;
    older kept dumps stay in the list. One library call (uc4-model), wired where "matches" shows (uc4-ui).
30. **Send builds on the fresh `SndA`** (user, 2026-11-18, Q16; changes decision 21's base): the `Sndc` for slot n is
    built on that slot's part of the fresh `SndA` of decision 22, not on a `Sndc` the setup was imported from. Any
    setup can be sent without an import first; the change list is exactly what changes on the UC4 now (decision 24),
    and after a send and a new `SndA` it says "No changes"; unknown bytes come from the device's current state. The
    rest of decision 21 stays (confirmed fields only, read back and checked; the `.syx` export keeps its own base).
    A refusal speaks of sending, not exporting. Why: the browser check found SE16 unsendable although five `Sndc
    SE16` were kept, because a dismissed dump is not linked; the required `SndA` already holds the device's state.
31. **The `SndA` is optional when sending** (user, 2026-11-18, Q17; replaces decision 22's requirement and its
    end condition, and decision 28's "until Restore is tested"). With a fresh `SndA`: base and change list as in
    decision 30, the backup line, Restore later. Without one, Send still works: the base is the setup's linked
    `Sndc`, else the factory state of that slot (cut from the factory `SndA`); the change list says what it compares
    against; one line says "No backup from the UC4: the old SE05 can't be restored. Press SndA first if you want
    one." A field the engine can't write that differs from the base still refuses the send, so nothing is
    silently reset to factory. Why: a send touches one slot, the UC4 checks sums, and a second send repairs a half
    write; a hard block breaks the flow (user). A `SndA` send (all 18 setups) would need the backup again. The
    CLAUDE.md rule (a fresh `SndA` before every send in a development session) stays.

After the first send from the editor (user, 2026-11-18, `dumps/2026-11-18-editor-send.md`):

32. **`Send SE16 to UC4…` sits under the setup list** (Q18), after Reset and Revert: Send acts on a setup, like
    them. Disabled with its reason while the UC4 is not connected; the "Sent …" and "matches" lines show right
    below it. Connections loses its Send section and keeps the connection, received and kept dumps. Decision 14's
    core stays: never in the Export menu, and Send always asks.
33. **The `rEc` hint is a guide on the drawn UC4** (Q19; its form replaced by decision 35): while the dialog is open (beside the device view, not over
    it) it shows the steps one at a time and lights the control on the device view: (1) hold Shift and press Edit
    twice, the Setup LED lights; (2) hold encoder 7's push button until the bars run and `rc00` shows (the display
    shows `rEc`, then `rc00`). Back/Next or a click on a step; the last step is the user's "rc00 shows", and only
    then is Send active, because the UC4 reports nothing. Steps from the manual (`uc4-device.md`, Setup mode), not
    from the Configurator ("Setup twice"). The same guide later explains `Sndc` and `SndA` in the help section.
35. **The guide is callouts on the dimmed device view** (user, 2026-11-18, Q20, from the Configurator's screen; changes
    decision 33's stepper): starting a send or restore dims the device view except Shift, Edit with the Setup LED and
    encoder 7; three numbered callouts sit beside them, at most two lines each with key words as chips: ① "Hold
    `Shift`", ② "Press `Edit` twice: Setup LED on", ③ "Hold encoder `7`: `rEc`, keep holding until `rc00`". A small
    card in the middle of the device view: "Put the UC4 in receive mode (rc00), then Send." (or Restore) · Cancel ·
    Send. No stepper, no "rc00 shows" gate. The docked panel keeps the title, the changes and the backup line, without
    the `rEc` text. Callouts are profile data, reused later for `Sndc`/`SndA` help. Why: the step list was too much
    text; the callouts show where to press.
34. **The change list uses the device's spelling** (architect, 2026-11-18, first editor send): names as the display
    shows them (`GrP1 → SEnd`), codes as in `uc4-device.md`; the editor's lowercase stays internal.

## Open questions

Hints from the UC4 Configurator, not evidence ([other editors](../reference/other-uc4-editors.md), items 1 and 3): the device accepts a
`Sndc` built from scratch for SE01; the steps for `Sndc` and `rEc` (`rc00` while waiting).

- ~~Chunk size and pause the device accepts~~ — answered 2026-11-17 (send test, `dumps/2026-11-17-send-test.md`):
  a whole `Sndc` in one go at DIN speed (`sendmidi`, about 1.4 s) is accepted. A `SndA` (100 KB) is not tested yet.
- Sending to a slot other than SE16: accepted untested (architect, 2026-11-18, step 13b review). The slot layout of
  what the UC4 sends is confirmed (six slots cut from a `SndA` equal their device `Sndc`, engine 0.11.0 `cutSlot`);
  that a received `Sndc` is stored at the addresses it names is seen only for SE16. A send writes the device's own
  bytes back where they came from, plus confirmed fields, and the UC4 checks sums per record.
- Pacing: a `Sndc` is one SysEx message and goes out unpaced (architect, 2026-11-18, step 12 review; `sendmidi` also
  handed it over whole). Pacing between messages comes back with a multi-message `SndA` send.
- ~~Does the device answer anything on receive?~~ — no, only the display (`SE16`) (send test 2026-11-17).
- ~~Does the UC4 check what it receives?~~ — it checks record sums: a wrong sum gives `Err` and nothing of that
  record is stored (2026-11-18, `dumps/2026-11-18-damaged-A.md`). File B (framing) not needed.
- ~~Is a refused dump all or nothing?~~ — no (2026-11-18, `dumps/2026-11-18-damaged-C.md`): records with a right sum
  are stored as they arrive, a bad one is skipped, `Err` comes at the end. After `Err` the setup can be half
  written. Decision 22's condition (a) is not met: what Send does after `Err` is open for the user.

Later (parked, user 2026-11-18, Q13):

- **Write the device's copy buffer from the editor**, so a setup is ready for `PStS` on the UC4. Only a
  `SndA` carries the copy buffer, so it needs the `SndA` send test (or a test of a `Sndc` addressed at
  the copy buffer). Decide then whether sending straight into the target slot (slot move) already
  covers it.

## Steps

Milestone 2 cut by `/to-tickets` (2026-11-15) from the spec; the user said "continue" on the
architect's recommendations. All `[ready-for-agent]`. They replace the draft's steps 1–2.

1. **Import a `.syx` file (tracer)** — done 2026-11-15 (`fee3396` library, `3862082` UI; browser-checked by the architect) · uc4-model, then uc4-ui · blocked by: none · Import takes a
   `.syx`: `SndA` asks "replace the whole library?", `Sndc` goes to its slot ("replace, or another
   slot?"); one undo step; a damaged dump is refused with the engine's reason and what to do;
   unreadable values are problems; unknown firmware warns; a file that is neither JSON nor a dump
   says what Import reads. Tested with the fixtures.
2. **Kept dumps and rollback** — done 2026-11-15 (`39a6c8b` library, `e66f560` UI; browser-checked by the architect) · uc4-model, then uc4-ui · blocked by: 1 · every imported dump kept
   unchanged with its date, beside the library; a setup remembers its dump; export a kept dump as
   it came, revert a setup to it (one undo step), delete one after a question. UI: a "Dumps" list
   in the device panel (date, content, received or file; Export, Delete) and "Revert to its
   dump…" next to the setup's reset.
3. **Connect to the UC4 (device chip)** — done 2026-11-15 (`2495e84` connection, `4a6537c`, `b31d7b9` chip; browser-checked by the architect; connect and silent reconnect seen with the user's UC4 on 2026-11-15, unplug/replug open) · uc4-protocol, then uc4-ui · blocked by: none · the
   device connection (`src/midi`, no send method, a test says so) and the chip: Connect asks for
   MIDI access, silent reconnect, connected / not connected, port choice, plug and unplug,
   unsupported and denied with what to do; the panel shows the `Sndc`/`SndA` steps. Hardware
   check: the user's UC4 shows as connected.
4. **Receive a dump with a notice** — done 2026-11-15 (`11e82d9`, fix `cffc30f`; tested with the user's real `Sndc` and `SndA`; unplug while a notice waits still open for the user) · uc4-ui (uc4-protocol if needed) · blocked by: 2, 3 · a dump
   sent from the device is kept and shows a dump notice (Review · Dismiss) without touching the
   edit; Review opens the import dialog; dumps queue. Hardware test list: connect, `Sndc`,
   `SndA`, unplug while waiting.
5. **Send behind the gate** (milestone 4; first send test done 2026-11-17 with `sendmidi`: the UC4's own `Sndc` and an engine-built `Sndc` of SE16 both stored byte for byte) — split into steps 11–13 by the Send grilling (decisions 20–27).
6. **Kept dumps: what a setup needs, clear old** — done 2026-11-16 (`923ec6b`; clear is question-first, no undo step, like delete) (uc4-model, decision 15) · blocked by: none · the
   library says per kept dump which setups need it and for what (Revert, `Sndc` export), and offers
   a "clear old dumps" plan (what goes, what stays and why) and its run, one undo step or a
   question first as for delete. Unit tests.
7. **Connections column** — done 2026-11-16 (`9ed669d`; browser-checked by the architect in a wide window, dark and light; 1024 px and the hardware list open for the user) (uc4-ui, decisions 11–15) · blocked by: 0007 step 5 (shares the top bar),
   6 (for Clear old) · the strip and the column with its sections, the badge and pulse on a dump,
   the notice inside it and the status-bar line, the kept dumps list; the device chip goes. Browser
   test list at 1280 and 1024 px, light and dark; hardware list for the user: connect, `Sndc` with
   the column closed (strip lights up), review from the column.
8. **Close arrow** — done 2026-11-17 (`a0b70b2`, and `2cafdbf` (bolder arrow, heading dot hidden from screen readers); browser-checked by the architect, dark and light) (uc4-ui, decision 17) · blocked by: none · the open column's toggle shows `‹`
   (with the badge if a dump waits), the state dot stays visible beside the heading, aria-label and help "Close Connections (Esc)". Browser check by
   the architect.
9. **Compact kept dump rows** — done 2026-11-17 (`b8ccb6d`, browser-checked by the architect) (uc4-ui, decision 18) · blocked by: none · download icon (inline SVG,
   no dependency) beside `×` on the first line, two-line rows, same hover and focus as other icon
   buttons. Browser check by the architect.
10. **Wider open column** — done 2026-11-17 (`cb0d0bb`, browser-checked by the architect: 280 px, pushing from 1320 px) (uc4-ui, decision 19) · blocked by: none · 280 px, `WIDE_PX` 1320 in
    `connections.ts` and both media queries; the row text gets its room. Browser check by the architect.
11. **Damaged-file session** (decision 26) — done 2026-11-18: file A (`Err`, bad record not stored), file C (`Err`, the good records before the bad one stored: not all or nothing; `dumps/2026-11-18-damaged-C.md`) — architect with the user, uc4-protocol for the analysis ·
    blocked by: none · file A built by the engine on `base` with the one defect and its note; the
    user's yes for each send, a fresh `SndA` first; result into `dumps/` and `uc4-sysex.md`. File B
    only if A is stored.
12. **Send in the connection** (decisions 20–22) — done 2026-11-18 (`4d756e7` `sendDump`, `connectedAt`; storage `planSend` with the export's build, change lines and the fresh `SndA`; both reviewed) — uc4-protocol (`src/midi`), uc4-model (`src/storage`, beside `syxExport.ts`) · blocked by: 11 · `src/midi` gets a
    send of one built `Sndc` to the UC4's USB output (the step 3 "no send method" test is replaced on
    purpose by tests that nothing sends without an explicit call); the library offers "build the
    `Sndc` for slot n" with the export's refusals, the change list (decision 24) and whether a fresh
    `SndA` was received since connecting. Unit tests with a fake output.
13. **Send dialog** (decisions 23–25) — done 2026-11-18 (`1ef44d3`, reviewed; follow-up 13a) — uc4-ui · blocked by: 12 · `Send to UC4…` in Connections for the
    selected setup, the dialog, the "Sent" line, the matching-`Sndc` line. Browser check by the
    architect; hardware list for the user (send SE16, see `SE16`, send its `Sndc` back, see "matches").
    The "Sent" line as in decision 28. Hardware list adds: a send from the editor (one unpaced `out.send()` at USB
    speed, as `sendmidi` did) stores byte for byte (`Sndc` compare).
13a. ~~**Relink on match**~~ (decision 29) — dropped for 13b.
13b. **Send on the fresh `SndA`, optional** (decisions 30, 31) — done 2026-11-18; first send from the editor passed
    on the device the same night (`dumps/2026-11-18-editor-send.md`): milestone 4 — (`5f2fe82` `cutSlot`, `cc71fda` storage, `6dc2878` dialog; reviewed; browser-checked by the architect at 1024 px, dark: factory base, no backup, Cancel) — uc4-model (`planSend`; uc4-protocol if the engine needs a way to
    cut a slot's `Sndc` from a `SndA`), then uc4-ui (refusal wording) · blocked by: 13 · tests: an unlinked setup
    plans; changes against the `SndA`'s slot; "No changes" when equal; a send from SE16 equals the engine-built file
    of 2026-11-17 when the `SndA` holds factory SE16; without a fresh `SndA` the linked `Sndc`, else the factory
    slot, with the base named in the plan; uc4-ui: the "no backup" line and the base in the change list's title.
14. **Restore one setup from the backup** (decision 28) — library half done 2026-11-18, UI half built (`39472ea`, reviewed; Restore shows after a recorded send); device test passed 2026-11-18 (SE16 back to the backup byte for byte, `dumps/2026-11-18-editor-send.md`) (`ec10ff4`: `recordSend`, `lastSends`, `planRestore`, the backup guard; backup = the `SndA` the slot's last send named, else the newest fresh one; the library's setup is not changed by a restore, taking it into the library is a later idea) — uc4-protocol (build), uc4-ui (a "Restore SE05" action
    beside the "Sent" line and on the setup) · blocked by: 13 · the slot's records taken from the backup `SndA`
    into a `Sndc`, read back and checked like decision 21; then a device session on SE16 (send a change, restore,
    `Sndc` = the backup's SE16). (Decision 31 already made the backup optional.) "Clear old dumps" and
    delete keep (or ask about) the `SndA` a send or restore names as its backup (step 12 review). Seam:
    `describeChanges`, `freshBackup` in `src/storage/sendPlan.ts`.
15. **Send under the setup list, device spelling** (decisions 32, 34) — done 2026-11-18 (`af0c2ad`, reviewed; browser-checked by the architect, dark, not connected; names spelled by the display's glyph table, e.g. `trAC`, not the manual's print; the text-based spelling moves to structured change values with step 14) — uc4-ui (uc4-model if the change lines are
    worded in `src/storage`) · blocked by: 13b · the button and its result lines move; the Send section in
    Connections goes; change lines in the device's spelling. Browser check by the architect.
16. **`rEc` guide on the drawn UC4** (decision 33) — built 2026-11-18 (`13edd11`, reviewed; the dialog docks over the properties column; browser and hardware check open, the UC4 was not connected) — uc4-ui · blocked by: 15 · the stepper in the Send dialog,
    the dialog beside the device view, the lit controls (Shift, Edit with the Setup LED, encoder 7 and the display
    `rEc` → `rc00`), Send active after "rc00 shows"; built so `Sndc`/`SndA` guides can reuse it. Browser check by
    the architect; hardware list for the user (follow the guide on the real UC4).
17. **Guide as callouts** (decision 35) — done 2026-11-18 (`f3f9a1e`, decluttered after the user's look; browser-checked by the architect; followed on the real UC4 for a send and a restore; 1024 px open) — uc4-ui · blocked by: 16, 14 · replaces the stepper in the Send and Restore
    dialogs; dimmed device view, three anchored callouts, the centre card; reduced motion; 1024 px placement. Browser
    check by the architect; hardware list (follow the callouts on the real UC4).
