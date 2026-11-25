# 0006 — Editor UI

_Stage: decided — UI grilling rounds 1–3 (2026-11-13/14), specified 2026-11-14 for milestone 1 together
with 0007 steps 1–2; steps come from `/to-tickets`._
_Owner: uc4-ui (library module and storage: uc4-model) · Depends on: 0002_

## Problem

Editing 264 commands per setup must be faster and clearer than on the device, while still looking
like the device so the user finds things. On the UC4 every property is reached through edit mode,
one encoder for the control and seven for its properties, on a 4-character display; the user has
no overview of a setup, no undo and no way to keep versions as files.

## Spec: milestone 1 (a working editor, no MIDI)

### Solution

A browser app that shows the UC4 as it looks: the library of 18 setups on the left, the drawn
device in the middle, the selected control's properties on the right, one help line at the bottom.
The upper area of the device view (encoders and push buttons around the display) and the lower
area (faders, crossfader, green buttons) each step through their 8 groups. A click on a control
opens its properties; a change takes effect at once, is saved in the browser and can be undone.
Group names show on a drawn 7-segment display exactly as the device shows them. The help line says
what something does and how to set it on the UC4 by hand. Configurations and single setups go out
and come in as JSON files; problems in a file are marked, never silently fixed. Nothing is sent to
the device in this milestone.

### User stories

1. As a UC4 owner, I want the editor to start with the 18 factory setups, so that I can begin without importing anything.
2. As a UC4 owner, I want the library to list the 18 slots with slot, setup name, problem count and a mark when a setup differs from factory, so that I see at a glance what I have changed.
3. As a UC4 owner, I want to pick a setup in the library, so that the device view shows it.
4. As a UC4 owner, I want to rename a setup in the library, so that I can tell my setups apart (the name lives only in the editor).
5. As a UC4 owner, I want the device view to look like my UC4, so that I find controls where my hands know them.
6. As a UC4 owner, I want each control to show its type and number (`CCAb 8`, `notE 64`) and its label, so that I read the mapping without clicking.
7. As a UC4 owner, I want the upper area to step through the 8 encoder groups on its own, so that I edit them like I select them on the device.
8. As a UC4 owner, I want the lower area to step through the 8 fader/button groups on its own, including the crossfader, so that every fader/button group is one view.
9. As a UC4 owner, I want group pips (encoder groups with their name, fader/button groups like the green LEDs) and ‹ › arrows, so that I jump to a group directly or step to the next.
10. As a UC4 owner, I want the encoder group name on a drawn 7-segment display that looks exactly like the device's (`z` like `2`, `x` like `H`), so that I know what I will see on the UC4.
11. As a UC4 owner, I want to click a control to open its properties, so that I can edit it.
12. As a UC4 owner, I want the property panel to show only the properties the control's kind has, in the device's order, with device names next to friendly text, so that it matches the UC4 and is still understandable.
13. As a UC4 owner, I want a change to take effect at once, with no Save button, so that editing is quick.
14. As a UC4 owner, I want a type change to keep my other values and lower a number to 31 for `CCAh` with a message, so that it behaves like the device and tells me why.
15. As a UC4 owner, I want to type a group name and see which characters the display lacks, as hints, so that I only use names the UC4 can show.
16. As a UC4 owner, I want my work saved in the browser automatically with a quiet "saved" note, so that a closed tab loses nothing.
17. As a UC4 owner, I want undo and redo (Cmd-Z, Shift-Cmd-Z) over the whole library, so that I can try things safely.
18. As a UC4 owner, I want to reset one setup or one group to factory, asked first and undoable, so that I can start a part over.
19. As a UC4 owner, I want to export the whole configuration as a dated JSON file, so that I keep backups and can edit it in nvim.
20. As a UC4 owner, I want to export the selected setup as its own file, so that I can share or keep one setup.
21. As a UC4 owner, I want importing a whole file to replace the library after asking, with "export first" only when I have unexported changes, so that I don't lose work and am not nagged.
22. As a UC4 owner, I want importing a one-setup file to go to its slot, and to be asked "replace, or another slot?" when that slot is used, so that I place it where I want.
23. As a UC4 owner, I want every import to be undoable, so that a wrong file costs nothing.
24. As a UC4 owner, I want a broken file refused with a message that says what to do, so that nothing half-loads.
25. As a UC4 owner, I want value problems in a file marked on the control and in the property panel, and counted in the status bar with a way to step through them, so that I can fix them all.
26. As a UC4 owner, I want the status bar to show "last exported: …" (or "never"), so that I remember backups without pop-ups.
27. As a UC4 owner, I want a help line that explains the element under the mouse or in focus, so that I learn the editor without tooltips.
28. As a UC4 owner, I want the help line to show how to set the focused property on the UC4 by hand, so that I learn the device.
29. As a UC4 owner, I want the drawn `Shift` and `Edit`/`Setup` buttons and the group pips to explain the device's way of selecting groups, so that I can do the same on the UC4.
30. As an Ableton user, I want SE17/SE18 controls to show the panel's printed names (Send 1, Launch, …) while they keep their factory mapping, and my label otherwise, so that the names are never wrong.
31. As a keyboard user, I want arrows between controls, Tab into the panel, `[`/`]` and `{`/`}` for the groups, each shown in the help line, so that I can edit without the mouse.
32. As a UC4 owner, I want a foldable Settings panel (gear, Cmd-, or the drawn `Setup` button) holding theme and carousel animation, so that options stay out of the way.
33. As a UC4 owner, I want the theme to follow my system's light or dark mode, so that it fits my desktop.
34. As a contributor, I want all editing logic outside the Svelte components, so that it is tested without a browser.

### Implementation decisions

