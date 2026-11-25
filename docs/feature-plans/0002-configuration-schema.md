# 0002 — UC4 Configuration Schema

_Stage: built — steps 0–5 done 2026-11-13 (`087bef4`…`bc7c79e`); user review open._
_Owner: uc4-model · Depends on: 0001_

## Problem

A UC4 setup lives only on the device: 264 commands per setup, edited one at a time on a 4-character
display, and gone with a reset. The user has no file to keep, read, compare or edit a setup in, and
every other part of the editor (protocol engine, storage, UI) needs one shared description of what a
setup is.

## Design

### Solution

A **configuration** is a plain `uc4-config` JSON document holding one or more setups in the
device's own words. It can be read and edited by hand (nvim) and holds everything the device lets
the user set, plus editor-only data. The schema module loads any JSON text into a configuration or
a clear refusal, marks value problems without changing anything, creates the factory setups of all
18 slots, applies a type change the way the device does, and saves a configuration back to JSON.
The protocol engine (0004) decodes and encodes against this shape; the UI (0006) shows it.

### User stories

1. As a UC4 owner, I want my setups in a file, so that a device reset can't lose them.
2. As a UC4 owner, I want the file to use the device's words (`CCAb`, `Acc2`, `SnAP`, `toGL`,
   `EXt`), so that what I read matches what the display shows.
3. As a UC4 owner, I want channels counted 1–16 as on the display, so that I don't translate 0-based
   numbers in my head.
4. As a UC4 owner, I want numbers, lower and upper values as plain numbers, so that I can edit them
   in a text editor.
5. As a UC4 owner, I want one file to hold one setup or all 18, so that there is only one kind of
   file to deal with.
6. As a UC4 owner, I want to edit a configuration in nvim, so that bulk changes are fast.
7. As a UC4 owner, I want every control to keep all its values whatever its type, so that switching
   a type away and back brings my lower and upper values back, as on the device.
8. As a UC4 owner, I want a type change to `CCAh` to lower a number above 31 to 31 with a message,
   so that the editor behaves like the device and tells me what happened.
9. As a UC4 owner, I want a file with `CCAh` and number 100 to load with that problem marked, so
   that a file is never changed behind my back.
10. As a UC4 owner, I want a broken file (not JSON, another format, a newer version) refused with a
    message saying what to do, so that I'm never left with a half-loaded configuration.
11. As a UC4 owner, I want value problems listed with where they are (setup, group, control,
    property), so that I can find and fix them.
12. As a UC4 owner, I want sending to the device blocked while problems remain, so that nothing
    invalid reaches the UC4.
13. As a UC4 owner, I want green buttons offered only `notE CC PrGC AFtt`, so that the editor
    offers no type the device lacks.
14. As a UC4 owner, I want push buttons to have no display property, so that the editor shows only
    what the device has (`----`).
15. As a UC4 owner, I want encoder group names limited to the characters the UC4 can show, so that
    a name looks on the device as it does in the editor.
16. As a UC4 owner, I want upper case turned into lower case and `v` into `u` when I type a group
    name, and `k`/`w` refused with a hint, so that typing a name just works.
17. As a UC4 owner, I want a name for each setup ("Live Mixing"), so that I find it in my library.
18. As a UC4 owner, I want notes per setup and a label per control and group ("Cutoff"), so that I
    remember what a control drives.
19. As a UC4 owner, I want labels to travel with a control when it is copied, so that copy/paste
    keeps my meaning.
20. As a UC4 owner, I want fader/button groups to carry only an optional label, since the device
    has no name for them.
21. As a UC4 owner, I want a setup tied to at most one slot, so that editing one never changes
    another slot.
22. As a UC4 owner, I want two setups claiming the same slot reported as a problem, so that a send
    can't overwrite a slot twice.
23. As a UC4 owner, I want the factory contents of every slot (SE01–SE16 and the Ableton setups
    SE17/SE18), so that I can start from them or compare against them.
24. As a UC4 owner, I want files from older versions of the editor to load, so that my backups stay
    usable.
25. As a UC4 owner, I want a saved and reloaded configuration to be exactly what I saved, so that
    files are trustworthy.
26. As a developer of the protocol engine, I want one stable shape with every dump field in it, so
    that decode → encode of a real dump is byte-identical.
27. As a developer of the UI, I want validation results as `{ path, message }`, so that I can show
    each message next to its field.
28. As a developer adding another Faderfox device later, I want the device named in the document,
    so that the profile can change without a new format.

### Implementation decisions

- **One module, the schema module** (`src/model`): types, the published JSON Schema, factory
  setups, validation, migration, the type-change rule, load and save. Pure TypeScript, no DOM, no
  bytes. `types.ts` is the contract the other areas build on; only uc4-model edits it.
