# UC4 Editor

A browser app to edit, back up and restore the setups of a **Faderfox UC4** MIDI controller.
JSON is the master format; the device's SysEx dump is generated from it by a separately versioned
**protocol engine**. Local-first (Svelte 5 + TypeScript + Vite, Web MIDI), no backend.

## Where things are

- `src/model/` — the **UC4 Configuration Schema**: types, factory defaults, validation, migrations.
  `src/model/types.ts` is the contract every other area builds on.
- `src/protocol/` — the **protocol engine**: SysEx parser, decoder (bytes → model), encoder
  (model → bytes), raw dump layer, dump diff. Pure TypeScript: no Svelte, no DOM, no Web MIDI.
- `src/midi/` — Web MIDI access, device detection, SysEx transfer (receive and send).
- `src/storage/` — JSON import/export, `.syx` files, `.zip` archives, local persistence.
- `src/app/`, `src/components/` — the Svelte app (editor, setup library, device page).
- `schema/` — the JSON Schema published for `uc4-config` files.
- `tests/fixtures/sysex/` — real dumps from the device with a note of what was changed on it.
- `tools/` — command-line helpers (dump capture, dump diff).
- `docs/reference/uc4-device.md` — the facts from the UC4 manual (controls, properties, values,
  factory settings). Use it instead of re-reading the PDF.
- `docs/protocol/uc4-sysex.md` — what we know about the dump format, with a confidence per field.
- `docs/feature-plans/` — design plans; `0001` is the umbrella. A plan holds its decisions (dated,
  with why) and its steps; `README.md` is the index and order, `STATUS.md` the working state,
  `GLOSSARY.md` the shared language: use its words in plans, docs, code and UI. No GitHub issues,
  no ADR folder (as in cmdAbl).
- `docs/guides/` — the user guide (Zensical site, plan 0009); `docs/agents/` — how we work: `skills-workflow.md` (the mattpocock skills) and the agent notes.

## Rules that hold everywhere

- **JSON is the master, SysEx is generated.** A `uc4-config` file never contains SysEx
  interpretation; the current engine decodes and encodes. Old JSON files go through the migrator,
  never through an old engine.
- **Three versions, never mixed:** `schemaVersion` (the JSON shape), `engineVersion` (the protocol
  engine) and the device's firmware version. Every generated `.syx` and backup records the engine
  version that made it.
- **Layers point one way:** UI → storage/midi → protocol → model. The UI never touches bytes; the
  protocol engine never touches Web MIDI, the DOM or Svelte. Everything below the UI is unit-tested.
- **Never guess the protocol.** A byte's meaning is *confirmed* by a fixture pair: two dumps that
  differ by one change made on the device (plan 0003). Faderfox's own documentation (private, never
  in the repo) confirms a field only where it settles it outright (0003 decision 10). The encoder writes only confirmed
  fields. Bytes the decoder does not understand are kept and written back unchanged, so
  decode → encode of a real dump is byte-identical.
- **Raw dumps are kept unchanged** next to their interpretation; a decode never replaces the
  original bytes.
- **Use the device's vocabulary.** Command types, modes, value ranges and names come from
  `docs/reference/uc4-device.md` (`CCr1`, `CCAh`, `Acc0`–`Acc3`, `SnAP`/`JMP`, `btn`/`toGL`, …),
  not from a generic MIDI model. The two group selections are independent: 8 encoder groups and
  8 fader/button groups.
- **UC4 first, not UC4 only:** device specifics sit in a device profile, so another Faderfox device
  can be added without changing the app.
- Nothing throws at a user action: import, decode and transfer failures become messages with what
  to do next.
- Keep plans, README and code in sync in the same change.

## Hardware safety

- **Only the user operates the UC4** (edit mode, setup mode, `Sndc`/`SndA`, receive mode `rEc`,
  resets) and connects or disconnects it.
- **Listening is allowed, writing is not:** once the user has said in this session that the UC4 is
  connected, an agent may receive dumps (`tools/` capture, the device page). Nothing sends SysEx or
  other MIDI to the UC4 unless the user has said so for that send in this session.
- Receiving a dump on the device overwrites its setups. Before any send, the user has a fresh
  `SndA` backup of all 18 setups in `dumps/`. `dumps/` holds the user's real setups and every raw
  capture; it is local only and never committed (the repo is public, 0011 decision 5). Tests that need it skip
  when it is absent.
