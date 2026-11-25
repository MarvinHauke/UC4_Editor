# 0007 — Files and backup

_Stage: steps 1–3 built (step 3 = milestone 3, 2026-11-16); step 4 draft (own milestone)._
_Owner: uc4-model · Depends on: 0002, 0004 for `.syx`_

## Problem

Setups must survive a browser reset and move between computers; the user wants complete exports
and imports.

## Design

- **Local library**: IndexedDB (localStorage is too small for raw dumps); saved on every change;
  a visible "saved" state. Browser data can be lost: the UI reminds to export.
- **`.json`**: a whole document or one setup; import validates and migrates, then asks before
  replacing (or adds to the library).
- **`.syx`**: export one setup or all 18 via the engine (when it can encode); import → raw dump →
  decode.
- **Archive (`.zip`)**: `configuration.json`, `device.syx` (the original raw dump if one exists, else
  generated), `metadata.json` (app, schema and engine versions, firmware, date, SHA-256 of each
  file), `README.txt`. Import restores the library and keeps the raw dump.

## Decisions

UI grilling round 3 (user, 2026-11-14), for milestone 1 (steps 1–2):

1. **First start**: the library holds the 18 factory setups (`factorySetup(1…18)`).
2. **Export**: the whole configuration (`uc4-config-YYYY-MM-DD.json`) or the selected setup (a file
   with one setup, slot kept). **`.syx` export** comes with step 3, once the 0004 encoder exists;
   it writes only confirmed fields over a raw base. Not in milestone 1.