- **Library module** (plain TypeScript, no Svelte, no DOM): the only place that changes the
  configuration. Holds the configuration, the selection (setup, encoder group, fader/button
  group, control), the undo/redo history (in memory), the export state (changes since the last
  export, last export date) and the problem list (from `validate`). Commands: select, set a
  property (type changes through `changeType`), set a group name (through `normalizeGroupName`),
  rename a setup, reset a setup or group to factory, import a file (whole → replace; one setup →
  its slot or a chosen one), export the whole configuration or one setup, undo, redo. Every
  command returns the new state and an optional message for the help line; nothing throws at a
  user action. Svelte components subscribe to it and call its commands, and hold no editing logic.
- **Storage interface**: save and load the library. An IndexedDB implementation for the app, an
  in-memory one for tests. Saved after every command. A stored configuration goes through `load`
  like an imported file (validation, migration).
- **Device profile data** (UC4): the panel geometry for the SVG; the 7-segment table per name
  character code; the device hint (key sequence) per property and kind, from the encoder labels on
  the panel; the printed Ableton names of SE17/SE18 per control. Kept as data, so another Faderfox
  device adds data, not code.
- **Device view**: SVG from the geometry; the two carousels are the upper and the lower area,
  `Edit`/`Setup`, `Shift` and the display frame stay still; the crossfader belongs to the lower
  carousel. Printed names: per control, only while the control equals its factory mapping; a label
  always wins.
- **Property panel**: properties per kind in the device's order; numbers as numbers, choices as
  device names (0002); problems next to the field.
- **Help line**: help text next to the element it describes (`data-help`), no tooltips; state lines
  (problem, refused import, `CCAh` lowered) override it.
- **Styling**: Svelte component styles plus `tokens.css` (decision 2), light and dark following the
  system.
- **Files**: export names `uc4-config-YYYY-MM-DD.json` (whole) and one-setup files with their slot;
  import through `load`. `.syx` and `.zip` wait for 0004 (0007 decision 2).
- **Group-name character `=`** for code `25` is added to the allowed characters (0002, 2026-11-14).

### Testing decisions

- A good test drives a public interface with data and checks the visible result, never internals:
  "after import of a one-setup file into an occupied slot with replace, slot 5 holds it and undo
  restores the old one".
- Seams (user, 2026-11-14):
  1. The **library module's** public commands, data-driven: selection, editing, type change
     messages, group names, reset, import/export (replace, slot conflicts, "export first" rule),
     undo/redo across all of them, problem counts.
  2. **Storage** through its interface with the in-memory implementation; the IndexedDB one is
     checked in the browser.
  3. The **device profile data** as data: a glyph for every allowed name character, a hint for
     every property of every kind, printed names only for SE17/SE18 controls, geometry for every
     control.
  4. **Svelte components: no unit tests in milestone 1**; they stay thin and are checked by
     uc4-ui's browser test lists, which the architect runs. A component test setup (likely
     Vitest browser mode with Playwright, not jsdom) is reconsidered with the bulk edits, as a new
     dependency to approve.
- Prior art: the schema tests in `tests/model/` (data-driven cases through the public interface).

### Out of scope (milestone 1)

Bulk edits and copy/paste of setups and groups (step 3), the JSON side panel and the nvim link
(decision 13), the full how-to view, the device trainer, the device page and any MIDI (0005),
`.syx` and `.zip` (0007 steps 3–4), an undo tree, a collection of unslotted setups, a phone
layout, the 3D model, editing control labels and notes (shown, not yet edited).

### Further notes

- The 7-segment table needs the user to look at the letters not yet seen on the display once
  (look only, nothing sent).
- The library module and storage are model/storage work (uc4-model); the device profile data and
  the Svelte app are uc4-ui's. `/to-tickets` cuts the steps along that line.

## Ideas beyond milestone 1 (from the draft)

- **Setup library** (left): setups with name and slot; new, duplicate, delete (confirmed), import,
  export.
- **Device view** (centre): the UC4's layout — 8 encoders with push buttons, 8 green buttons,
  9 faders. Two group selectors, independent: encoder group 1–8 (with the 4-character name) and
  fader/button group 1–8. Each control shows its type and number (`CCAb 8`, `notE 64`).
- **Property panel** (right): the selected control's properties in the device's order (display
  scale, type, mode, channel, number, lower, upper), device names next to friendly text, only what
  the kind has. Validation messages next to the field.
- **Group carousel** (user, 2026-11-13): the encoder area and the fader/button area of the device
  view each slide through their 8 groups like a carousel, independently, so all groups can be
  edited by swiping/stepping through them. Details (neighbour preview, keyboard, how the device's
  selected group is shown) are grilled with the UI. Ideas (user, 2026-11-13): copy buttons on
  the left/right to copy from the neighbouring group; fader/button groups shown like the device's
  green LEDs (in their own colours), encoder groups with their name as a label.
- **JSON tree and editing in nvim** (user, 2026-11-13; ideas for later): a side panel with the
  configuration as a collapsible JSON tree (like tree-sitter's view in nvim), in step with the
  device view. And a link to nvim: the editor opens a `.json` file on disk and follows it, so an
  edit saved in nvim shows up at once and the editor's edits are written back (Chrome's File
  System Access API, no backend; to check in a prototype). The user's picture: like a markdown
  preview in nvim, where the browser follows the buffer live as you type. Live-as-you-type needs a
  small nvim plugin that pushes the buffer to the editor over a local connection; follow-on-save
  needs nothing but the browser. The user leans to live-as-you-type with an nvim plugin
  (2026-11-13); how it connects (a local helper next to "no backend") is decided when it comes up.
  Why: editing as text is the fastest way for bulk changes.
- **Principle** (user, 2026-11-13): as close to the device as possible, but friendlier; extra
  information (help, labels, problems) goes in the overlay, it doesn't change the device's layout.
