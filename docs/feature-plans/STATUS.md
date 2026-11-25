# Status and next steps

The working state: what is built, what is in work, what needs a check, and open questions.
Maintained by the architect. The order of features is in the [plan index](README.md#next-in-dependency-order);
decisions live in the numbered plans. Finished work is in the git history, not here.

_Last updated: 2026-11-25 (0011 public release in work; Faderfox's documentation checked; PR #2 open)._

## Now

- Repo has the agent workflow (`CLAUDE.md`, `.claude/agents/`, `scripts/agents.sh`), `GLOSSARY.md`,
  the plans 0001–0007 (drafts), the device facts (`docs/reference/uc4-device.md`)
  and the manual.
- Scaffold done (`087bef4`): `npm run dev|test|build|lint` work; 87 protocol tests under Vitest.
- `receivemidi`, `sendmidi`, `routemidi` installed in `~/.local/bin` (0003 decision 3).
- **First backup captured** (`dumps/2026-11-13-backup*`, outside git, note in
  `dumps/2026-11-13-backup.md`): the user's real setups, `SndA` pressed 18 times → 18
  byte-identical messages of 100,640 bytes. First reading (all `likely`, nothing confirmed):
  - Framing `F0 00 00 00 … F7`; every byte as a triple `4c 2h 1l` (command nibble, high, low),
    as in the EC4 script (0003 decision 7), plus runs of `00` bytes (30 after each record).
  - Header commands 1–4 (`06 03 02 05`), one command `F` (`06`) at the end.
  - 430 records: commands `9`/`A` = 16-bit address, `B`/`C` = 16-bit sum of the record's data,
    64 × command `D` = data. The sum matches in all 430 records.
  - The data is one memory image `0x1480`–`0x7FFF` (`FF` from `0x7600`) holding all 18 setups.
    The 18 `SndA` were byte-identical: a dump of unchanged setups is deterministic.
  - `Sndc` of SE02 (`dumps/2026-11-13-Sndc-SE02.syx`, 5,072 bytes): same framing, header
    command 2 = `02` (`SndA`: `03`), 22 records, every byte equal to the `SndA` image at the same
    address. It carries `0x14A0` (names), `0x1740` (one row) and `0x2100`–`0x25FF` (1,280 bytes).
  - Memory layout that follows (`likely`): group names `0x1480` + 32 × (setup − 1); a table at
    `0x1700` + 64 × (setup − 1) holding 8 × 5 bytes, apparently fader 9 per fader/button group
    (`ch-1, 70 = CC112, 00, 7F, 01`); a 1,280-byte block per setup at `0x1C00` + `0x500` ×
    (setup − 1) for the other 32 controls × 8 groups (5 bytes each), ending at `0x7600`.
  - SE01 differs from factory in Enc1 group 1 (`Acc2`): the user's own edit (SE01 and SE02 are
    the setups the user worked in).
  - uc4-protocol's analysis (`docs/protocol/uc4-sysex.md`, all `likely`): the `0x14A0` record
    holds only 32 bytes (setup 2's names), so a `Sndc` touches only its own setup. The `0x1C00`
    block is 20 fields of 64 bytes (encoders, push buttons, green buttons, faders 1–8; per kind
    channel/type, number, lower, upper, mode/scale; byte 8·(group−1)+(n−1)). SE03–SE16 match
    the factory table exactly, SE01 differs in one byte, SE02 in 130 (the user's main setup).
  - Tools `node tools/uc4-dump.ts info|diff|note` done (0003 step 1, `a5fba28`).
  - `Sndc` series SE01, SE09, SE17, SE18, SE16 before/after `rESc` (`dumps/`): every record
    address matches the layout; the slot is not in the header, only in the addresses (`likely`,
    untested against a receive). SE16 was already factory. Fixture `base` = SE16 after `rESc`
    (`tests/fixtures/sysex/base.syx`, `cd2ada0`).
  - `0x1480`–`0x16BF`: the encoder group names, 4 bytes each, 8 per setup, setups 1–18 in order;
    all factory (`GrP1`…, 17/18 `Snd1`…`GLOb`). Character code: digits `00`–`09`, letters from
    `0A` (a) with no `k` (l = `14`), space `26`.
  - From `0x1700`: repeating 5-byte records (`nn 70 00 7F 01`, 8 per 64-byte row); the setup
    layout is not worked out yet.

## In work

- **Local branches, not pushed** (user tries first, 0010 decision 7): `fix/guide-and-dump-overlay` → `feat/onboarding` (0012, welcome card `d6b7a9f`) → `feat/compact-dumps` (0010 step 6 in work). Open, light theme: `--border` `#b9b9b3` on white is 1.97:1, below 3:1 for field edges; app-wide, left for a token pass.
- **0011 public release** (2026-11-25): steps 2–4 and 6 done; PR #2 with the user; privacy check done except the commit email (Q47). **For uc4-model**, from Faderfox's documentation (uc4-sysex.md §11): the push button's +4 low nibble is a mode/scale byte (not "none"); the number is unused for `PrGC`, `AFtt` and `Pbnd`, so validation must not reject any value there. **uc4-protocol** (later): `tests/protocol/markOLikely.ts` mutates the shared profile; convert to a test engine from `createEngine` with a modified profile, as `guard.test.ts` does.
- **0009 user guide** built (steps 1–6, last `ab52ad4`): seven pages, three annotated shots (`npm run docs:shots`), dark theme, click-to-zoom; preview `npm run docs` (:8000). Open: the user's read-through, hosting (before the mail to Mathias), lines over 100 columns. **uc4-ui:** in the Send guide, callout 2 covers fader labels 1–3 and callout 1 the numbers of faders 7–8 (`device-send.png`). **uc4-protocol:** `uc4-sysex.md` stale in §1:57, §9 rows 256/257/260, §9b:285.
- 0002 step 1 done (`8309e28`): document shape, factory SE01–SE16, `save`/`load`, migration
  machinery, `tools/uc4-config.ts factory|check`; 126 tests. Factory lower/upper 0/127 matches
  the factory `SndA`.
- 0002 step 3 done (`16ec0f6`): SE17/SE18; `factorySetup(1…18)` equals the factory `SndA` control
  for control (read by a throwaway script; gaps of the manual now in `uc4-device.md`). 130 tests.
  Factory `SndA` is a fixture (`0d180cf`, `tests/fixtures/sysex/factory-SndA.syx`); for 0004:
  decoded, it must equal `factorySetup(1…18)`.
- 0002 step 2 done (`42a2a1d`): `validate` with paths (ranges, enums, group-name characters, `CCAh`
  ≤ 31, duplicate ids/slots, format/version/dates, unknown fields); `load` refuses wrong list
  lengths. 158 tests.
- 0002 step 4 done (`d6ec0b5`): `changeType` (keeps hidden values, `CCAh` → 31 with message) and
  `normalizeGroupName` (`text` for the field, `name` padded, `hints`). 200 tests. For uc4-ui
  (0006): the name field keeps `text`, shows `hints`, stores `name`; the type picker uses
  `changeType` and shows its message. Open for the UI grilling: a pasted `kick` becomes `ic`.
- 0002 step 5 done (`bc7c79e`): `schema/uc4-config.schema.json` generated from the types
  (`node tools/uc4-config.ts schema`), checked against them; optional `$schema` field in
  `Uc4Config` (no version bump; uc4-protocol and uc4-ui to know). Ids/slots unique and real dates
  stay with `validate`. 229 tests. **0002 built.** The user checked it in nvim (2026-11-14):
  the relative `$schema` resolves in jsonls, completion offers the enums, and a wrong type is
  flagged with the valid values.
- 0003 step 2 (done, details kept until 0003 step 3 is written up):

- 0003 step 2, dump session 1 on SE16 (architect + user, uc4-protocol analyses): the change list
  in `docs/protocol/uc4-sysex.md`, given to the user in batches of ~5.
  - Batch 1 done (proposal rows 1–3, fixtures `enc1-*`): channel (low nibble of field 0), number,
    lower, upper each one byte as predicted, **confirmed for Enc1 of encoder group 1**.
  - Batch 2 done: type = high nibble of field 0 (`CCr1` 0 … `AFtt` 6, `PrGC` 3 likely). Open
    finding: `n127` → `n031` on `CCAb` → `CCr1` (user turned down; cause checked in batch 3b).
  - Batch 3a done: field 4 = mode (high) | display (low), confirmed for Enc1 of group 1.
  - Batch 3b done: Enc8 group 8 stride pair (number), `PrGC` = 3, `CCr1`/`CCr2` keep the number.
  - Batch 4 done: channel, number, lower, upper of `Pbt1`, `btn1`, `FAd1` and one last-control
    stride per kind; **the `CCAh` clamp is device behaviour** (type → `CCAh` lowers the number to 31).
  - Batches 4b–7 done (2026-11-13): encoder kind fully confirmed (group-major order); push,
    green button and fader codes confirmed at control 1 of group 1 (fader has its own type table
    `CCAb 0 PrGC 1 Pbnd 2 AFtt 3`; green buttons offer no `OFF`); fader 9 table = 5 bytes per
    fader/button group at `0x1AC0`. 65 tests.
  - Batches 8/8b done (2026-11-13, `6375337`): group names at `0x1660`, stride 4 per encoder
    group. Character list: digits `00`–`09`, letters `a`–`z` without `k`, `w` and a second `u`/`v`
    (`0A`…`20`), then 6 symbols `21`–`26` (`26` blank). Confirmed: 0 9 j l u x y z and the
    symbols; e f h i m q likely; the other letters from factory names only. 80 tests.
  - Batch 9 done (`dc86a24`): every field of push, green button and fader placed at control 8 of
    group 8; fader 9 record fields placed (groups 5–8). Push display stays likely. 87 tests.
  - **Session 1 closed:** `rESc` on SE16, its `Sndc` is byte-identical to `base`
    (`dumps/2026-11-13-session1-SE16-rESc.syx`). SE16 is factory again.
  - **`rESA` done (user, 2026-11-13):** the `SndA` before it equals the morning backup; the `SndA`
    after it (`dumps/2026-11-13-SndA-after-rESA.syx`) is the **factory image** of all 18 setups and
    differs from the backup only in SE01 (1 byte) and SE02 (130 bytes). SE18 group 6 channel 13 is
    factory (manual typo). **The UC4 now holds factory data;** the user's SE01/SE02 live only in
    `dumps/2026-11-13-backup-SndA.syx`. Restoring them is a send to the UC4: only with the user's yes.
  - Batches 4–7 planned (23 dumps, combined per 0003 decision 8; list in `docs/protocol/uc4-sysex.md`):
    push/green button/fader channel–number–lower–upper and strides, then every button, LED and
    fader code, fader 9, group-name characters. All kept: the editor writes only confirmed codes.
  - SE16 is not factory now (Enc1 `Ch01 n127 L001 U126`); `rESc` at the end of the session. Rows "copy to another slot"
  and "routing" touch more than SE16: only with the user's explicit OK, `Rou6` restored after.

## Next

0. **2026-11-18: 0006 step 25 built** (`af9be44`): every help text as `what · one way · UC4: hint`; the "Keys" overlay
   (`?`, Settings → All keys…); `( )` / `{ }` / `Option + ← →`; Shift + click selects a group. Ideas: command mode (drawn
   Shift, `:`, in the help line, mainly local); the ARS test rig in 0008. Next dump-session list: confirm the Edit
   LED / how edit mode is entered (`uc4-device.md` says "to confirm").
   **2026-11-18: 0006 steps 22–24 built**: Copy takes a snapshot; Copy/Paste flash; a Library row above Setups with
   `Reset all…` (one undo step, dump links kept). PR #1 (`chore/agent-workflow` → `main`) open. Open for the user: the
   flash's look, Reset all after an export, light theme, 1024 px.
   **2026-11-18: Copy / Paste built** (0006 steps 20–21): setups, groups and controls; "Paste SE05 here" on setup rows;
   Cmd-C/V and Settings "Keys: Standard | Vim". Open for the user: trying it, light theme, 1024 px.
   **2026-11-18: Send complete** (0005 steps 14–17): Restore from the backup and the callout guide passed on the UC4
   (SE16 back to factory byte for byte). Open for the user: 1024 px of the guide. A list of sends in Connections was
   declined for now (Q21). Next: 0006 steps 20–21 (Copy / Paste).
   **2026-11-18: milestone 4 reached**: the user sent SE16 (group 1 `send`) from the editor on the SndA base;
   display `SE16`, the `Sndc` back matched byte for byte, "matches" shown; SE16 reset after
   (`dumps/2026-11-18-editor-send.md`). User decisions: Send under the setup list (0005 decision 32), the `rEc`
   guide on the drawn UC4 (33); device spelling in the change list (34). Next: 0005 steps 15–16 (uc4-ui), then
   14 (Restore), then 0006 steps 20–21.
   **2026-11-18: 0005 steps 13 and 13b done**: Send dialog in Connections; the send builds on the fresh `SndA`'s slot,
   else the linked `Sndc`, else the factory slot (decisions 30, 31: `SndA` optional, "no backup" line). Next: the
   user's hardware test (first send from the editor, SE16), then step 14 (Restore), then 0006 steps 20–21.
   **2026-11-18: 0005 step 12 done**: `connection.sendDump` and `connectedAt` (uc4-protocol, `4d756e7`), `lib.planSend`
   (uc4-model: one build path with the `.syx` export, change lines, fresh `SndA` since connecting); sent unpaced.
   Next: step 13, the Send dialog (uc4-ui).
   **2026-11-18: damaged-file session**: the UC4 checks each record's sum. File A (wrong sum in the first record)
   gave `Err` and SE16 unchanged; file C (two good changed records, then a wrong sum in the last) gave `Err` but
   **stored the good records** (`PArt`, `Enc1` number 99): not all or nothing, `Err` can mean half written
   (`dumps/2026-11-18-damaged-A.md`, `-damaged-C.md`). SE16 reset to factory after. Decision 22's condition (a)
   failed; the user chose (0005 decision 28): "If it shows Err … send again" in the Sent line, and Restore
   one setup from the backup (step 14), after whose device test the backup becomes optional. uc4-protocol to add it to `uc4-sysex.md`. Device =
   `2026-11-18-SndA-before-damaged-C.syx`.
   **2026-11-18: Send and Copy / Paste grilled** (user): 0005 decisions 20–27 (one `Sndc` to its own slot,
   built like the export; fresh `SndA` required until the UC4 is shown to refuse a damaged dump and a `SndA`
   send works; one quiet dialog with the changes in device words; copy-buffer writing parked) and 0006
   decisions 30–34 (Copy / Paste for setups, groups and controls; "Paste SE05 here" on setup rows; undoable;
   Cmd-C/V, Settings "Keys: Standard | Vim" with `y`/`p`). Glossary: Copy / Paste. Order: 0005 step 11
   (damaged-file session: file A, wrong sum on SE16) → 0005 steps 12–13 (Send) → 0006 steps 20–21.
   **2026-11-17: first send test passed** (`dumps/2026-11-17-send-test.md`): with `sendmidi` and the UC4 in `rEc`,
   its own `Sndc` of SE16 and an engine-built one (group 1 `send`) were both stored byte for byte; nothing comes back,
   only the display (`SE16`). SE16 reset to factory after. Next: plan the editor's Send (0005 step 5) with a grilling
   round; untested still: `SndA` send, slot move, `Err`.
   **2026-11-16 evening:**
   - Group-name session done (`names-g1-4`, `names-g5-8`, combined dumps by the user's OK): all 32
     positions and every character but `o` confirmed, engine 0.10.0. uc4-protocol reviews and commits it.
   - Copy test done (`dumps/2026-11-16-copytest.md`, `likely`): the clipboard is a 19th slot in every
     `SndA` (`0x16C0`, `0x1B80`, `0x7600`–`0x7AFF`); `CPYS`/`PStS` need the bars to finish; a paste is
     stored only when setup mode is left. The earlier `FF`/`7F` SE16 was a paste of the empty clipboard.
     uc4-protocol writes it into `uc4-sysex.md` and 0003.
   - Device state: SE16 factory (`rESc`, 21:17); SE01 names in groups 1–2 blank; clipboard = SE01.
     Fresh `SndA`: `dumps/2026-11-16-SndA-after-CPYS-SE01.syx`.
   - Import/export grilling done (user): 0007 decisions 17–21 (Files toolbar, one `Export ▾` menu) and
     0005 decisions 11–16 (Connections column on the left replaces the device chip; dump notice inside
     it; kept dumps tidy; copy buffer label). Glossary: Export, Import, Send / Receive, Copy buffer,
     Connections, Kept dump. All built 2026-11-16: 0007 step 5 (`39324d1`), 0005 steps 6
     (`923ec6b`) and 7 (`9ed669d`, Connections column), browser-checked by the architect. Open for the
     user: the 1024 px checks of the column (the browser window could not be resized), the exports'
     downloads, and the hardware list (connect; `Sndc` with the column closed lights the strip; review
     from the column; unplug/replug).
   - Listener runs in a visible tmux pane of the architect's window, never hidden (user, 2026-11-16).

1. **In work (2026-11-14):** 0006 steps 1 (`fb91b8e`) and 3 (`cbd8e49`) done by uc4-model
   (library, storage, files, resets, problems in `src/storage/`; 295 tests); uc4-model stopped.
   Step 2 tracer done (`6f149ef`), browser-tested by the architect 2026-11-14 (tests 1–8, 10, 11
   pass; dark mode and blocked storage left for the user). Step 4 carousels done (`bdb7d10`, fit and
   never-blank start included), browser-tested 2026-11-14 at 1280×800; open for the user: 1024×768,
   dark/light. Step 5 display and group names done (`906244c`),
   browser-tested; open for the user: glyph shapes on the device (look only: never seen `e f h i m
   q`; shapes of `g i m c u r o`). Step 6 library list done (`9cf9362`), browser-tested.
   Step 7 files, problems, undo UI done (`c8ef6a9`), browser-tested (uc4-model's step 3 checks
   included). Decision 19 done (`5c59ab1`), browser-tested. Step 9 settings
   done (`0335f4b`), browser-tested. Step 8 and the last task (slide with the arrow, printed SE17/SE18
   group names) done and browser-tested. **Milestone 1 built**; final glyph `o` fix with uc4-ui. 0003 step 3 done (`583588c`); 0004 interface waits for the
   user's answers to 0004 open questions 1–14 (asked 2026-11-14), uc4-protocol stopped.
2. **Milestone 1 reviewed by the user (2026-11-15):** items 1–3, 5–12, 14 pass (undo ends with a
   reload, accepted). Small changes (0006 decision 20) done by uc4-ui (`00c68f9`, picker filter dropped
   after it) and browser-tested by the architect. For the `.syx` import (milestone 2): a non-JSON
   file should say what Import reads, not only "not valid JSON". For a UI grilling round: navigation in three zones (setups, encoder
   section, fader/button section; Tab between, arrows within; keys `[` `]` hard on a German
   layout), groups selectable in the panel, a fader/button group display like the encoder one,
   an interactive display (what the UC4 shows while editing, display scale), longer group names
   (label) with a 4-character display name and suggestions, help for command types with sources,
   slide animation tuning, scrollbar vs spacing on smaller screens.
   Glyphs checked by the user 2026-11-15: all as the editor draws them, except `u` = big `U`.
   Hardware look list for the user (look only): what the display shows right after entering edit
   mode, whether a value falls back to the group name after a while, whether touching an edit
   encoder shows the value; small or big `c`/`o` in `Acc3`, `Enc1`, `notE`, `toGL`; whether
   3-character codes (`Std`, `JMP`, `btn`) sit left or right; how edit mode is entered and which group it edits;
   which controls the Global box labels beside the display belong to.
   Browser checks to run when the UI has them (from uc4-model): step 1 — change + reload keeps it;
   cleared site data → factory; garbage in IndexedDB `uc4-editor/kv/library` → factory + message +
   `library-unreadable-…` key; blocked storage → editing works, status "failed". Step 3 (with
   step 7) — whole export downloads `uc4-config-<today>.json`, "last exported" survives reload;
   "export first" only with unexported changes; one-setup re-import asks replace/other slot, undo
   restores; number 999 imports with a marked problem and stepping selects it; a text file is
   refused with what to do; reset group/setup clears the "differs" dot, undo brings it back.
3. **In work (2026-11-15):** 0004 interface confirmed by the user (decisions 3–17). Combined SE16
   dump done 2026-11-16 (`64f8182`, engine 0.6.0): push/green/fader order and control-8 green mode and fader
   display confirmed; the encoder `type` at control 8 stays `likely` (an extra byte, Enc8 g8 number
   103→31, on the same control; 0003 decision 8). Next dump: Enc8 g8 type only, from factory, clamp-free. 0004 step 1 done (`6f96685`, framing + `parse`, 428 tests; decisions 18–20 from its review).
   0004 step 2 done (`194b129`, `decode`, engine 0.2.0, 513 tests; encoder `type` `likely` but at
   g1c1). 0004 step 3 done (`9e08301`, `encode` with a base, engine 0.3.0,
   683 tests: every fixture round-trips byte-identical, every fixture pair is reproduced from its
   predecessor). Conflicting records are `not-lossless` (decision 21). 0004 step 4 done (`5f1612c`,
   `encode` without a base from the factory asset, `diff`, engine 0.4.0, 769 tests). 0004 step 5 done
   (`527af41`, `capabilities` / `canEncode`, 777 tests). **0004 built** (engine 0.5.0, pure
   bytes; whether the UC4 accepts a generated dump waits for the 0005 send test).
   Next for milestone 2: grill 0005 (receive, listen only) with the device page and `.syx` import
   in the app (`/grill-with-docs` on 0005); open there: a barrel `src/protocol/index.ts` for the UI;
   callers run `validate` before `encode`.
   `openLibrary` hang fixed by uc4-model (`93dff33`), browser-tested by the architect 2026-11-15
   (busy message, normal open after, delete not blocked by a second tab); uc4-model stopped.
4. Faderfox mail draft.
5. **0005 grilled** (round 1, 2026-11-15, decisions 2–8): 0005 milestone 2 cut into steps 1–4 (2026-11-15): library part of step 1 (`fee3396`) and the
   connection of step 3 (`2495e84`) done; uc4-model on step 2 (kept dumps); step 3's chip done (`4a6537c`;
   hardware check for the user: connect, unplug/replug, reload). Step 1 done (`3862082`): `.syx` import works. Step 2 done (`39a6c8b`,
   `e66f560`). Step 4 built by uc4-ui; **first real receive 2026-11-15**: the user's `Sndc`
   (SE01, 5,072 bytes) and `SndA` (one message, 100,640 bytes; 17 bytes differ from factory)
   arrived over Web MIDI, were kept and shown as dump notices. The help-line teardown error is fixed
   and checked; the groups area is compact (next heading at 222 px, was 382). **Milestone 2
   built.** Open for the user: unplug while a notice waits. For uc4-protocol: `SndA` is one message, seen again over Web MIDI.
   [needs-triage] A later engine could re-read dumps kept as unreadable (0005 decision 10). For step 4
   (uc4-protocol): split the "Shift aborts." note out of `sendSteps` into its own field. **0006 steps 10–19**
   cut (2026-11-15, from decisions 21–29). Steps 10, 17, 18, 19 done and browser-tested
   (2026-11-15). Steps 11 (`b9010e0`) and 12 (55f423c) done, 13 (`684e144`) done. Step 14 done (labels, suggested name; Shift+arrows `e8e116b`).
   Steps 15 (`9245dae`) and 16 (`6474b7f`) done: **0006 steps 10–19 complete** (1024 px check of step 11 for the user); uc4-model on 14 after 13.
   Step 15's display texts are in `uc4-device.md`; three look-only checks added to the look list.
6. 0008 live view (draft, 2026-11-15, with monitor and learn): grill after milestone 2. Before that, one listen session
   (`receivemidi` in a visible pane) answers its questions 1, 4, 5: does the UC4 send anything on a
   setup or group change, on a push button, with Shift; which note forms.

## Open questions for the user

- 0002: symbol `25` = `=` decided (2026-11-14); uc4-model adds it to `NAME_CHARS` with the
  next model task.
- 0006/0007 UI grilling: rounds 1–3 decided (0006 decisions 3–18, 0007
  decisions 1–7); specified and cut into steps 1–9 in 0006 (approved 2026-11-14).



- Faderfox mail draft (0001 decision 14): the display has no small `u` (`u`/`v` = `U`); suggest a
  small `u` for `v` (user, 2026-11-15). Manual corrections (green buttons have no `OFF`; SE18
  group 6 is channel 13; push buttons have no display), the push display nibble's meaning, whether
  the dump format stays stable across firmware, and whether a public editor is welcome.

## Known issues

- [done, 93dff33, 2026-11-15] `openLibrary` hang while another tab holds the IndexedDB database: close on
  `onversionchange`, 4 s open timeout (`openTimeoutMs`) and `onblocked` give a `StorageBusyError` message;
  saveStatus stays `failed`. No memory-storage swap: the blocked path already keeps edits in memory and never
  writes. Found in the step 2 browser test (2026-11-14).

- [needs-triage] Dumps list (user, 2026-11-16): a received dump with the same bytes as a kept one
  shows the kept one's date ("the timestamp seemed wrong"), and the user then exported an older dump
  by mistake. Say "same as the dump of <date>" in the notice and the list. Also: the Export menu and
  the Dumps list's Export share a name; the user saved a setup JSON when a `.syx` was meant. For 0006
  checklist item 13, with milestone 3.
- **Milestone 3 built (2026-11-16):** `.syx` export (0007 step 3: `7e6aa22` engine 0.9.0, `7adfe30`,
  `b2bff89`). Browser: Export all as .syx on factory = byte-identical factory SndA (100,640 bytes);
  kept SE16 Sndc unchanged → plain name, identical; Acc3→Acc1 → engine-named file, 2 wire bytes;
  group-4 name → refusal naming the 4 characters, JSON instead works; SE01 without a kept Sndc →
  decision 16 message; Dumps list "Export dump". Open: the user's check of "same as the dump of …"
  on a received duplicate; a duplicate *file* import doesn't say it yet ([needs-triage], small).
  Group names beyond g1/g2 char 1 still refuse until the name session (in work).
- [needs-triage] Layer purity by lint: an ESLint rule banning DOM globals and app/midi imports in
  `src/protocol` and `src/model` (reviewer idea). Own small step, likely with 0004.
- `npm audit`: moderate deepmerge (via vite-plugin-svelte, no fix) and a minimatch DoS in the
  typescript-eslint chain. Dev-only; check again on the next dependency update.

## Decisions

Decided by the user and still governing future work: see 0001 "Decisions" (2026-11-13).
