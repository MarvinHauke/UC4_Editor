# Feature plans

Design drafts for the UC4 Editor: the input to grilling (`CLAUDE.md`, "Feature lifecycle"). Each
states the problem, a proposed design and its open questions. After `/grill-with-docs` the answers
live in the plan's decisions and in [GLOSSARY.md](GLOSSARY.md); `/to-spec` gives the plan the spec
shape, `/to-tickets` its numbered steps ([skills workflow](../agents/skills-workflow.md)). The working state is in [STATUS.md](STATUS.md); a
new plan starts from [TEMPLATE.md](TEMPLATE.md). Owned by the architect.

Stages: **draft** → **grilled** → **decided** (spec + steps) → **in work** → **built**.

## Index

| # | Plan | Stage | Owner |
|---|---|---|---|
| [0001](0001-architecture.md) | Architecture: JSON master, versioned protocol engine, phases | decided in the design talk; open questions to grill | architect |
| [0002](0002-configuration-schema.md) | UC4 Configuration Schema (`uc4-config`) | built | uc4-model |
| [0003](0003-sysex-research.md) | Learning the dump format from real dumps | draft | uc4-protocol |
| [0004](0004-protocol-engine.md) | Protocol engine: parser, decoder, encoder, raw layer | built (engine 0.10.0) | uc4-protocol |
| [0005](0005-web-midi-transfer.md) | Web MIDI: receive and send dumps | built: receive, send and restore (milestone 4, 2026-11-18, steps 1–17) | uc4-protocol |
| [0006](0006-editor-ui.md) | Editor UI | built through step 25 (Copy / Paste, Reset all, help line, key help); command mode an idea | uc4-ui |
| [0007](0007-files-and-backup.md) | Files: `.json`, `.syx`, `.zip` archive, local library | milestone 3 built; Files toolbar built (step 5); `.zip` archive open | uc4-model |
| [0008](0008-live-view.md) | Live view: values from the controller; the ARS test rig brief | draft, to grill | uc4-ui, uc4-protocol |
| [0009](0009-user-guide.md) | User guide (Zensical, annotated screenshots) | built (steps 1–6); hosting open | uc4-docs |
| [0010](0010-ux-pass.md) | UX pass: audit as a newcomer, ranked barriers, fixes | decided (Q36–Q40); steps 1–2 in work | architect, uc4-ui |
| [0011](0011-public-release.md) | Public release: editor and guide on GitHub Pages, public repo | decided (Q41–Q46); steps 1–5 in work | architect, uc4-ui, uc4-docs |
| [0012](0012-onboarding.md) | Onboarding: the six areas in the guide and a first-run tour | built locally; waits for the user's try-out | uc4-ui, uc4-docs |

## Next, in dependency order

1. ~~Scaffold~~ — done 2026-11-13 (`087bef4`).
2. ~~0002 types, defaults, validation~~ — built 2026-11-13.
3. ~~0003 first dump session~~ — done 2026-11-13.
4. 0006 editor on the model + 0007 JSON import/export and the local library. **Milestone 1: a
   working JSON editor, no MIDI.**
5. 0005 receive (listen only) + 0004 decoder (0004 built 2026-11-15) → import a `.syx` or a live dump and view it.
   **Milestone 2: read the device.** Built 2026-11-15.
6. 0004 encoder with byte-identical round trip → `.syx` export. **Milestone 3: write files.**
7. 0005 send, behind the safety rules → **Milestone 4: write the device.** Built 2026-11-18.
8. 0009 user guide, then the hosting decision and the mail to Faderfox.
9. 0007 `.zip` archive.
10. 0008 live view (after milestone 2; also feeds the device trainer).
Later (0001 phases 2–3): backend, other Faderfox devices.