- **Bulk edits** like the device's copy helpers: apply one property to all controls of the group;
  copy/paste a group's encoders, push buttons, faders or buttons (`CPYE`, `CPYP`, `CPYF`, `CPYb`); copy
  a whole setup.
- **Device page**: connection status, receive a dump, (later) send, raw dump list with compare.
- Status bar: schema version, engine version, what the engine can encode.
- **Help line** (from cmdAbl, 0019 there): one quiet line, fixed height, always in the same place,
  like Ableton's Info View. It shows the help of the element under the mouse, else of the focused
  one, else an idle key line; a state line (warning, error) overrides it. Help text sits next to
  what it describes (`data-help="Subject: what it does (key; side effect)"`), no separate help
  file, **no browser tooltips**.
- **Device how-to**: for each control and property, the key sequence that sets it up on the UC4 by
  hand (e.g. edit mode → encoder 1 to `Enc3` → edit encoder 3 to `CCAb`). Kept as data next to the
  property definitions, so the help line shows the short form and a how-to view renders the full
  steps from the same data.
- **Device trainer, a small game** (user, 2026-11-13; later, after the how-to view): the app sets
  a task ("give `btn3` in fader/button group 2 the type `CC` and mode `toGL`"), times the user
  doing it on the UC4, and checks the result. It learns from how dump session 1 worked: the user
  ends a task with `Sndc`, the app receives the dump and diffs it against the one before, exactly
  as `tools/uc4-dump.ts diff` does. Listening only, nothing is sent to the UC4. Tasks come from
  the same how-to data, get harder step by step (one property → several controls → groups), and a
  score keeps track of speed and mistakes. Why: the user learned the device's edit flow during the
  dump sessions; a game makes that learning deliberate and fun.

## Decisions

1. The UI only shows what the model allows (0002); no free-form MIDI fields.
2. **Styling: Svelte component styles plus one `tokens.css`** of CSS variables (colours, spacing,
   font sizes, focus ring, dark theme); no Tailwind and no UI kit for now (user, 2026-11-13). Why:
   Svelte already scopes CSS, the device view is SVG, tokens keep the UX checklist consistent.
   Tailwind v4 (`@tailwindcss/vite`) can be added later if panel CSS starts to repeat.

3. **Milestone 1 = the visual editor on the model** (UI grilling round 1, user, 2026-11-14): the
   setup library, the device view with both group carousels, the property panel, the help line,
   JSON import/export and the IndexedDB library (0007 steps 1–2). Later: bulk edits, JSON side
   panel, nvim link, how-to, trainer, device page, `.syx`, `.zip`. JSON is the file format, not
   what the user edits in the browser.
4. **The library is one configuration = the 18 slots**, like the device (R1 Q2). A whole-file
   import replaces it after asking. A collection of unslotted setups can follow without a schema
   change.
5. **Layout** (R1 Q3): library left, device view centre, property panel right, help line fixed at
   the bottom; desktop first (≥ 1024 px). Foldable floating panels as in the user's NerdSEQ
   mapping editor (`../mappingeditor/editor`, Vue: `BasePanel.vue`, `usePanelState.ts`) are the
   pattern for extra panels.
