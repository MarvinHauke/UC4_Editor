# 0001 — Architecture

_Stage: decided in the design conversation (2026-11-13); the open questions below still need a
grilling round._
_Owner: architect_

## Problem

The UC4 is programmed on the device, one property at a time on a 4-digit display. The user wants
to edit complete setups comfortably in a browser, keep them as files, and move them to and from the
device — above all **export and import complete setups**.

## Decisions

1. **A local browser app**: Svelte 5 (runes) + TypeScript + Vite, no SvelteKit (user, 2026-11-13,
   replacing React); works offline; no backend in phase 1
   Chromium desktop first, because Web MIDI with SysEx is needed. Why: encoding
   works without a network and nothing about the user's setups leaves the machine; a desktop app or a
   server were the alternatives.
2. **JSON is the master format** (`uc4-config`), SysEx is a generated exchange format. Old JSON
   files stay usable: they are migrated to the current schema and the **current** engine encodes
   them — "a fresh interpretation" (user, 2026-11-13). A `.syx` export is for local backups. Why not
   store `.syx` as the master: a file would then carry the interpretation of the engine that made it.
3. **Three separate versions**: `schemaVersion` (JSON shape), `engineVersion` (protocol engine),
   the device's firmware. Every generated `.syx` and backup records the engine version.
4. **The protocol engine is its own module** (`src/protocol/`), pure TypeScript, no UI. Its parts:
   parser (bytes → frames and fields), decoder (→ model), encoder (model → bytes), validator,
   migrator (in `src/model/`), serializer (files, in `src/storage/`). Names: *UC4 Configuration
   Schema*, *UC4 Protocol Engine*, *SysEx parser/decoder/encoder* — not "interpreter".
5. **Raw dump layer**: a received dump is stored unchanged first; the interpretation is shown as
   JSON; export can use the original or a regenerated dump; the two can be compared.
6. **Learn the format from real dumps** (plan 0003): the manual describes how to send and receive,
   not the bytes. Controlled one-change dumps, byte diffs, round-trip tests. **Only confirmed fields
   are encoded**; every other byte is copied from the raw dump the encode started from, and decode →
   encode of every fixture is byte-identical. Why not a best-guess format: a wrong byte sent to the
   device overwrites the user's setups.
7. **Two independent group selections** (encoder groups, fader/button groups) in model and UI.
8. **UC4 first, not UC4 only**: device specifics in a device profile.
9. **Exports**: configuration `.json`, SysEx `.syx`, complete backup `.zip` (0007).
10. **Order**: first the JSON foundation and editor, then SysEx exchange (user, 2026-11-13).
11. **A setup library**: any number of named setups, each optionally assigned to a slot, plus an
    18-slot device view (user, 2026-11-13). Why: setups outlive the slot they happen to be in.
12. **English UI in the device's words** (`CCr1`, `SnAP`), strings translatable for German later,
    **with help texts and an interactive help view** (user, 2026-11-13; design in 0006).
13. **The editor teaches the device**: for each control it can show how to set it up on the UC4 by
    hand, without the web app (user, 2026-11-13; 0006).
14. **Learn the format and ask Faderfox, in parallel**: dump sessions start now; a mail to Faderfox
    may save work or confirm findings, but nothing waits for it (user, 2026-11-13). A Faderfox
    answer still needs a fixture pair before a field counts as confirmed.
15. **The manual is not in the repo**: `docs/reference/uc4-device.md` cites its version and links
    to faderfox.de (user, 2026-11-13). Why: the PDF is Faderfox's. The same holds for Faderfox's
    scripts and firmware: read them, write down facts, never commit them.
16. **Firmware 02.05** is the version the fixtures are taken with (user, 2026-11-13).
17. **Svelte instead of React** (user, 2026-11-13): the user knows Vue and Svelte; Svelte 5's runes
    suit a device view of many small controls that each follow one value; the official Svelte MCP
    (`.mcp.json`) gives the agents current docs and an autofixer. No SvelteKit: no server, no
    routing to speak of. Patterns worth borrowing from the user's NerdSEQ editor
    (`../mappingeditor`, Vue 3): undo/redo as command objects, MIDI learn, slot persistence.

Corrections to the first draft from the conversation (the ChatGPT v0.1 sketch, not in this repo):
its "neutral" MIDI model (`Absolute/Relative 1/Relative 2/14-bit`, `Jump/Pickup/Snap`, Pitch Bend
on buttons, no display scale) doesn't match the device; 0002 uses the manual's properties
(`docs/reference/uc4-device.md`), because the neutral model can express states the device can't
hold and misses ones it can, which would make encoding lossy. Its sketch is not reused as code.
18. **The repo is private** (user, 2026-11-13; GitHub `MarvinHauke/UC4_Editor`): the dump format is
    worked out from the device, and the user wants to show the editor to Faderfox before anything
    about it is published. Publishing (repo, docs, the protocol notes) is the user's decision
    later, ideally after talking to Faderfox (decision 14). While private, `dumps/` is committed:
    the user's backup of all 18 setups and every raw capture the fixtures were cut from (user,
    2026-11-13, Q16: the work should be backed up). **Before the repo goes public, `dumps/` leaves
    git** (history included), since it holds the user's personal setups.
19. **The repo is public** (user, 2026-11-25; plan 0011): Faderfox agreed to publication. The public repository
    `MarvinHauke/UC4_Editor` starts from a clean first commit; the history before it, with `dumps/`, stays in the
    private `MarvinHauke/UC4_Editor-workshop`. Replaces decision 18 from that date: `dumps/` is local only.

## Layers

```text
src/app, src/components   (Svelte)          — UI, state = a model document
        │
src/storage   src/midi                       — files, local library │ Web MIDI ports, receive, send
        │          │
src/protocol                                 — parse, decode, encode, diff, raw dumps (pure)
        │
src/model                                    — types, defaults, validation, migrations (pure)
```

Imports only point down. `src/protocol` and `src/model` have no browser APIs, so they also run in
Node for `tools/` and tests.

## Phases

- **Phase 1 — local web app** (now): editor, JSON, engine, Web MIDI, files.
- **Phase 2 — optional backend**: preset library, sync, sharing, engine distribution. Only when
  needed.
- **Phase 3 — more devices**: other Faderfox controllers, firmware variants.

## Open questions

- None open here; the schema's are in 0002, the UI's in 0006.