- Factory resets (`rESc`, `rESA`) are only ever asked of the user for a setup they named as scratch.
- **Write only the three setup areas** (Faderfox, 2026-11-25): group names `0x1480`, crossfader `0x1700`, setup data
  `0x1C00` (Faderfox's UC4 format; setups 19–20 are internal copy slots). Every record the encoder or a send produces
  lies inside them, and the download type is `02` (one setup) or `03` (all), never `01` (firmware). Anything else is
  refused before a byte leaves the editor.

## Agent team

Peer Claude sessions that message each other (`SendMessage`), watchable in tmux:

| Name            | Agent file                    | Model  | Job                                                          |
| --------------- | ----------------------------- | ------ | ------------------------------------------------------------ |
| `uc4-architect` | `.claude/agents/architect.md` | opus   | lead; tasks, plans, contract decisions, dump sessions, tests |
| `uc4-model`     | `.claude/agents/model.md`     | sonnet | Configuration Schema, validation, migration, storage         |
| `uc4-protocol`  | `.claude/agents/protocol.md`  | sonnet | SysEx research, protocol engine, Web MIDI transfer, tools    |
| `uc4-ui`        | `.claude/agents/ui.md`        | sonnet | the Svelte app, its look and its browser checks              |
| `uc4-reviewer`  | `.claude/agents/reviewer.md`  | opus   | read-only review against the plans and the rules above       |
| `uc4-docs`      | `.claude/agents/docs.md`      | sonnet | README, user guide, images (`docs/`) — **on demand**         |

Flow: architect gives a plan step to a builder → builder → reviewer (→ architect for contract
decisions) → builder commits →
short overview with a browser test list (and a hardware test list when the UC4 is involved) to the
architect → the architect runs the browser part → the user gets a short list of what to try by hand,
plus what only they can check (anything on the device).

- **One agent per area.** Tasks name the files an agent owns; before editing, check
  `git diff <file>` and don't touch a file with another agent's uncommitted changes.
  Commit only your own files by path, `git commit -- <files>` (a new file: `git add <file>` right
  before), never a bare `git commit` after staging: the index is shared. No `-A`, no interactive
  `-p`. `src/model/types.ts` is edited by `uc4-model` only.
- Root config (`package.json`, `tsconfig*.json`, `vite.config.ts`, CI) changes only when a task
  names it. **New dependencies need the architect's OK.**
- **The dev server** (`npm run dev`) runs in a tmux pane in the architect's window, started by the
  architect. Others run `npm test` and `npm run build`. Browser checks (the `claude-in-chrome`
  tools against the dev server) run one agent at a time; the architect says whose turn it is.
- **Dump sessions** (plan 0003): the architect writes the user a numbered list of changes to make on
  the device; `uc4-protocol` captures and analyses the dumps. One session at a time.
- **A message to an agent that isn't running** (stopped, or the send fails): send it to
  `uc4-architect` instead, naming the intended agent. The architect starts that agent or handles it.
- **Only the architect pushes or opens pull requests, and only when the user asks.**
- `scripts/agents.sh` opens model, protocol, ui and reviewer in one tmux window `uc4-agents` and
  starts the architect in the current pane, each as a **fresh** session (model from its agent
  file; the agent file, this file and STATUS are the hand-over). `--resume` continues an agent's
  last session instead (ids in `.claude/sessions/`, gitignored): only for unfinished work, since a
  long session reloads its whole history. `scripts/agents.sh docs` adds the docs agent;
  `scripts/agents.sh model reviewer` or `… architect` starts only those.
  `scripts/agents.sh stop ui docs` ends those agents; `stop` alone ends every peer, never the
  architect or the pane it runs in. `scripts/agents.sh status` lists who runs where. Outside tmux
  the script opens (or attaches to) the tmux session `uc4`. `DRY_RUN=1` prints the commands.
- **The architect starts and stops the peers itself** with `scripts/agents.sh`: on-demand agents
  when their work comes up, any builder when its task is done. It tells the user which.

## Feature lifecycle (Matt Pocock's skills)

Every feature runs **draft → grill → spec → steps → build → review → test → ship** with the
`mattpocock-skills`; the full workflow (who starts which skill, where its output goes, the skills
for research, prototypes, dump sessions and triage) is **`docs/agents/skills-workflow.md`**. Read
it before starting a feature.

- User-invoked skills (`/grill-with-docs`, `/to-spec`, `/to-tickets`, `/wayfinder`, `/triage`,
  `/handoff`, …) are started by the user in the architect's pane; the architect says when one is due.
- Agents call the model-invoked ones themselves: the architect `grilling` + `domain-modeling` when
  asked to grill, `writing-for-agents`, `pr`; builders `tdd`, `codebase-design`, `diagnosing-bugs`,
  `research`, `prototype` (ui); the reviewer `code-review`; ui and reviewer the project skill
  `uc4-ui-design` (design principles, the user's taste) on every visible change.
- Builders take a step of a decided plan and work as `/implement` does; no code without one,
  except throwaway prototypes.

## Agent skills

### Issue tracker

Work lives in the feature plans and STATUS, not GitHub issues. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default roles, written as a tag on a STATUS item. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `docs/feature-plans/GLOSSARY.md`; the numbered plans are the decision records. See `docs/agents/domain.md`.

## Workflow

- One branch per topic, pull request into `main`.
- `npm run dev` (dev server), `npm test` (Vitest), `npm run build` (type-check + production build).
