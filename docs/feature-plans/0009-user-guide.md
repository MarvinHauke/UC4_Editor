# 0009 — User guide (Zensical)

_Stage: built (steps 1–6, 2026-11-19; last `ab52ad4`) — hosting open, then the mail to Mathias._
_Owner: uc4-docs · Depends on: 0005, 0006, 0007 (what the guide describes)_

## Problem

The editor can read, edit, send and restore UC4 setups, but nothing tells a UC4 owner how. Before
the editor is shown to Faderfox (a mail to Mathias), it needs a guide a new user can follow alone,
with pictures of the real editor that point at what each paragraph explains.

## Design

A static site built with [Zensical](https://zensical.org/) from `docs/guides/`, previewed locally.

- **Pages** (English, for UC4 owners):
  1. **Getting started:** open the editor, a browser with Web MIDI (Chrome, Edge), allow MIDI
     access, connect the UC4.
  2. **The editor:** device view, the two group selections, property panel, setup list, help line.
  3. **From and to the UC4:** receive (`Sndc`, `SndA`), kept dumps, send with the `rEc` guide,
     Restore. Opens with the warning that a send overwrites a setup and how to make a `SndA` first.
  4. **Files:** import, export (`.json`, `.syx`).
  5. **Copy / Paste, Reset, Library.**
  6. **Keys:** the table from `src/app/keyTable.ts`.
  7. **How it works:** the dump format as far as we know it, with the confidence per field, and
     what the UC4 does with a damaged dump (`Err`, half-written setup). From
     `docs/protocol/uc4-sysex.md` and the session notes in `dumps/`.
- **Annotated screenshots:** a script per picture opens the editor, sets up the state (which setup,
  which panel, which control selected), draws numbered markers and an accent outline into the page,
  and saves a PNG. The page lists the numbers under the picture. All pictures can be retaken after a
  UI change with one command.
- **Isolation:** the shots run in their own browser profile against a server on port 5174, with a
  demo library loaded from a fixture and Web MIDI replaced by a stub. The user's real library (the
  browser profile at 5173) and the real UC4 are never touched.

## Decisions

1. Audience: UC4 owners; the editor is presented as a UC4 editor only. The later virtual
   controller idea stays out of the guide. (user, 2026-11-19, Q30)
2. The seven pages above, in English. (user, 2026-11-19, Q30)
3. Zensical builds from `docs/guides/` only: `zensical.toml` in the root with
   `docs_dir = "docs/guides"`. Everything else in `docs/` stays internal and never reaches the
   site. Rejected: moving the internal docs out of `docs/` (many links to fix, and a wrong folder
   would publish internal pages). `skills-workflow.md` moves to `docs/agents/`. (user, 2026-11-19,
   Q31)
4. Zensical is a Python tool, installed with `uv` (`pyproject.toml` and `uv.lock` in the root, a
   dev dependency), never in the app's npm dependencies. `npm run docs` (preview) and
   `npm run docs:build` (site into `site/`, gitignored) call `uv run zensical`. (architect OK as a new
   tool, 2026-11-19, Q31)
5. Highlights are drawn into the page before the shot: numbered circles and an accent outline,
   in the editor's own tokens, with a numbered list under the picture. One script per picture in
   `tools/guide-shots/`, images in `docs/guides/images/`. (user, 2026-11-19, Q32)
6. Shots run with Playwright on the installed Chrome (`channel: 'chrome'`, no browser download), a
   fresh profile, the server on port 5174 and `requestMIDIAccess` replaced by a stub that reports a
   UC4 and records sends without passing them on. Rejected: Claude in Chrome screenshots (they don't
   save files and can't be rerun as a script), and shots in the user's Chrome profile (their real
   library). Playwright is a new dev dependency. (architect OK, 2026-11-19; why: shots that can be
   repeated, and no path to the real library or the UC4)
7. The demo library is a fixture (`tools/guide-shots/demo-library.json`) built from the factory
   setups with a few readable edits. No user setup names, no home path in any picture. (architect,
   2026-11-19)
8. Local only for now. Where the guide and the editor go online is decided before the mail to
   Mathias. If the repo goes public for that, `dumps/` leaves git first (`.gitignore` note,
   0001 decision 18). (user, 2026-11-19, Q33)
9. **Backup** is the `SndA` the editor keeps (the app's word); the `.zip` is the **Archive**
   (0007 decision 22). The guide says "`SndA` backup" or "backup". (user, 2026-11-19, Q34)

## Open questions

- Hosting of the guide and the editor (before the mail; decision 8).

## Steps

1. **Scaffold** — uc4-docs · blocked by: none · `zensical.toml`, `pyproject.toml`/`uv.lock`,
   `npm run docs` and `docs:build`, `site/` and `.venv/` in `.gitignore`, the nav for the seven
   pages with a start page. Checks: `npm run docs:build` clean; `docs/feature-plans/` absent from
   `site/`.
2. **Shot rig** — uc4-docs · blocked by: 1 · Playwright, the MIDI stub, the demo library, the
   marker overlay, `npm run docs:shots` (starts the server on 5174, runs every script). One example
   picture of the device view with three markers. Checks: the rig never opens a real MIDI port
   (stub only); reruns give the same picture.
3. **Getting started + The editor** — uc4-docs · blocked by: 2.
4. **From and to the UC4** — uc4-docs · blocked by: 2 · facts from uc4-protocol (0005).
5. **Files; Copy / Paste, Reset, Library; Keys** — uc4-docs · blocked by: 2.
6. **How it works** — uc4-docs · blocked by: 1 · facts from uc4-protocol, `uc4-sysex.md`, `dumps/`
   notes.

Each page goes through uc4-reviewer before its commit.

## Out of scope

Hosting, a contributor guide, translations, the virtual controller, command mode (not built).
