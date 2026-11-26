# Browser checks

How to drive the editor in a browser check (the `claude-in-chrome` tools against `npm run dev`). Run one agent's
check at a time; the architect hands out the turn.

## Open the page

- `http://localhost:5173/?midi=fake` gives two fake inputs, "Faderfox UC4" (`'uc4'`) and "Test Synth" (`'synth'`),
  and no outputs, so nothing can reach a real UC4. Every check that touches Send, Map or the monitor runs here; a
  page without `?midi=fake` may hold a real port.
- Open a new tab for the check and close it at the end. A reload empties the monitor (the dev server reloads on a
  builder's save too): send the messages and read the result in one script.

## Play MIDI

`fakeMidi.send(from, ...bytes)` plays raw bytes: `fakeMidi.send('uc4', 0xB0, 32, 80)` is CC 32 = 80 on channel 1
(factory SE01: FAd1 · FG1). `0x90 n v` note on, `0x80 n 0` note off, `0xC0 p` program, `0xE0 lsb msb` pitch
bend. `fakeMidi.clock('synth')` sends a clock byte; `fakeMidi.plug(false)` unplugs the synth. Factory channel =
setup number.

## Find elements

Prefer roles and labels over text: a `textContent` match also hits every ancestor (a search for "MIDI monitor"
found the Connections column toggle first).

| What                       | Selector                                                                            |
| -------------------------- | ----------------------------------------------------------------------------------- |
| A control in the device view | `.control[aria-label^="Fader 2,"]`, `"Encoder 1,"`, …; the label also carries "live n" and "n warnings" |
| Click a control            | `el.dispatchEvent(new MouseEvent('click', {bubbles: true}))` (SVG: `.click()` is missing) |
| The property panel         | `aside.props` (its inputs: `aside.props input`, `aside.props select`)                |
| A property field           | the `label` whose text starts with the property, then `label.control`               |
| Set a field                | the native value setter, then `input` and `change` events, then `blur()`            |
| Map on a monitor row       | `[aria-label="Map to a control"]`                                                    |
| Follow                     | the button with text "Follow"; on/off in `aria-pressed`                             |
| Fold headings              | `[aria-expanded]` whose own text starts with "▾"/"▸" and the section name            |
| Toolbar Undo               | the button whose `aria-label` starts with "Undo"                                     |
| Reset a control to factory | `[aria-label^="Reset "][aria-label$="to factory"]`                                   |

## Measure, don't eyeball

Alignment is a number. For a list or a button group, log each button's right edge and compare:
`[...root.querySelectorAll('button')].map(b => [b.textContent.trim(), Math.round(b.getBoundingClientRect().right)])`.
Buttons of the same column share one right edge, to the pixel (see **one right edge** in the `uc4-ui-design` skill).

## Leave it clean

The check ends with the dev library unchanged: undo every edit, and the toolbar Undo is disabled again. A reload
clears the undo history, so restore by hand what you changed before one. Put back what you toggled (Follow is on
by default, the theme, folds) and close your tab.
