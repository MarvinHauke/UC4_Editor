# Other UC4 editors

What two other open-source UC4 editors know, and what we take from them. Read 2026-11-15 (the user
found them). Both are MIT-licensed. **Nothing here is evidence** under our rule (CLAUDE.md, "Never
guess the protocol"): it can point to what to check, but a field is confirmed only by our own
fixture pairs. We copy no code; our engine is stricter (patch on a base, confirmed fields only).

| Editor | Repo | Live | Scope |
|---|---|---|---|
| UC4 SysEx Editor (thegdyne) | github.com/thegdyne/uc4-sysex-editor | thegdyne.github.io/uc4-sysex-editor | `.syx` files of all 18 setups (`SndA`), JSON, no MIDI |
| UC4 Configurator (foxxyz) | github.com/foxxyz/faderfox-uc4-configurator | uc4.ivo.tech | Web MIDI, one setup (always SE01), receive and send, MIDI monitor, live values |

The Configurator thanks "Mathias from Faderfox" for sharing part of the protocol, and both credit
Peter Witzel's Faderfox editor (github.com/privatepublic-de/faderfox-editor) for other Faderfox
devices.

## What agrees with our format doc

Both read the dump the way `docs/protocol/uc4-sysex.md` does: triples `4c 2h 1l`, records with a
16-bit address (`49`/`4A`), 64 data bytes, a 16-bit sum (`4B`/`4C`) and 30 `00` bytes after each
record; group names at `0x1480`, fader 9 at `0x1700`, the setup block at `0x1C00` as 20 fields of
64 bytes in the same order; the same value codes (encoder type 0–6, fader type 0–3, button type
`notE` 1 / `CC` 2, mode and display nibbles).

Where we know more: button `OFF`/`PrGC`/`AFtt` (theirs unverified, ours confirmed), the name
characters (thegdyne: unknown), `Sndc` (thegdyne: not supported), push buttons have no display
(thegdyne says 0 `OFF` / 1 `Std`; our dumps and the manual say no display).

## What is new to us

1. **A generated `Sndc` is accepted by the device** (Configurator): it builds a whole `Sndc` from
   scratch, header cmd `06 02 02 05`, 26 records (names padded with `FF` to 32 bytes, fader 9 to
   64, the 20 setup fields), always at the SE01 addresses, and sends it while the UC4 is in
   receive mode. Not evidence, but it lowers the risk of our first send test (0005) and shows a
   rebuilt message type works (0004 decision 15).
2. **The character table** (Configurator `CHAR_MAP`, code = index):
   `0–9`, then `A b C d E F G H I J L N n O P q r S t U X Y Z - _` (`0A`…`22`). It agrees with
   all our confirmed codes. Its case is a hint at the **shape** on the display; for our look list:
   `e` → `E`, `f` → `F`, `g` → `G`, `h` → `H`, `c` → `C`, `u` → `U`, `q` → `q`, `r` → `r`.
   At `15` it has `N` where the device's list says `m` (the user read `m` on the device): the
   `m` likely looks like a big `N`. To check by looking, not by trust.
3. **Device steps** (Configurator's on-screen guide):
   - send one setup (`Sndc`): hold `Shift`, press `Setup` twice until the Setup LED is on, hold
     encoder 4 (display `Sndc`) until the lines disappear;
   - receive (`rEc`): the same, encoder 7 (display `rEc`) until `rc00` shows.
   For 0005 and the device how-to (0006, ideas); check the wording against the manual.
4. **Live values** (Configurator, plan 0008): it matches an incoming CC or note by channel and
   number in the current group; with no match it searches the other groups and **switches to the
   group it finds** ("Auto-switching to group …"). That suggests the UC4 sends nothing when the
   group changes (0008 question 1), still to be checked in a listen session.
5. **Ideas for the editor** (thegdyne): conflict detection (two controls with the same message),
   paste special (channel or number offset, auto-increment), copy and swap whole setups, an 8×8
   overview grid per kind, a library of ready-made setups (e.g. Elektron Digitakt). Configurator:
   **learn** (move a control of another MIDI device and take its channel and number).
6. **Their files**: thegdyne ships `factory_default.syx` (100,640 bytes, a factory `SndA` from
   another unit, committed to their repo before 2026-01-17). **Compared 2026-11-15 (user's OK): byte-identical
   to our `tests/fixtures/sysex/factory-SndA.syx`** (SHA-256 `b15ed00f…bfebaab`, 0 differing bytes).
   So a factory `SndA` is the same on another unit, header (firmware bytes `02 05`) included: our
   factory asset (0004 decision 5) fits other UC4s with that firmware. It says nothing about other
   firmware versions. Their JSON setups (`uc4-editor-setup`) could be a later import feature.