6. **Device view is an SVG drawn from the real panel** (R1 Q4, the user's panel drawings): upper
   area 2 × 4 encoders (each with its push button) around the 4-digit display; lower area faders
   1–8, the crossfader (fader 9), 8 green buttons with LEDs, `Edit`/`Setup` and `Shift`. Each
   control shows type + number and its label; a problem gets a red mark. A 3D model (STEP) for
   animations is a someday idea, no priority.
7. **Two carousels = the two areas** (R1 Q5): the upper area slides through the 8 encoder groups,
   the lower area through the 8 fader/button groups, including the crossfader (one record per
   fader/button group). `Edit`/`Setup`, `Shift` and the display frame stay still. ‹ › outside
   the area (decision 19; pips dropped), one group visible, slide ≤ 200 ms.
8. **Edits apply at once**, saved to IndexedDB with a quiet "saved" note, undo/redo over the whole
   configuration; type changes through `changeType`, its message in the help line (R1 Q6).
9. **Keys** (R1 Q7; group keys changed by decision 42): arrows between controls, Tab into the panel, `[`/`]` encoder group, `{`/`}`
   fader/button group, each shown in the help line. Provisional: expected to change with use.
10. **Group-name paste** keeps the filter with one hint per dropped character (R1 Q8).
11. **Export reminder** only as "last exported: …" in the status bar (R1 Q9).
12. **Theme follows the system** (default dark since decision 20), light and dark in `tokens.css` (R1 Q10).
13. **JSON side panel and nvim link come after milestone 1** (R2 Q1). Online, the JSON side panel
    (behind a setting, a foldable tree in step with the device view both ways) takes nvim's role;
    a local copy of the editor can also connect to nvim directly (own plan later).
14. **Settings is one foldable floating panel** (R2 Q2): opened from a gear in the top bar and with
    Cmd-, (the usual shortcut); it remembers whether it's open. Holds theme, carousel animation,
    later the panel switches. Easter egg (R2 Q5): clicking the drawn `Setup` button opens it too.
15. **The display shows real 7-segment glyphs** (R2 Q3), drawn from a segment table per character
    code kept as data in the device profile; the name input previews the same. The user checks
    the unseen letters once on the device (look only).
16. **Device hints in the help line** (R2 Q4): the focused property shows its short key sequence on
    the UC4 (from the encoder labels on the panel: `Ctrl num`, `Disp scale`, `Cmd type`, …). The
    full how-to view comes later.
17. **`Edit`/`Setup` and `Shift` are drawn, not active** (R2 Q5); hover and the group pips explain
    the device's way ("Shift + encoder 3 selects group 3").
18. **Printed Ableton names only where they are true** (R2 Q6): in SE17/SE18 a control shows the
    panel's printed name (Send 1, Launch, …) only while its mapping equals the factory mapping;
    a label always wins. Architect's reading: decided per control, so one changed control loses
    its printed name and the others keep theirs.
    **Corrected 2026-11-14** (the user's panel photo, `uc4-device.md` "Printed Ableton names"):
    the printed names name **groups**, not controls: encoder groups Send 1 … Global, fader/button
    groups Launch … Select. So in SE17/SE18 a group shows its printed name (Groups section,
    and the help line of its arrows, LED and Shift-click) only while the whole group equals its
    factory mapping; control labels are unaffected. The Global box labels beside the display
    wait until their controls are known.

19. **The device view shows only the panel; groups are shown the device's way** (user, 2026-11-14,
    after the step 4–6 browser check; replaces the pips of decision 7 and the pager bars). Why:
    the bars broke the panel's real layout and showed the fader/button group in a way the UC4
    doesn't. Now:
    - **Encoder group**: shown by its name on the display, as on the device.
    - **Fader/button group**: shown by the LED above green button n, lit in a group colour (a
      token, not the LED green), so it reads as "group", not as LED state.
    - **Stepping**: one ‹ and one › outside each area's rectangle, left and right, centred on
      the area; keys `[` `]` `{` `}` stay. The slide stays.
    - **Selecting a group directly**: Shift-click (or Shift + Enter) on encoder n or green
      button n selects group n, like the device's shift + press; a plain click still selects
      the control. The help line says so (decision 17).
    - **Everything else outside the panel**: group name field and group resets move to a
      "Groups" section at the top of the property panel (encoder group n: name, reset;
      fader/button group n: reset). Group names stay visible on the display only.

20. **Milestone 1 review: small changes** (user, 2026-11-15, test list items 4, 8, 14, 16 and
    notes). Why: found by hand; none changes the layout.
    - The theme defaults to **dark**; System and Light stay in settings. Changes decision 12.
    - A number field that is empty while typing shows no error; left empty, it restores the saved
      value (as Esc does). An error shows only for a value that is not allowed.
    - A problem names the property by its label ("Upper value must be …"), not by its key.
    - Shift-click and the group pips jump without the slide; ‹ › and the keys keep it.
    - The **Setup LED** is lit while settings is open, the **Edit LED** while a control is
      selected and the property panel shows it (as on the UC4).
    - The setup list gets a **resize handle** (remembered), so long setup names show in full.
    - `u` shows as a big `U` on the display (the device has no small `u`).
    - The Import picker has no file filter: a re-saved JSON was greyed out in the user's browser,
      and import checks the content anyway.
    Undo history ends with a reload (accepted: decision 8 doesn't keep it). Done (`00c68f9` and
    the filter commit after it), browser-tested by the architect 2026-11-15.

UI grilling round 4 (user, 2026-11-15, after the milestone 1 test, questions UI-1 to UI-9):

21. **Three areas, lit like the UC4**: the **setup list** (Setup LED lit while it's active, as in
    the device's setup menu; settings no longer lights it, which reverts that part of decision 20),
    the **device view**, and the **property panel**. Clicking a control enters **edit mode** (Edit
    LED lit, the property panel edits it); a click on an empty area or Esc leaves it, and the
    device view then shows what the UC4 sends (**live view**, 0008). Tab moves between the areas,
    the arrows inside one.
22. **Sides swapped**: the property panel on the left, the setup list on the right, as Edit
    (left) and Setup (right) sit on the UC4. Why: the device's way (decision 19). Rejected: the
    usual web layout with the list on the left. Easy to swap back if it feels wrong (user).
23. **Group keys** (history: was `(` `)` and `[` `]` for the encoder group, replaced by decision 42; `[ ]` and Shift + arrows are gone): `(` `)` and `[` `]` stepped the encoder group, `{` `}` the fader/button group,
    and Option+←/→ the group of the selected control's section. Why: `[` `]` are awkward on a German
    layout, and the user's Option+h is taken by a system shortcut. Replaces the keys of decision 9.
    Added (user, 2026-11-15): **Shift+←/→** step the encoder group and **Shift+↑/↓** the fader/button
    group, outside text fields. Why: the bracket keys need Option on a German layout; Shift + arrow
    is free and matches Shift + encoder on the UC4.

24. **The groups area shows the active section's group**: the encoder group with its name and
    display, or the fader/button group as a row of 8 LEDs with its LED lit, its label and reset.
25. **Group labels**: every group gets a free-text label shown in the editor (the model's
    editor-only `label`); the 4-character group name stays separate, and the app suggests one from
    the label ("Filter" → `FiLt`), taken with one click. Fader/button groups get a label too.
26. **The display shows what the UC4 shows**: while editing, the focused property's value as in
    the device's edit mode (texts from the manual; gaps go on the user's look list). Values of
    moved controls come with 0008.
27. **No page scroll**: the spacing between controls stays; only the property panel scrolls on
    its own. To be reverted if it feels worse (user).
28. **Slide speed** in settings, 0 (off) to about 400 ms; the default stays.
29. **Command types in the help line**: one line per type with its DAW name ("`CCr1`: relative,
    1 = up / 127 = down (Ableton: Relative (2's Comp.))"), from the same data the how-to view uses
    later. Sources in `docs/reference/uc4-device.md`.

Copy / Paste grilling (user, 2026-11-17/18, Q8–Q11, Q14; during the Send round, 0005 decisions 20–27).
Fills in the "bulk edits" idea for copy and paste; glossary **Copy / Paste**, apart from the device's
copy buffer:

30. **One Copy / Paste pattern at three levels** (Q8): setups (setup list), groups (the groups area
    header) and controls (property panel header). **Copy** on the selected item; while a copy is held
    the copied item stays bright, every other item of the same kind dims slightly and shows a
    **Paste** icon; Esc or a small "× Cancel pasting" ends it. Selecting and editing work as usual while
    a copy is held, and it survives selecting another setup, so groups and controls paste across
    setups. The buttons say only Copy and Paste, no noun.
31. **Fast paste for setups** (Q8a): the source is the selected setup; pointing at or focusing any
    other row of the setup list shows a "Paste SE05 here" icon at its right edge; one click pastes.
    Copy → Paste (decision 30) works for setups too.
32. **Paste at once, one undo step, no question** (Q9): undo takes the place of "Replace SE06?", so a
    paste on the wrong row is one ↶ or Cmd-Z away. It changes the library only, never the device.
33. **What a paste carries** (Q10): a **setup**: every control, group names and labels; the target
    keeps its slot and its own setup name. An **encoder group**: 8 encoders, 8 push buttons, the group
    name and labels; a **fader/button group**: 8 faders, 8 green buttons and fader 9, and labels. A
    group pastes only into a group of the same area, in any setup. A **control**: all properties and
    its label, onto controls of the same kind only (encoder → encoder); other kinds show no Paste.
34. **Keys** (Q11, Q14): Cmd-C copies and Cmd-V pastes the selected setup, group or control, by the
    area that has the focus; inside a text field they stay text copy and paste. Settings gets
    **Keys: Standard | Vim** (default Standard): Vim adds `y` (copy) and `p` (paste) outside text
    fields; later vim keys (`j`/`k` in the setup list, …) join the same option. A plain entry in
    Settings rather than a hidden one: where the user would look for it.
35. **Copy takes a snapshot** (user, 2026-11-18, Q22, after step 21): Paste puts the item as it was when Copy was
    pressed, like any clipboard and Vim's `y`; an edit to the source afterwards is not carried. The copied item stays
    marked while the copy is held. Why: what Copy means everywhere else; an edit in between can't slip in.
36. **Copy and Paste answer with a short visual effect** (user, 2026-11-18, after trying step 21: a paste of a group
    or setup was hard to notice). Copy: the copied item pulses once in the accent colour, then stays marked. Paste:
    the target flashes in the accent colour and fades back over about 0.6 s: a setup's row; a group's step and the
    device view area showing it; a control on the device view. Reduced motion: a static accent outline for about
    1 s instead. The help line message stays. Why: motion that answers an event (uc4-ui-design, Calm).
37. **Reset all setups** (user, 2026-11-18, Q23): "Reset all…" sets SE01–SE18 to factory (SE17/SE18 their Ableton
    setups), including setup names, labels and notes; kept dumps and the UC4 are untouched, nothing is sent. It asks
    first ("Reset all 18 setups to factory? Your changes are lost unless exported (last export: …)") and is one undo
    step. The editor's `rESA`. Dump links stay, as with a single reset, so "Revert to its dump" still leads back to
    what the UC4 had (architect, 2026-11-18, step 24 review); unreadable marks go.
38. **A Library section above the setup list** (user, 2026-11-18, Q24): a small header row "Library" with `Reset
    all…`, above "Setups"; whole-library actions gather there later. Not in Settings: it acts on the setups.
    Several switchable libraries would be a feature of its own (not decided).

Help line and keys (user, 2026-11-18, Q25–Q28, from a too-long help line):

39. **One schema for every help text** (Q25): `<what it is / does> · <one way> · UC4: <device hint>`, one line at most;
    a part without content is left out. The one way is the **most common** one for that element, which may be a mouse
    gesture: on an encoder "Shift + click: encoder group n", on the ‹ › arrows the key `(` / `)`. Every other way
    lives in the key help (decision 41).
40. **Shift + click selects a group, as on the UC4** (Q26): Shift + click on encoder n selects encoder group n,
    Shift + click on green button n selects fader/button group n (the device: Shift + encoder or button n). A plain
    click still selects the control.
41. **Key help like Vimium's** (Q27): an overlay over the page, "Keys" with a close ×, sections by area (setups,
    groups, controls, copy/paste, dialogs, send) in two columns, key chips on the left and the action on the right,
    Vim keys shown when the Vim option is on. Opened with `?` and from Settings → Keys → "All keys…".
42. **One key per action** (Q28; changes decision 23): `(` `)` step the encoder group, `{` `}` the fader/button group,
    arrows move between controls, `Option + ← →` steps the group of the selected control. `[ ]` and `Shift + arrows`
    go.
43. **Copy sits on the heading line** (user, 2026-11-19): the copy bar (Copy, and Paste / Cancel while holding) moves
    from its own row to the right end of its section's heading line: "Encoder group 1 … Copy", "Encoder 1 … Copy",
    and the same for fader/button groups, other controls and the library's "Setups". The subtitle stays under the
    title. Why: one row less per section, so the property panel scrolls later.
    **Amended** (user, 2026-11-19, Q35, option A): Copy, Paste and Cancel need about 200 px, the panel has about 244
    and the library list 192, so while a copy is held the bar drops to a second line, right-aligned under the
    title; the title never shrinks. With nothing held the line is "Title … Copy". The rows below move one line on
    Copy and back on Paste or Cancel. Rejected: "Paste ×" in place of Copy (still too wide), a fixed bar row (loses
    the space). "× Stop pasting" is now **Cancel** ("Cancel pasting" in the key help).
44. **The Paste icon sits on the rim** (user, 2026-11-19, option B): on every control of a kind the icon sits at the
    same spot, centred on the rim's top right (half over the control), so it stays inside the device panel without
    a special case for the right edge. Replaces the clamp of step 26 (`e1640a1`). Rejected: outside the rim with
    nothing clipped (sticks out past the panel), the clamp (button 8 differed from 2–7).
45. **Ranges inside the field** (user, 2026-11-19): a number field shows its range ("1–16", "0–127") as dim text at
    its right end, inside the field, always visible (not a placeholder, which vanishes on input). The line under a
    field appears only when it says something more: a note ("not used by relative types"), a problem, a hint. No
    empty reserved rows under fields. Why: about one row less per field, so the property panel scrolls later on
    small screens. The range stays in the field's accessible description.
    While a field has focus, a refused entry only turns its border and range red; the line appears on leaving the
    field (blur, Enter), so nothing jumps while typing. Once the kept value shows again, only the line stays red.
    (architect, 2026-11-19, from the step 28 review)
46. **A group slide moves one control step** (user, 2026-11-19): each area slides by the spacing of its own controls
    (encoders 133 units, faders 65; the first measure of about 125 / 61 was on screen), taken from the geometry, not a fixed 60. Why: the faders' 60-unit
    slide lands each fader on its neighbour and reads as one row moving; on the encoders 60 is half a step, so the
    fading old group shows between the new one as a double image (measured 2026-11-19, the same 150 ms in both).
    The crossfader (fader 9) is one wide control, so it does not slide: old and new fade in place with the same
    duration, while faders 1–8 and the green buttons slide one step. (architect, 2026-11-19, plan 0010 step 1)

## Open questions

- **Command mode** (user, 2026-11-18, an idea for after step 25): clicking the drawn **Shift** on the device view
  opens it, as the UC4's Shift opens its second layer and the drawn `Setup` opens Settings; `:` opens it from the
  keyboard. The command line takes the help line's place, with suggestions in the same line; Esc gives the help line
  back. Users of it read the docs, so it needs no other UI. Mainly for the local copy of the editor (decision 13:
  files on disk, nvim); online only the commands that need no file system, or none. Commands to be grilled.

Ideas from other UC4 editors ([other editors](../reference/other-uc4-editors.md), item 5): conflict detection, paste special
(offsets, auto-increment), copy/swap setups, an 8×8 overview per kind, ready-made setups, learn.

- How-to view: a panel beside the property panel, or its own page? (grill)
- Notes and control labels (0002 decision): editing UI after the first version; labels shown on the control.
- JSON side panel / nvim link (after milestone 1): how a file edit and an editor edit at the same
  time are resolved; validation shown for the file.
- Device trainer: which scratch setup it uses (it changes that setup on the device), whether it
  restores it with `rESc` after a round, and what a round looks like (grill when it comes up).

## Steps

Cut by `/to-tickets` (2026-11-14), approved by the user. All `[ready-for-agent]`. Earlier: step 0,
the scaffold, done 2026-11-13 (`087bef4`, 0002 step 0).

1. **Library core — done 2026-11-14** — uc4-model · blocked by: none · library module: selection, set property
   (type through `changeType`), group name, setup rename, undo/redo; storage interface with an
   in-memory and an IndexedDB implementation; first start = `factorySetup(1…18)`; `=` added to the
   name characters. Tested through its commands.
   Lives in `src/storage/` (`library.ts`, `storage.ts`, `memoryStorage.ts`, `indexedDbStorage.ts`,
   `index.ts`): it uses storage and the model, and the UI uses it (UI → storage → model). Tests in
   `tests/storage/`. API: `openLibrary(storage)` → `{ library, message? }`; `library.getState()`,
   `subscribe(fn)` (called at once and after every change), commands `select`, `setProperty`,
   `setGroupName`, `setSetupName`, `undo`, `redo`, each returning `{ state, message? }`.
2. **Tracer: edit one control in the browser — done 2026-11-14 (`6f149ef`; browser-checked by the architect; the display shows the name as plain text until step 5)** — uc4-ui · blocked by: 1 · three-column layout,
   `tokens.css` (light/dark), SVG device view of the real panel (group 1 of both areas), click a
   control, property panel per kind; a change shows at once, "saved", survives a reload; first
   help line (`data-help`).
   Device profile data lives in `src/app/profile/` (`uc4Geometry.ts`: panel geometry from
   `docs/reference/uc4-panel.svg`; `uc4Properties.ts`: properties per kind in the device's order,
   device names and friendly words). Components in `src/components/`; the library as rune state in
   `src/app/libraryStore.svelte.ts`. Tests: `tests/app/profile.test.ts`.
3. **Library files and resets — done 2026-11-14** — uc4-model · blocked by: 1 (alongside 2) · import (whole →
   replace; one setup → its slot or a chosen one), export (whole / one setup), changes since the
   last export and "last exported", reset per setup and group, problem list; all undoable.
   In `src/storage/library.ts` and `libraryInfo.ts`. New state: `setups` (per setup: slot, name,
   `problemCount`, `differsFromFactory`) and `exportState` (`lastExportedAt`, `changedSetups`,
   `unexportedChanges`). Commands: `inspectImport(text)`, `importFile(text, {slot?, replace?})`
   (results `refused` / `needs-slot` / `slot-occupied` / `imported`), `exportWhole()`,
   `exportSetup(id)` (→ `{ file: {name, text} }`; the UI downloads), `resetSetup`,
   `resetEncoderGroup`, `resetFaderButtonGroup`, `selectProblem(index)`. Export baseline is kept
   next to the library in storage; before the first export the factory setups count as exported.
   Import does not move the baseline: an imported file counts as unexported until exported.
   `exportState.lastWholeExportAt` is the date for the status bar's "last exported" (story 26);
   `lastExportedAt` also moves on a one-setup export. A file with 2 or more setups counts as a whole
   file, so a hand-made 2-setup file replaces the library and leaves 16 slots empty (asked first,
   undoable). `resetSetup` takes the whole factory setup: name, labels and notes go, the id stays
   (the confirm text should say so). `needs-slot` and `slot-occupied` change nothing: the UI asks.
4. **Group carousels — done 2026-11-14 (`bdb7d10`; browser-checked by the architect at 1280×800)** — uc4-ui · blocked by: 2 · upper and lower area step their 8 groups
   independently (crossfader in the lower); pips, ‹ ›, `[` `]` `{` `}`, slide ≤ 200 ms.
5. **7-segment display and group-name input — done 2026-11-14 (`906244c`; browser-checked by the architect; glyph shapes open for the user)** — uc4-ui · blocked by: 2 · segment table as device
   profile data, display with the encoder group name, name field with preview and hints; the user
   checks the unseen letters on the device once (look only).
   Segment table: `src/app/profile/uc4Segments.ts` (`GLYPHS`, `UNSEEN_GLYPHS` = e f h m q; `i` is `bc` from the panel photo). Shapes still guesses until the user has looked: those, plus `u`, `c`, `r`, `g` (`o`, `a`, `l` are checked on the device: big O, A and L) (SE17 groups 5–8: traC rAC PAn GLOb; SE01 GrP1). Problems of a group name are shown next to the field in step 7.
6. **Library list — done 2026-11-14 (`9cf9362`; browser-checked by the architect)** — uc4-ui · blocked by: 2, 3 · SE01–SE18 with name, problem count, differs-from-
   factory mark; rename; reset per setup and group with a confirm.
7. **Files, problems and undo in the UI — done 2026-11-14 (`c8ef6a9`; browser-checked by the architect)** — uc4-ui · blocked by: 3, 6 · import/export buttons and
   dialogs ("export first" only with unexported changes, slot conflict), problem marks and status
   bar stepping, "last exported", Cmd-Z / Shift-Cmd-Z (already wired in `App.svelte` with step 6, so the reset dialogs' "undo" is true; step 7 adds undo/redo buttons), help-line messages, group-name problems next to the name field.
8. **Help line and keys — done 2026-11-14, printed names done per the corrected decision 18 (per group, `src/app/profile/uc4PrintedNames.ts`; the Global box labels wait)** — uc4-ui · blocked by: 4 · device hints per property, `Shift`/`Edit`/
   `Setup` and pips explaining the device, SE17/SE18 printed names (per control, while factory),
   arrows between controls, Tab into the panel.
9. **Settings panel — done 2026-11-14 (`0335f4b`; browser-checked by the architect; closes on an outside click, architect 2026-11-14)** — uc4-ui · blocked by: 2 · foldable floating panel (gear, Cmd-, drawn
   `Setup`), theme system/light/dark, carousel animation on/off, remembers open state. UI preferences stay in the app (`src/app/settings.svelte.ts`, localStorage in try/catch), not in `src/storage/`: they are per-viewer, not library data.

Steps 10–19 cut by `/to-tickets` (2026-11-15) from decisions 21–29 and UX checklist item 11,
approved by the user. All `[ready-for-agent]`.

10. **Swap sides — done 2026-11-15 (`a1a2e20`; browser-checked by the architect)** — uc4-ui · blocked by: none · decision 22: property panel left, setup list right
    with its resize handle on the new edge; everything else unchanged. Browser check.
11. **Three areas and edit mode — done 2026-11-15 (`b9010e0`, `42daf1d`; browser-checked by the architect)** (Tab steps each field inside the property panel, because the arrows belong to its selects and number fields; Esc inside a field only ends the typing) — uc4-ui · blocked by: 10 · decision 21: Tab between property
    panel, device view and setup list, arrows inside; setup list active → Setup LED (settings no
    longer lights it); click a control → edit mode, Edit LED; empty area or Esc → leaves it, the
    device view says live values come with 0008. Help line explains each area.
12. **Group keys — done 2026-11-15 (`55f423c`; browser-checked by the architect)** — uc4-ui · blocked by: 11 · decision 23: `(` `)` and `[` `]` encoder group,
    `{` `}` fader/button group, Option+←/→ the selected control's section; named in the help line.
13. **Groups area shows the active section — done 2026-11-15 (`684e144`, follow-ups in `e8e116b`; browser-checked by the architect)** — uc4-ui · blocked by: 11 · decision 24: encoder
    group with name and display, or the fader/button group as 8 LEDs with its LED lit and its
    reset.
14. **Group labels with a suggested group name — done 2026-11-15 (`dc834e4`, `c2ce992` library; `e8e116b`, `acde379` UI; browser-checked by the architect)** (the label field takes up to 60 characters; the model sets no limit) — uc4-model, then uc4-ui · blocked by: 13 ·
    decision 25: a label per group of both kinds (library command, saved, undoable, in the JSON;
    tests in `tests/storage/`), field in the groups area, a suggested 4-character group name from
    the label using only the device's characters, taken with one click.
15. **The display shows the edited value — done 2026-11-15 (`9245dae`; browser-checked by the architect)** (look list: small `c`/`o` in `Acc3`, `Enc1`, `notE`, `toGL`; whether 3-character codes are left- or right-aligned) — architect (display texts from the manual: done
    2026-11-15, `uc4-device.md`, "What the display shows in edit mode"), then uc4-ui · blocked by: 11 · decision 26: in edit mode the display shows the focused property's
    value as the UC4's edit mode does; gaps go on the user's look list.
16. **No page scroll — done 2026-11-15 (`6474b7f`; browser-checked by the architect)** (the page never scrolled; the device column and the setup list keep `overflow: auto` as a fallback for small windows, no scrollbar gutter, thin scrollbars) — uc4-ui · blocked by: 13 · decision 27: the page never scrolls; only the
    property panel does. Its own commit, so it can be reverted.
17. **Slide speed — done 2026-11-15 (`58ef765`; browser-checked by the architect)** — uc4-ui · blocked by: none · decision 28: slider in settings, 0–400 ms, 0 =
    no slide; `prefers-reduced-motion` respected.
18. **Command types in the help line — done 2026-11-15 (`2853f49`, `5a7d539`; browser-checked by the architect)** — uc4-ui · blocked by: none · decision 29: one line per
    command type with its DAW name, from a table the how-to view reuses.
19. **Help line without flicker — done 2026-11-15 (`9ce95c6`; browser-checked by the architect)** — uc4-ui · blocked by: none · UX checklist item 11: a gap between
    elements keeps the last text; only a new element changes it.
20. **Copy and paste in the library** (decisions 32, 33) — done 2026-11-18 (`81e4f06`, reviewed; by setupId; fader 9 only onto fader 9; a pasted unreadable mark refuses export and send until set) — uc4-model · blocked by: 0005 step 13
    (order, 0005 decision 27) · paste a setup, a group (same area) or a control (same kind) from a
    source onto a target as one undo step; what is carried and kept as in decision 33; unreadable
    marks of the target are dropped where it is overwritten, the source's are copied. Unit tests.
21. **Copy / Paste in the UI** (decisions 30, 31, 34) — done 2026-11-18 (`b0badf3`, reviewed; browser-checked by the architect: setup copy, row paste SE01 → SE16, Esc, Cmd-Z undid it) — uc4-ui · blocked by: 20 · Copy buttons, the
    dimmed targets with Paste icons, Esc / "× Cancel pasting", the setup row icon, Cmd-C/Cmd-V per area,
    the Keys option in Settings with `y`/`p`. Browser check by the architect.
22. **Copy as a snapshot** (decision 35) — done 2026-11-18 (`0fe0db1` library, `0048c52` UI; reviewed; unit-tested, browser test with the user) — uc4-model (paste from a held value: the library takes the copied setup,
    group or control, with its labels and marks, instead of a source address), then uc4-ui (hold the snapshot at Copy)
    · blocked by: 21 · tests: edit the source after Copy, paste, the edit is not in the target; undo; marks.
23. **Copy / Paste feedback** (decision 36) — done 2026-11-18 (`1dcf802`, `e72a851` ring only on rows and steps; reviewed) — uc4-ui · blocked by: 22 · the pulse on Copy and the flash on Paste at
    all three levels, reduced motion; the user judges it on screen. **Done** (built and checked in Chrome; light theme, 1024 px, Safari and reduced motion still to look at).
24. **Reset all setups** (decisions 37, 38) — done 2026-11-18 (`fc23d74`, `8c0e747` library, `5b9aa95` UI; reviewed; the question opened and cancelled in the browser, never confirmed) — uc4-model (`resetAll`, one undo step), then uc4-ui (the Library section,
    the question with the last export time) · blocked by: none · tests: everything factory, kept dumps kept, undo.
25. **Help line schema, Shift + click, key help, one key per action** (decisions 39–42) — done 2026-11-18 (reviewed; the key table drives the group, copy, undo/redo, Settings, `?` and control-arrow handlers; keys that a list, field or dialog handles itself are listed in the table for the help only) — uc4-ui · blocked by: 24 ·
    every `data-help` text rewritten to the schema (the reviewer checks each against it); Shift + click on encoders
    and green buttons; the key help overlay (`?`, Settings → All keys…) from one key table that the handlers and
    the help both read; `[ ]` and `Shift + arrows` removed. Browser check by the architect.
26. **Copy on the heading line** (decision 43) — done 2026-11-19 (`e1640a1`, `ab80494` undo/redo icons; reviewed; browser-checked by uc4-ui dark and light at 1440 and 1024 px; also Cancel, the clamped paste badge, centred kept-dump buttons) — uc4-ui · blocked by: none · `CopyBar` placement in
    `GroupsSection.svelte`, `PropertyPanel.svelte`, `LibraryList.svelte`; while holding, Paste and Cancel fit on the line
    (the bar wraps to a second line while holding; the title never shrinks). Checks: browser at 1440 and 1024 px, encoder and fader groups, a held
    copy in each place; the copy pulse and paste flash still land on the bar. Then retake the guide shots
    (`npm run docs:shots`).
27. **Paste icon on the rim** (decision 44) — done 2026-11-19 (reviewed; browser-checked by uc4-ui dark at 1440 px, light for green buttons) — uc4-ui · blocked by: none · `ControlGlyph.svelte` `pasteSpot`: discs on
    the rim at 45°, pills at their top right corner (the right end hid the label's last digit), faders on their top edge, the same spot on every control of a kind; the clamp goes.
    Checks: a held copy of an encoder, a green button, a push button, a fader and fader 9; the edge controls
    (encoders 4 and 8, green button 8) look like the others; the icon stays readable and clickable over the rim.
28. **Ranges inside the field** (decision 45) — done 2026-11-19 (`b0edeee`, reviewed; encoder panel 802 → 669 px, no scroll at 757 px) — uc4-ui · blocked by: none · the property panel's number fields; the
    range as a non-interactive suffix (the typed value never runs under it); the line below only with a note,
    problem or hint; no empty rows under selects either. Checks: every control kind, a relative type (note shown),
    a value with a problem, a long value, 1024 px, light theme; the help line and the field's description still
    name the range. Then retake the guide shots.
29. **Slide by one control step** (decision 46) — done 2026-11-19 (pitch 133 encoders, 65 faders from the geometry; reviewed) — uc4-ui · blocked by: none · `AreaView.svelte` fly distance from
    `uc4Geometry.ts` (the pitch of the area's encoders or faders); duration and direction unchanged. Checks: ‹ › and
    the keys in both areas at the default speed and at 400 ms; Shift-click still jumps without a slide; reduced
    motion still off.