- **Public interface** (the test seam, user, 2026-11-13):
  - `load(text) → refused { reason, whatToDo } | loaded { configuration, problems }`. Parses JSON,
    checks `format` and `schemaVersion`, migrates older versions step by step, validates.
  - `validate(configuration) → problems` (`{ path, message }[]`, empty when fine).
  - `factorySetup(slot) → Setup` for slots 1–18, from `docs/reference/uc4-device.md`.
  - `changeType(control, type) → { control, message? }`, applying the device's rules.
  - `save(configuration) → text`: stable key order, so a reload and resave is identical.
- **Document shape** (schema 1). The decisions of rounds 1–2 in one place:

  ```ts
  interface Uc4Config {
    format: "uc4-config";
    schemaVersion: 1;                              // integer, one migration step per increment
    device: { profile: "faderfox-uc4"; firmware?: string };
    createdAt: string; updatedAt: string;          // ISO 8601
    setups: Setup[];                               // 1–n
  }
  interface Setup {
    id: string; name: string; notes?: string;      // editor-only
    slot?: number;                                 // 1–18, at most one setup per slot
    encoderGroups: EncoderGroup[];                 // exactly 8
    faderButtonGroups: FaderButtonGroup[];         // exactly 8
  }
  interface EncoderGroup     { name: string; label?: string; encoders: Encoder[] /* 8 */; pushButtons: PushButton[] /* 8 */ }
  interface FaderButtonGroup { label?: string; faders: Fader[] /* 9 */; buttons: GreenButton[] /* 8 */ }

  // flat: every control holds every property the device has for its kind, whatever the type
  interface Encoder     { label?: string; display: "OFF"|"Std"|"bPoL"; type: "CCr1"|"CCr2"|"CCAb"|"PrGC"|"CCAh"|"Pbnd"|"AFtt"; mode: "Acc0"|"Acc1"|"Acc2"|"Acc3"; channel: Ch; number: V; lower: V; upper: V }
  interface PushButton  { label?: string;                                 type: "OFF"|"notE"|"CC"|"PrGC"|"AFtt"; mode: "btn"|"toGL"; channel: Ch; number: V; lower: V; upper: V }
  interface GreenButton { label?: string; display: "OFF"|"Std"|"EXt";  type: "notE"|"CC"|"PrGC"|"AFtt";        mode: "btn"|"toGL"; channel: Ch; number: V; lower: V; upper: V }
  interface Fader       { label?: string; display: "OFF"|"Std"|"bPoL"; type: "CCAb"|"PrGC"|"Pbnd"|"AFtt";       mode: "JMP"|"SnAP"; channel: Ch; number: V; lower: V; upper: V }
  // Ch: integer 1–16; V: integer 0–127. Arrays: position = control or group number − 1.
  ```

  - Properties are named as the glossary's **properties**: `display` (edit encoder 2; the LED for
    green buttons), `type`, `mode`, `channel`, `number`, `lower`, `upper`.
  - Per kind (decision 2): a property the device doesn't have for a kind isn't in it (push buttons
    have no `display`). Per type (round 1 Q1): all of the kind's properties are always present; the
    UI hides what a type doesn't use.
  - Encoder group `name`: exactly 4 characters from the device's list, stored lower case
    (round 1 Q7).
- **Type change** (round 2 Q11): `changeType` keeps every other property; to `CCAh` it lowers a
  number above 31 to 31 and returns a message. Switching back does not restore it (undo will).
- **Validation** reports, never repairs: array lengths, ranges, enum values per kind, name
  characters, `CCAh` number ≤ 31, duplicate slots and setup ids, ISO dates, unknown fields.
  An all-blank group name is valid (the device allows it).
- **Load** refuses: not JSON, `format` ≠ `uc4-config`, `schemaVersion` newer than the app's, a
  shape no migration can read, a list that is not a list or not its fixed length (decision "Wrong
  list lengths are refused"). Everything else loads and returns its problems (round 1 Q9).
- **Migration**: one step per version; schema 1 is the first version, so the machinery exists but holds no step yet. Old files never go through
  an old engine (CLAUDE.md).
- **Factory setups** come from the reference table in `docs/reference/uc4-device.md`, corrected by
  the device where they differ (SE18 group 6 channel 13; no green button `OFF`). SE17/SE18 hold more
  than the table prints (push buttons `OFF`, `CCr1`/`bPoL` encoders, group 7 green button order):
  those details come from the factory `SndA` after `rESA` (2026-11-13), read byte by byte and
  compared with `factorySetup(1…18)`; a lasting check is 0004's.
- **Bytes stay out**: the configuration holds settings only. Bytes outside the model (e.g. the push
  display nibble) are the protocol engine's business: an encode takes them from the setup's raw
  dump, else from the factory image of its slot (round 1 Q3, 0004).
- The published JSON Schema (`schema/`) is generated from or checked against the types, so the two
  cannot drift.

### Testing decisions

- **One seam: the schema module's public interface** (`load`, `validate`, `factorySetup`,
  `changeType`, `save`; user, 2026-11-13). Tests feed JSON text or configurations in and check what
  comes out. They never call internal helpers or inspect how validation is built, so the inside can
  be reworked freely.
