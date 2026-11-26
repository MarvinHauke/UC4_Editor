---
name: uc4-ui-design
description: Design principles and the user's taste for the UC4 Editor's interface. Use when building or reviewing a change to src/components/ or src/app/ that someone will see — layout, labels, icons, spacing, colour, a new control.
---

# UC4 Editor UI design

The UX checklist in `.claude/agents/ui.md` catches mistakes (targets, focus, keyboard, 1024 px). This skill is the
other half: whether the page reads well. Judge a change against every principle below, on the rendered page, not
on the diff.

## Principles

**Affordance.** A control looks like a control: a button has a surface, a border or a hover background; an icon
button sits in a box the size of `--target`. A coloured dot, a bare glyph or plain text is read as a status, not as
something to press (the green dot that closed the Connections column was missed for this reason, 2026-11-17).

**Discoverability.** Every action is visible where the user looks for it, or one click away under a word that names
it. Esc and shortcuts are the second way, never the only one. A new user finds open/close, export and delete
without reading help.

**Hierarchy.** One thing per area is loudest: the heading or the primary action. State and metadata (times,
"received", formats) are `--text-muted` and `--text-sm`; actions are `--text`. A destructive action is never the
loudest thing in its row.

**Rhythm.** Spacing comes from `tokens.css` (`--space-1` 4 px … `--space-4` 16 px), never raw pixels. Text and a
control beside it keep at least `--space-3` between them; rows of the same kind keep one height; aligned edges
line up across the area.

**Density.** Compact, not cramped: a list row is one or two lines; actions sit on the row's first line at the
right; a row grows a line only for a note the user needs (an unreadable reason, "sent again").

**Words.** One or two words per label, in the glossary's terms (`docs/feature-plans/GLOSSARY.md`) and the
device's vocabulary. Detail moves to a grey hint (`.json` beside "Configuration") or to the tooltip and help line.
An icon button carries its full words in `aria-label`, `title` and `data-help`.

**Contrast.** Text and icons meet WCAG AA in light **and** dark (4.5:1 text, 3:1 icons and borders). Muted is
still readable; a disabled control looks disabled, not invisible.

**Calm.** Motion only answers an event (a dump arriving pulses once) and respects `prefers-reduced-motion`.
Nothing opens, moves or takes focus by itself while the user edits.

## The user's taste (2026-11-16/17)

- A clean, quiet page; information where it belongs (the dump notice lives in Connections, not in the status bar).
- The connection to the UC4 is prominent: the strip on the far left, its state in words and colour.
- Short menu entries ("Configuration", "Dump") with the format as a hint; ornate labels were rejected.
- Icons where the words live in the tooltip (download icon beside `×` on kept dumps); text buttons where the user
  is asked to act (Review / Export .syx / Dismiss on a new dump).
- Room between text and icon buttons (the Connections column went from 240 to 280 px for it, and to 320 px for the one-line monitor rows, 2026-11-26).
- The user changes their mind on placement after seeing it: show it, then ask.

## Reviewing a UI change

1. Get the screenshots: uc4-ui saves them from its browser check (dark and light; a wide window and 1024 px) and
   names their paths in the review request. Without them, ask uc4-ui for them before judging the look.
2. Go through every principle above on each screenshot, then the UX checklist. Name the principle in each finding,
   with the element and the concrete fix (token, colour variable, wording).
3. A finding that is a new kind of problem goes to uc4-architect as a proposed principle or checklist item.
