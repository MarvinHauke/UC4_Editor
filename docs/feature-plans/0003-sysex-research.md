# 0003 — Learning the dump format

_Status: framing and fields documented from dump session 1 (step 3 done); open rows listed in `uc4-sysex.md` §9._
_Owner: uc4-protocol (analysis), architect (dump sessions with the user) · Depends on: 0001_

## Problem

The manual says the UC4 sends one setup (`Sndc`) or all setups (`SndA`) as SysEx and receives them
(`rEc`), but not what the bytes mean. Without that there is no decoder or encoder.

## Method

1. **Backup first**: the user sends `SndA` of the real setups; it is stored in `dumps/` (committed while the repo is private, 0001 decision 18).
2. **Scratch setup**: the user names one setup they don't need (e.g. `SE16`). It may be reset with
   `rESc`.
3. **Baseline**: reset the scratch setup, `Sndc` → fixture `base`.
4. **One change per dump**: the architect lists the changes, e.g.
   - `Enc1` number `n008` → `n009`; → `n127`; channel `Ch16` → `Ch01`
   - `Enc1` type each of `CCr1 CCr2 CCAb PrGC CCAh Pbnd AFtt`; mode `Acc0`…`Acc3`; display `OFF Std bPoL`
   - `Enc1` lower `L001`, upper `U126`
   - the same for `Enc8`, `Pbt1`, `btn1`, `FAd1`, `FAd9` (to find the stride between controls)
   - group 2 instead of group 1 (stride between groups); a group name change
   - the same setup sent from a second slot (does the slot number appear in the dump?)
   - routing change (is global state in a dump?)
   After each change: `Sndc` → fixture named after the change.
5. **Diff**: `tools/` compares two dumps (offset, old byte, new byte; framing aware once known).
6. **Write it down**: `docs/protocol/uc4-sysex.md` — framing (F0 … F7, manufacturer id, device id,
   message types), length, per-field offset, encoding (7-bit packing, nibbles, …), checksum, with
   confidence and fixture names.