- A good test names the user's situation ("a file with `CCAh` and number 100 loads with one
  problem at its path"), not the code path.
- Covered:
  - `load` with broken JSON, another format, a newer version, an older version (migrated), and
    files with each kind of value problem;
  - `factorySetup` for all 18 slots against every row of the reference table;
  - `changeType` across all types per kind, including `CCAh` lowering and hidden values kept;
  - `save` → `load` round trip identical, and a resave byte-identical;
  - group-name characters: each allowed one accepted, `k`/`w` and others reported.
- Prior art: the fixture tests in `tests/protocol/` (Vitest): data-driven cases from files, one assertion per situation.
- Later, outside this plan (0004): the factory `SndA` captured after `rESA`
  (`dumps/2026-11-13-SndA-after-rESA.syx`), decoded, must equal `factorySetup(1…18)`. It joins the
  schema and protocol seams.

## Decisions

- **One setup, at most one slot** (user, 2026-11-13). To have it in a second slot, duplicate it
  (as `CPYS`/`PStS` does on the device); the copies then change independently. Why: shared setups
  would make an edit change slots the user isn't looking at, and on the device every slot is
  independent. Validation rejects two setups claiming the same slot. A received `SndA` gives one
  setup per slot, even where two slots hold the same content.

- **Editor-only data, all three in the schema from the start** (user, 2026-11-13): a setup
  **name** (required; a received dump gets e.g. "SE03, received 2026-11-13"), **notes** per setup
  (optional) and a **label** per control and group (optional, e.g. "Cutoff"). They live only in
  `.json`/`.zip`, never in a dump. The name is editable in the first UI; notes and labels get their
  editing UI later (0006). Why now: optional fields cost nothing, a later schema change does.

- **Green buttons have no `OFF` type** (user, on the device, 2026-11-13; dump session 1): the
  display offers `notE CC PrGC AFtt`, although the manual lists `OFF` too. The device wins over the
  manual. If a dump ever holds code 0 for a green button, the decoder keeps the byte, writes it back
  unchanged and reports it; it is never shown as `OFF`. Push buttons do have `OFF` (code 0).

- **Push buttons have no display** (user, on the device, 2026-11-13): edit encoder 2 shows `----`.
  The dump's push display nibble is kept raw by the decoder, not part of `PushButton`.

- **Grilling round 1 (user, 2026-11-13)**:
  - Q1 **flat**: every control always holds every property the device has for its kind, whatever
    its type; the UI hides what the type doesn't use. Why: the device keeps hidden values across a
    type change (dump session 1: a type change touched only the type nibble), so switching back
    brings them back, and decode → encode stays byte-identical. A UI setting may later offer to
    reset hidden values; the schema stays flat. Rejected: a union per type (it would drop lower and
    upper on `CCr1`).
  - Q2 numbers as numbers (channel 1–16 as on the display), choices with device names (`CCAb`,
    `Acc2`, `EXt`); the UI adds plain-language help.
  - Q3 bytes outside the model (e.g. the push display nibble): an encode takes them from the raw
    dump the setup was received in, else from the factory image of its slot. The JSON holds only
    settings, never bytes. Why: a received setup sent back unchanged is byte-identical.
  - Q4 `schemaVersion` is an integer (`1`), one migration step per increment. Why: minor/patch
    numbers buy nothing for a file format.
  - Q5 one file format: a `.json` always holds a list of 1–n setups. Why: one reader, editable by
    hand (nvim), complete on its own.
  - Q6 groups and controls are fixed-length JSON arrays (8 groups; 8 encoders, 8 push buttons,
    9 faders, 8 green buttons), position = number − 1, length checked by validation.
  - Q7 group names stored lower case, only device characters (`0`–`9`, `a b c d e f g h i j l m n
    o p q r s t u x y z`, `-` `_` `'` `"`, the bottom+middle symbol, space); the UI draws them as
    7-segment characters; input maps upper → lower case and `v` → `u`, refuses `k`/`w` with a hint.
  - Q8 labels sit in the control or group they name (`"label": "Cutoff"`).
  - Q9 broken files (not JSON, other format, newer `schemaVersion`) are refused with a message;
    value problems are loaded and marked, and sending to the device stays blocked until fixed.
  - Q10 fader/button groups have no device name, only the optional label.