3. **Import**: a whole file replaces the library after asking; the dialog offers "export first"
   only when the library has changes that are not in the last export. A one-setup file goes to
   its slot; an occupied slot asks "replace, or another slot?" (default: the file's slot). Every
   import can be undone.
4. **Problems**: a loaded file with value problems is marked on its controls and in the property
   panel; the status bar shows the count and steps through them. Broken files are refused (0002).
5. **Setup names** are the editor's own, renamed in the library list; the list shows slot, name,
   problem count and a dot when the setup differs from factory.
6. **Reset to factory** per setup (asks, undoable, editor only, nothing sent). Per group too, and
   copy/paste of setups and groups (user): reset per group in milestone 1, copy/paste with the
   bulk edits (0006 step 3) — architect's cut, the user may move it.
7. **Undo history** is in memory, gone after a reload. An undo tree is a later idea, possibly
   coming from the JSON/nvim side.

Milestone 3 grilling round 1 (user, 2026-11-16):

8. **`.syx` export** of one setup (`Sndc`) and of all 18 (`SndA`), both in the Export menu next to
   JSON (Q1).
9. **Base bytes**: a setup that came from a kept dump is encoded on that dump; any other on the
   factory `SndA` (Q2).
10. **Engine version in the file name** (`uc4-SE01-2026-11-16-engine0.7.0.syx`), nothing of ours
    inside the SysEx: unknown bytes could upset the device. Where the format could hold metadata
    is a question for Faderfox (the mail draft) (Q5).
11. **`.zip` backup** (step 4) is its own milestone after `.syx` export, with a short Markdown
    overview of the setups in the archive; `fflate` as the dependency is to be OK'd then (Q7).

12. **Unconfirmed fields refuse the `.syx`** (Q3): an edit to a field that is not `confirmed`
    gives no file; the dialog names the controls and fields and offers JSON. The blind spots are
    closed by dump sessions instead (fader 9 done 2026-11-16, engine 0.8.0; group names next).
    Narrowed in the 3.2 review (2026-11-16): a setup with values marked unreadable is refused only
    when it has no dump it came from; with that dump the raw byte is copied unchanged.
13. **Own slot only** (Q4): a setup is exported at its own slot; a setup without one exports JSON
    only, with a note. Slot moves wait for a send test (0005, send part). Copy and paste between
    setups and groups in the editor is model work (0006 step 3) and doesn't wait for it.
14. **Read back before saving** (Q6): the file is parsed and decoded again and compared with the
    setup; on any difference there is no file and the message says what differs.
15. **Sending, when it comes** (user, 2026-11-16): only what is confirmed, one change per send,
    checked by a `SndA` afterwards; first in the setup's own slot (SE16), a slot move only later.

16. **A `Sndc` needs a kept `Sndc` of its slot** (architect, 2026-11-16, from the 3.2 review): the
    engine builds a `Sndc` only on a `Sndc` base (0004 decisions 5 and 15). "Export SEnn as .syx"
    works for a setup linked to a kept `Sndc` of its own slot; otherwise it stays offered and its
    message says what to do: send SEnn from the UC4 once (`Sndc`), or export all as `.syx`, or as
    JSON. Building a `Sndc` from a `SndA` or the factory image waits for the send test, like slot
    moves.

Files UI grilling (user, 2026-11-16; Connections side in 0005 decisions 11–16):

17. **Two sections by where the data goes** (Q1): **Files** (computer ↔ editor: Import, Export,
    later the `.zip`) in the top toolbar; the UC4 in the **Connections** column (0005 decision 11).
    Why: sorting by format mixed files and the device, and "Export .syx" read like a send.
18. **Words** (Q2, glossary): *Export/Import* only for files, *Send/Receive* only for the UC4; no
    "save", "download", "load". "Backup" means only the `.zip` (Q4): the `.json` help says
    "configuration", the status bar keeps "last exported".
19. **One `Import…`** for `.json` and `.syx`, read by content (Q5).
20. **One `Export ▾` menu ordered by scope** (Q3, Q8), replacing `Export all`, `Export SEnn` and the
    `Export .syx ▾` menu. Headings **All setups** and **SEnn**; entries one word with the format as a
    grey hint: **Configuration** `.json`, **Dump** `.syx`, later **Backup** `.zip`. An entry not built
    yet is hidden. "Dump", not "configuration", for the `.syx`: the glossary keeps the two apart.
21. **Toolbar**: `Import…  Export ▾ │ ↶ ↷`, a divider before undo/redo (Q11).
22. **The `.zip` is the Archive** (user, 2026-11-19, 0009 Q34): "Backup" means the `SndA` the editor
    keeps for Restore, the word the app already shows. This replaces "Backup" for the `.zip` in
    decisions 11, 18 and 20; the Export menu's later entry is **Archive** `.zip`.

## Open questions

- A zip library is a new dependency (e.g. `fflate`); architect's OK.

## Steps

1. JSON import/export with validation and migration. 2. IndexedDB library.
3. `.syx` read/write (bytes only; meaning is 0004). Read is done (0005). Write, milestone 3
   (decisions 8–14), in three steps, each blocked by the one before:
   - **3.1 Per-setup base in `encode`** (uc4-protocol, done `7e6aa22`, engine 0.9.0): each `{ slot, setup }` may carry the raw
     dump it came from; the engine takes that slot's three regions from it before patching, so a
     `SndA` built from setups of different dumps keeps every setup's unknown bytes. Same slot
     only (else `slot-move-unconfirmed`). Tests on the fixtures; engine minor bump.
   - **3.2 `.syx` export in the library** (uc4-model, done `7adfe30`): `exportSetupSyx(setupId)` (`Sndc`) and
     `exportAllSyx()` (`SndA`, slots 1–18), base per decision 9, refusals per decisions 12–13 as
     messages in the device's words (control, group, property), read back per decision 14, file
     names per decision 10 (an unchanged kept dump keeps its plain name). `keepDump` also says
     when a received dump equals a kept one (`duplicateOf` with its date).
   - **3.3 Export menu and messages** (uc4-ui, done `b2bff89`, browser-tested 2026-11-16; the entries sit in an "Export .syx" menu beside the JSON buttons): "Export SE01 as .syx" and "Export all as .syx"
     beside the JSON entries; the refusal dialog with the fields and "Export as JSON instead";
     the Dumps list's button becomes "Export dump"; the notice and the list say "same as the
     dump of <date>" (STATUS finding 2026-11-16). Browser test list with the fixtures.
4. Archive `.zip` (own milestone, decisions 11, 22).
5. **Files toolbar** — done 2026-11-16 (`39324d1`, browser-checked by the architect at 1280 and 1024 px; downloads left to the user) (uc4-ui, decisions 17–21) · blocked by: none · the `Export ▾` menu replaces the
   three export buttons (same flows, refusal dialog and file names as 3.3); help texts in the new
   words (no "backup" for `.json`); the divider; the kept-dump and notice button reads `Export .syx`
   (0005 decision 13). With it: the setup list's rename field is cramped (user's screenshot,
   2026-11-16: the input touches the slot label and runs past the row): give it room inside the row.
   Browser test list: every export still downloads the same file as before; menu by keyboard.