7. **Prove it**: the decoder reads every fixture to the expected model; the encoder reproduces every
   fixture byte for byte; a final check sends a generated scratch setup to the device (needs the
   user's yes) and reads it back with `Sndc`.

## Decisions

1. Confidence levels `confirmed` / `likely` / `unknown`; only `confirmed` is encoded (CLAUDE.md).
2. Fixtures carry a `.json` note: firmware, slot, what changed from which fixture, date.
3. **Capture with `receivemidi`** (Geert Bevin, v1.6.2; user, 2026-11-13), CLI first, the browser
   device page later. It only listens: `receivemidi dev "<UC4 port>" syf dumps/<name>.syx` writes
   the incoming SysEx straight into a `.syx` file; `receivemidi list` names the ports. `tools/` adds
   only the parts it lacks: a note per dump and the diff. No npm MIDI dependency. Installed in
   `~/.local/bin` from the notarized macOS release (Homebrew's formula needs full Xcode). Its
   siblings `sendmidi` 1.4.4 (can send `.syx`) and `routemidi` 1.0.1 are installed the same way
   (user, 2026-11-13: the restore path must exist before any reset, and the user wants to learn
   them). Installing them allows no send: every send to the UC4 still needs the user's yes for that send.
   Each runs in its own tmux pane the user can watch, never as a hidden background job.
4. **SE16 is the scratch setup** for dump sessions (user, 2026-11-13): it may be changed freely
   and reset with `rESc`. No other setup is changed or reset.
5. **Factory data as known content** (user, 2026-11-13): the factory contents of all 18 setups are
   known (`docs/reference/uc4-device.md`), and 17/18 are deliberately irregular (channels 13/14
   mixed, per-group CC numbers, `EXt`, `SnAP`, names like `traC`). A factory `SndA` lets the diff
   tool place fields as `likely` (channel = setup number in 1–16, rising numbers per group, the
   group-name characters). A field becomes `confirmed` only through a one-change fixture pair on
   SE16, as before; for a field that repeats per control, a pair on the first and the last control of
   a kind (`Enc1`, `Enc8`) confirms it for the whole kind through the stride. Why: it turns the
   dump sessions from searching into checking a guess, without weakening "never guess the protocol".
6. **REA only as a fallback** (user, 2026-11-13): [morluto/rea](https://github.com/morluto/rea), an
   MCP for reverse engineering binaries, is not installed. It becomes an option only if a checksum
   or packing can't be worked out from diffs (then on the UC4 firmware, if Faderfox publishes it).
   Why: diffs are cheaper for a data format, and it is a new tool.
7. **Hint from Faderfox's EC4 script** (`Faderfox_Universal_2`, the user's Ableton User Library,
   2026-11-13; it is the EC4's script, not the UC4's): its SysEx starts `F0 00 00 00 4E 2C <id>`,
   the low nibble of `<id>` being the device (`1B` → 11 = EC4), and it carries every byte as a
   command byte `4x` followed by two tagged nibbles `2h 1l` (`4D 22 1D` = character `0x2D`). Its
   setups 13/14 use channels 13/14 (`CH1 = 12`, 0-based) as on the UC4. For the UC4 dump this is a
   guess to check first (`likely` at best), never a confirmed field.
8. **Combined dumps for fields whose place is known** (user, 2026-11-13, "if it doesn't make it
   harder to follow"): one dump may carry up to 3 changes on *different* controls, but only for
   properties whose field and nibble are already confirmed on another kind (channel, number,
   lower, upper, mode/display). A combined dump confirms each change only if exactly the predicted
   bytes changed and nothing else; any other byte → that part is repeated as a single-change dump.
   New codes (types, LED, characters) stay one change per dump. Why: about 15 dumps instead of 40,
   with the same evidence per field.
   Group-name characters too, one per dump (user, 2026-11-13, Q15: the safer reading). **Exception (user, 2026-11-16):** the group-name session used two combined dumps (groups 1–4, then 5–8), for names only.
   An extra byte on a field confirmed elsewhere, at an address none of the predicted changes can
   hit, is an accident to note, not a reason to repeat (architect, 2026-11-13, dump 9.1: `FAd8`
   upper bumped back to `U127`). Why: it can't be confused with any of the dump's changes.
9. **Factory dumps may be fixtures** (architect, 2026-11-13): a dump of factory data of any slot
   (here the `SndA` after `rESA`, `factory-SndA.syx`) may go to `tests/fixtures/sysex/`, not only
   scratch-setup dumps. Why: it holds no user data, and it is the reference for the decoder and for
   `factorySetup`. The user's own setups stay in `dumps/`.
10. **Faderfox's documentation** (architect, 2026-11-25, from the 0011 review): the maker's own list of the device's
    characters confirms name code `o` without a fixture pair, since a pair would only show the same. Otherwise
    Faderfox's documentation (private, not in the repo) is documentation: it sets areas, framing and meanings, but a
    field the encoder writes still needs a fixture pair.

## Open questions

- ~~Is an `SndA` dump the 18 single dumps in a row, or its own format?~~ Its own: one message, 430 records (`uc4-sysex.md` §1, 2026-11-14).
- **Copy test, 2026-11-16 (device behaviour, evidence only; `likely`, one run each).** `CPYS` SE01 → `PStS` SE16 acts only
  when the push is held until the bars run, and a `PStS` is stored only when setup mode is left. The copy clipboard is a
  19th slot at the setup-19 addresses (names `0x16C0`, fader 9 `0x1B80`, block `0x7600`–`0x7AFF`), empty (`FF`) after
  `rESA`, part of every `SndA`; the first round's `FF`/`7F` setup was a paste of the empty clipboard. Details and the
  engine's handling: `uc4-sysex.md`, "Copy and paste"; evidence: `dumps/2026-11-16-copytest.md`. No field confidence changes.
- Ask Faderfox: decided, in parallel with the sessions (0001 decision 14). Mail draft to come.

## Steps

1. ~~Capture tool and diff tool (uc4-protocol)~~ — done 2026-11-13 (`a5fba28`): `receivemidi`
   for capture, `node tools/uc4-dump.ts info|diff|note`; backup, `Sndc` series and the SE16 `base`
   fixture (`cd2ada0`) taken.
2. ~~Dump session 1 (user + architect)~~ — done 2026-11-13: batches 1–9 on SE16, then `rESc`;
   the reset dump equals `base` byte for byte. Open: copy to another slot, routing (need the
   user's OK).
3. ~~Framing and the first fields documented~~ — done 2026-11-14 (`docs/protocol/uc4-sysex.md`, with the open rows); the decoder for them is 0004.