- **Grilling round 2, Q11 (user, 2026-11-13)**: a type change to `CCAh` lowers a number above 31
  to 31, as the device does, and the help line says so; switching back does not restore it (undo
  does). A loaded file with `CCAh` and a number above 31 is marked as a problem (Q9), never
  changed. Why: as close to the device as possible; `CCAh` is a 14-bit CC (MSB 0–31, LSB number +
  32), so 0–31 is the MIDI rule. Rejected: keep the number and block sending.

- **Group-name symbol `25` is `=`** (user, 2026-11-14): the symbol with the bottom and middle
  segments lit is written `=` in JSON. The other symbols already have their ASCII look-alike.

- **Wrong list lengths are refused** (user, 2026-11-13, after step 1): a setup, group or control
  list that is not a list, or not its fixed length (setups ≤ 18, 8 groups, 8 encoders, …), makes
  `load` refuse the file with a message, like a broken file (Q9). Values, enums and names stay
  problems on a loaded configuration. Why: fixed lengths are shape (Q6); the editor and the
  encoder can rely on exactly 8 of each. Rejected: load and mark, which makes every later layer
  handle short lists.

- **Optional `$schema` field** (uc4-model, 2026-11-13, step 5): `Uc4Config` may hold `$schema`, a
  path or URL of the published schema, so a text editor checks the file as the user types. Optional
  and additive: no `schemaVersion` bump, old files stay valid; `save` writes it first. A build older
  than this one would report it as an unknown field. The schema is built from the types' constants
  (`buildSchema`, written to `schema/uc4-config.schema.json` by `tools/uc4-config.ts schema`); a test
  fails when the file and the types differ.

- **Test seam** (user, 2026-11-13, `/to-spec`): the schema module's public interface only.

1. Device vocabulary, not a generic MIDI model (0001, decision 7 and the corrections).
2. Per-kind property sets as in `docs/reference/uc4-device.md`; a property the device doesn't have
   for a kind isn't in the type.

## Open questions

- **The bottom + middle symbol in a group name** (device code `25`): no JSON character is agreed, so
  validation refuses it for now. Decide the character before a received dump that uses it is
  decoded.
- Global settings (routing, current setup): not in schema 1. Added with a schema step only if a
  dump turns out to carry them (0003, the "routing" dump row).

## Steps

Cut by `/to-tickets` (2026-11-13). All `[ready-for-agent]`.

0. ~~**Scaffold**~~ — done 2026-11-13 (`087bef4`) — uc4-ui (0006 step 1) · blocked by: none · `npm test`/`npm run build` work (Vite,
   Svelte 5, TS strict, Vitest, ESLint; dependency list to the architect first); the protocol tests
   run under Vitest.
1. ~~**Tracer: a factory setup as a file**~~ — done 2026-11-13 — uc4-model · blocked by: 0 · the whole document shape,
   `factorySetup` for SE01–SE16, `save`/`load` with the refusals, the migration machinery (no step yet, schema 1 is the first version), and
   `tools/uc4-config.ts factory <slot>` / `check <file>` · try: open SE03 in nvim, `check` it.
2. ~~**Validation with paths**~~ — done 2026-11-13 — uc4-model · blocked by: 1 · every value problem as `{ path, message }`
   · try: `number: 200` or name `kick` in nvim, `check` shows where.
3. ~~**SE17/SE18**~~ — done 2026-11-13 — uc4-model · blocked by: 1 · Ableton factory setups; test against every row of the
   reference table for all 18 slots.
4. ~~**Editing rules**~~ — done 2026-11-13 — uc4-model · blocked by: 1 · `changeType` (hidden values kept, `CCAh` → 31 with
   a message), group-name input (lower case, `v` → `u`, `k`/`w` refused).
5. ~~**JSON Schema**~~ — done 2026-11-13 — uc4-model · blocked by: 2 · `schema/` checked against the types · try: `$schema`
   in the file, nvim's JSON language server flags errors while typing.

## Out of scope

- Bytes and the dump format: decoding, encoding and the raw dump layer (0004).
- Files, `.zip` backups and local persistence beyond `load`/`save` of JSON text (0005).
- The editor UI, the help line and the 7-segment drawing (0006).
- Undo (comes with the UI).
- Global device settings (routing) and firmware files.
- Devices other than the UC4 (the `device.profile` field keeps the door open).
