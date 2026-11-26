# 0011 — Public release on GitHub Pages

_Stage: in work — steps 2, 3, 4, 6 done; 1 (PR #2) with the user; 5 after Q47._
_Owner: architect · uc4-ui (app), uc4-docs (guide) · Depends on: 0009, 0010_

## Problem

The editor and its guide run only on this computer. UC4 owners need one address where they can open the editor and
read the guide, and a public repository they can read, report issues to and contribute to.

## Design

One GitHub Pages site from the public repository `MarvinHauke/UC4_Editor`, two parts built separately and joined
only at deploy:

```text
marvinhauke.github.io/UC4_Editor/          the editor (Vite → dist/)
marvinhauke.github.io/UC4_Editor/guide/    the guide (Zensical → site/)
```

- `npm run build`: the editor alone, Vite `base` = `/UC4_Editor/`.
- `npm run docs:build`: the guide alone, `site_url` = `…/UC4_Editor/guide/`.
- `npm run pages`: joins `site/` into `dist/guide/` (`_site/` or `dist/`), to preview exactly what is deployed.
- `.github/workflows/pages.yml`: editor (test + build) and guide build in parallel, a third job joins and deploys
  with `actions/deploy-pages`.
- The editor links to the guide (`?` key help, Settings); the guide has "Open the editor".
- The notice "Unofficial: not made by, endorsed by or supported by Faderfox" in the editor (Settings / About and the
  first-run area), on the guide's start page and in the README.

## Decisions

1. Editor at the root, guide under `/guide/`. (user, 2026-11-25, Q41)
2. `chore/agent-workflow` goes into `main` (PR #2); the user's Zensical scaffold makes way for the guide of 0009,
   keeping its theme ideas: `navigation.tabs`, `navigation.path`, `navigation.top`, `search.highlight`, `extra.css`
   (cards, notice, rounded code and images). (user, 2026-11-25, Q42; narrowed by 0009 decision 10: no header tabs, no
   path, the notice as an `!!! info` box)
3. A new public repository with a clean first commit, not a rewritten history: a rewrite leaves the old commits
   reachable through PR refs on GitHub. (user, 2026-11-25, Q43, Q45)
4. The old private repository is `MarvinHauke/UC4_Editor-workshop` (archive of the full history and the dumps);
   work continues in the public `MarvinHauke/UC4_Editor`. (user, 2026-11-25, Q45)
5. Never in the public repository: `dumps/`, `decisions.md`, `schema/faderfox*.txt` (Faderfox's documents, user
   2026-11-25), `.claude/sessions/`, the private skill `.claude/skills/ableton-lom`. In it: code, tests, the guide,
   the plans, `CLAUDE.md`, the agent files. Before the first commit every file is checked for the user's name, email,
   private paths and real setup names, and `tests/fixtures/` for real setups. (user, 2026-11-25, Q46)
6. Faderfox's conditions (Mathias, 2026-11-25): the editor is visibly not from Faderfox and not supported by him; it
   writes only the three setup areas (`CLAUDE.md`, hardware safety).

## Steps

1. **Merge** — architect · PR #2 `chore/agent-workflow` → `main` in the workshop; the user merges.
2. **Guide for Pages** — uc4-docs · done (`16e55fd`) · `site_url`, the theme ideas of decision 2, the notice, "Open the editor", the
   editor's address in Getting started.
3. **Editor for Pages** — uc4-ui · done (`b7c6ff1`; book icon in the toolbar in work) · Vite `base`, the guide link from `?` and Settings, the notice.
4. **Build and deploy** — architect · done (`1558fc3`; preview checked) · `npm run pages`, `pages.yml`; a local preview of the joined site.
6. **Faderfox's rules in the engine** — uc4-protocol · done 2026-11-25: the area guard (`c161565`, engine 0.12.0;
   `checkSendable` on encode, cutSlot and sendDump; only `0x1480`, `0x1700`, `0x1C00`, download type 02/03), the
   format checked against Faderfox's documentation (uc4-sysex.md §11), tests without `dumps/` (`039e984`; 3 skip
   when it is absent).
5. **Privacy check and first public commit** — architect · decision 5; then the user enables Pages (Source: GitHub
   Actions) and the first push goes to the public repository.

## Out of scope

A custom domain, versioned releases, the `.zip` Archive.
