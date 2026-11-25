# Copy / Paste, Reset, Library

## Copy and paste

Copy and Paste work at three levels. Each has a **Copy** button:

| Level | Copy button | Pastes onto |
| --- | --- | --- |
| A setup | on the **Setups** heading | another setup |
| A group | on the group's heading in the property panel | another group of the same kind, in this or another setup |
| A control | on the control's heading in the property panel | a control of the same kind |

How it works:

1. Press **Copy**, or `Cmd`+`C`. The editor takes a snapshot of the item as it is now.
2. Select where it goes. **Paste** and **Cancel** appear under the heading where a paste is possible.
3. Press **Paste**, or `Cmd`+`V`. One paste is one step in Undo.

Good to know:

- One copy is held at a time. It stays held when you select another setup, so you can paste a group
  or a control into another setup.
- On the setup list, every row offers *Paste SE05 here* (named by the copied slot). Pasting a setup
  brings its controls, group names and labels. The slot and the name of the target stay.
- A control only goes onto the same kind of control. Faders 1–8 go onto faders 1–8, and the
  crossfader (fader 9) only onto fader 9.
- `Esc` or **Cancel** forgets the copy. Press `Esc` again to leave edit mode.
- If a paste is not possible, the help line at the bottom says why.

With the Vim keys switched on in Settings, `y` copies and `p` pastes, outside text fields.

## Reset

Reset puts factory values back. It always asks first and says what is lost. **Undo** brings it back.

- **Reset "\<name\>"…** under the setup list (the button shows the setup's name) resets the selected
  setup: its name, all 8 encoder groups, all 8 fader/button groups and every label.
- **Reset encoder group…** and **Reset fader/button group…** at the top of the property panel reset
  that one group. The other groups stay as they are.
- **Reset all…** in the Library row above the setups resets all 18 setups. The dialog shows when you
  last exported.

A reset changes the editor's library only. Kept dumps and the UC4 are not touched, and nothing is sent.

## Library

The **Library** is the 18 setups in the editor, as listed on the right. It is saved in this browser
after every change; the right of the help line says *saved*. A dot next to a setup means it differs from the
factory setup of its slot.

To keep a copy outside the browser, [export](files.md) it.
