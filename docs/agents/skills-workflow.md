# Working with the mattpocock skills

How the UC4 Editor uses [mattpocock/skills](https://github.com/mattpocock/skills) (plugin
`mattpocock-skills`) together with the agent team (`CLAUDE.md`, "Agent team"). Same layout as
cmdAbl: no GitHub issues, no ADR folder. Owned by the architect.

Two kinds of skills:
- **User-invoked** (marked **/**): only you can start them, by typing the command, in the
  **architect's pane** unless a step says otherwise. The architect tells you when one is due.
- **Model-invoked**: agents call them themselves when the task fits.

Where things go (the "tracker" for every skill):

| Artifact | Place |
|---|---|
| Shared language | `docs/feature-plans/GLOSSARY.md` |
| Designs, decisions (dated, with why), specs | `docs/feature-plans/NNNN-*.md` |
| Plan index and dependency order | `docs/feature-plans/README.md` |
| Tickets | numbered **steps** in the plan, each with owner, blockers and checks |
| Working state, frontier, small items, backlog | `docs/feature-plans/STATUS.md` |
| Skill configuration | `docs/agents/` (written by **/setup-matt-pocock-skills**) |

A skill that says "publish to the issue tracker" turns a feature into a plan draft and a small thing
into a STATUS line; only the architect edits `docs/feature-plans/`, other agents send it the text.
Triage state is a tag at the start of a STATUS line, e.g. `[ready-for-agent]`. A skill that says
"write an ADR" writes a dated decision with its reason into the plan's "Decisions". Details:
`docs/agents/issue-tracker.md`, `triage-labels.md`, `domain.md`.

## Once per repo

**/setup-matt-pocock-skills** — done (2026-11-13, copied from cmdAbl `64c91a2`): `docs/agents/` and
"Agent skills" in `CLAUDE.md`. Re-run only to change the tracker.

## A feature, step by step

```
draft ─▶ grill ─▶ spec ─▶ steps ─▶ build ─▶ review ─▶ test ─▶ ship
 arch    /grill-   /to-    /to-     builder  reviewer  arch +   arch
         with-docs spec    tickets  (tdd)    (code-    user     (pr)
                                             review)
```

1. **Draft** — the architect writes `docs/feature-plans/NNNN-*.md` from `TEMPLATE.md` (stage
   *draft*): problem, proposed design, open questions with a recommended answer each.
2. **Grill** — **/grill-with-docs** (`grilling` + `domain-modeling`), or ask the architect "grill me
   on 0002". Rounds of numbered questions; "yes" accepts the recommendation. Facts are looked up by
   the agent, only decisions come to you. Terms land in the glossary as they settle; answers become
   dated decisions in the plan, `(user, 2026-11-13, grilling Q1–Q9)`. It ends when no branch is open
   and you confirm. **/grill-me** is the same without the docs.
3. **Spec** — **/to-spec** rewrites the grilled plan into the spec shape (problem, solution, user
   stories, implementation and testing decisions, out of scope) and confirms the test seams with you.
   Stage *decided*.
4. **Steps** — **/to-tickets** cuts the plan into tracer-bullet steps: vertical slices through model,
   protocol, storage and UI, each demoable, each naming the steps that block it and its owner. It
   quizzes you on granularity. STATUS "In work" lists the frontier (steps whose blockers are done).
5. **Build** — the architect gives each step on the frontier to one builder. The builder reads the
   plan, the glossary and the device facts, and works as `implement` does: `tdd` at the agreed seams,
   type-check and single test files often, the full suite at the end. `diagnosing-bugs` for hard
   failures, `codebase-design` for interfaces.
6. **Review** — `uc4-reviewer` runs `code-review`: **Standards** = `CLAUDE.md` and the plans'
   decisions; **Spec** = the step and its plan. It adds device facts and hardware-safety checks, and
   for a visible change `uc4-ui-design` on uc4-ui's screenshots. The
   builder fixes, commits by path and sends the architect a short overview with a test list.
7. **Test** — the architect runs the browser test list; you get a short "try it yourself" list and
   whatever only you can check (the device).
8. **Ship** — when you ask, the architect writes the PR body with `pr` and opens the PR. The plan's
   finished steps shrink to one line; STATUS keeps only open things.

## Work that isn't a feature

| Situation | Skill | Example here |
|---|---|---|
| Too big or too unknown for one plan | **/wayfinder** — a map with decision tickets in `.scratch/<effort>/` (gitignored); when resolved, the decisions move into the plan and the folder is deleted | the SysEx format (plan 0003) |
| A question for someone else | **/to-questionnaire** | asking Faderfox for the dump format |
| Steps only you can do | `wizard` (the architect generates a bash wizard) | a dump session, a first `SndA` backup |
| Primary-source facts | `research` (writes a cited file under `docs/feature-plans/research/`) | Web MIDI SysEx in Chromium |
| "What should this look like?" | `prototype` (throwaway, never committed) | the device view |
| New findings and bug reports | **/triage** (into STATUS "Small items" or "Backlog") | your findings after a test |
| A message that didn't land | **/wait-what** | — |
| Ending a long session | **/handoff**, or the architect's `/compact` line | before compacting the architect |
| After a rough session | **/retro** | improving agent files or this guide |
| Architecture drift | **/improve-codebase-architecture** | after milestone 2 |
| Not sure which skill | **/ask-matt** | — |

## Rules

- No code before a decided plan says what to build (except throwaway prototypes).
- Decisions are dated and say who decided; a changed decision gets a new dated line.
- Use the glossary's words in plans, branches, commits, code and UI; a new word goes through
  `domain-modeling`.
- A contradiction with a decided plan is raised to the architect, never silently overridden.
- The hardware rules in `CLAUDE.md` apply to every skill: no skill sends anything to the UC4.
