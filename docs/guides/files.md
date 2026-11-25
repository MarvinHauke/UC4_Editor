# Files

Files are how you keep your setups: a copy on your computer that survives a cleared browser, and
something you can move to another computer. **Importing or exporting a file never touches the UC4.**
To move setups to and from the UC4 itself, see [From and to the UC4](device.md).

The editor reads and writes two kinds of file:

| File | What it is |
| --- | --- |
| `.json` (a *configuration*) | The editor's own format: one setup or all 18, as readable text. This is the format to keep. |
| `.syx` (a *dump*) | The UC4's own format: the bytes the UC4 sends with `Sndc` (one setup) or `SndA` (all 18). |

Both work in any browser. You only need Chrome or Edge to connect the UC4.

## Export

**Export ▾** is in the bar at the top. It has two groups:

- **All setups:** *Configuration* (`.json`) and *Dump* (`.syx`).
- **The selected setup** (named by its slot, for example `SE05`): the same two.

The file goes to your browser's downloads folder, and the help line at the bottom says so. The names
carry the date, for example `uc4-config-2026-11-19.json` for all setups and
`uc4-setup-05-2026-11-19.json` for one.

The right of the help line shows **last exported** with the time of your last export of all setups. Your setups
live in this browser until you export them, so export before you reset or clear the browser's data.

A `.syx` export is built on the dump the setup came from: a dump [received from the UC4](device.md)
or imported from a `.syx` file. For one setup that is a `Sndc` of its slot, for all setups a `SndA`. The
editor writes only the values whose place in the dump is known. If something is missing, it says what
and offers **Export as JSON instead**.

The `.syx` names carry the version of the engine that made the file, for example
`uc4-SE01-2026-11-16-engine0.9.0.syx` and `uc4-all-2026-11-16-engine0.9.0.syx`.

!!! warning "The `.syx` export is not tested on the UC4 yet"
    The UC4 has not been shown to accept a file made this way. Keep the `.json` file as your master
    copy.

## Import

**Import…** reads a `.json` or a `.syx` file from your computer. It looks at the file first and asks
before it changes anything.

- **A file with all setups** replaces the whole library. The question says what is lost. If some of
  your setups have changed since your last export, it offers **Export first**.
- **A file with one setup** goes to its slot. If that slot holds a setup, you are asked whether to
  replace it or to choose another slot. A file without a slot asks which slot it should go to.
- **A file with problems** is loaded with the problem values marked in red, so you can fix them. A
  value in a `.syx` dump that could not be read is shown as the factory value and marked.
- **A file the editor cannot read** is refused with a reason and what to do. Nothing is changed.

Every import is one step in **Undo** (`Cmd`+`Z`). `Cmd` means `Cmd` on a Mac and `Ctrl` on Windows
and Linux.

A `.syx` dump you import is also kept as it came, byte for byte. See
[From and to the UC4](device.md).
