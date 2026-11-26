# UC4 Editor

A browser editor for the Faderfox UC4 MIDI controller: setups are edited and kept as files, and moved
to and from the device as SysEx dumps. Device words are spelled as the device displays them.

## Language

### The device

**Setup**:
One complete configuration of every control in every group, as the UC4 stores 18 of them.
_Avoid_: preset, patch, program, bank

**Slot**:
A setup's place on the device, `SE01`…`SE18`.
_Avoid_: memory, location

**Control**:
One physical element of the UC4: an encoder, a push button, a green button or a fader.
_Avoid_: knob, pot, potentiometer, widget

**Encoder**:
One of the 8 endless rotary controls (`Enc1`…`Enc8`).
_Avoid_: knob, pot

**Push button**:
The press of an encoder, programmed on its own (`Pbt1`…`Pbt8`).
_Avoid_: encoder button, encoder switch

**Green button**:
One of the 8 buttons with an LED (`btn1`…`btn8`).
_Avoid_: pad, key, switch

**Fader**:
One of the 9 linear sliders (`FAd1`…`FAd9`).
_Avoid_: pot, slider, potentiometer

**Encoder group**:
One of 8 sets of encoder and push-button commands in a setup, with a 4-character name.
_Avoid_: bank, page, layer

**Fader/button group**:
One of 8 sets of fader and green-button commands in a setup, selected independently of the encoder group.
_Avoid_: bank, page, layer; "group" alone when it is unclear which of the two

**Edit encoder**:
In edit mode, one of encoders 1–8 used as a knob of the editing itself: edit encoder 1 picks the
control, edit encoders 2–8 set its properties. Not the control being programmed ("turn edit encoder 3
to set `Enc1`'s command type").
_Avoid_: "encoder 3" alone when it could mean the control `Enc3`

**Property**:
One programmable value of a control: display scale, command type, command mode, channel, number, lower value or upper value.
_Avoid_: parameter (that is what a control drives in the DAW), setting

### Data

**Configuration**:
A `uc4-config` JSON document: the master form of one or more setups.
_Avoid_: project, preset file, document (in UI text)

**Dump**:
The SysEx bytes of one setup (`Sndc`) or of all setups (`SndA`), from or for the device.
_Avoid_: patch, SysEx file (say `.syx` file when the file is meant)

**Raw dump**:
A dump kept byte for byte as it arrived, next to its interpretation.

**Fixture**:
A dump made for testing, with a note of the one change on the device that produced it.

**Archive**:
A `.zip` holding a configuration, its dump and their metadata.
_Avoid_: backup (that is the kept `SndA`), export (an export is any file the app writes)

**Backup**:
The `SndA` the editor keeps from the UC4: the old state of all 18 setups that a **Restore** puts back.
_Avoid_: archive (the `.zip`), snapshot

**Export**:
Writing a file to the computer: a configuration (`.json`), a dump (`.syx`) or an archive (`.zip`). An export never
reaches the device.
_Avoid_: save, download, send (for a file)

**Import**:
Reading a file from the computer into the editor.
_Avoid_: load, open, receive (for a file)

**Send / Receive**:
Moving a dump between the editor and the device over MIDI: the editor sends to the UC4, and receives what the UC4
sends (`Sndc`, `SndA`).
_Avoid_: export, import, upload, download (for the device)

**Copy buffer**:
The device's store for `CPYS`/`PStS` (and the part copies): one setup's worth of data kept on the UC4 and sent
with every `SndA`. Not a setup, and not shown in the setup list.
_Avoid_: clipboard (sounds like the computer's), slot 19

**Copy / Paste**:
The editor's way to put one setup, group or control onto others of the same kind in the library; undoable,
never on the device.
_Avoid_: clipboard, copy buffer (that is the device's), duplicate

**Editor-only data**:
What the editor keeps about a setup that the device has no place for: the setup name, notes and
control labels. Saved in `.json` and `.zip`, never in a dump.
_Avoid_: metadata, extra data

**Group name**:
The 4 characters the device shows for an encoder group (`GrP1`).
_Avoid_: display name, short name

**Group label**:
A free-text name for a group in the editor ("Filter sweep"); the device never sees it.
_Avoid_: long name, title

**Setup name**:
The name a setup has in the library ("Live Mixing"). The device knows only the slot.
_Avoid_: title, preset name

**Control label**:
A free-text name for one control in one group ("Cutoff"), shown on the control.
_Avoid_: tag, caption, description

### Engine

**Protocol engine**:
The versioned translation between configurations and dumps.
_Avoid_: interpreter, driver, converter

**Decode**:
Turning a dump into a configuration.
_Avoid_: import (a file action), parse (one step of decoding), translate

**Encode**:
Turning a configuration into a dump.
_Avoid_: export (a file action), compile, generate

**Confirmed field**:
A part of a dump whose meaning is proven by two fixtures that differ only by that one change.
_Avoid_: known field, mapped field

**Device profile**:
Everything that is specific to one controller model; the UC4 is the first.

**Library**:
The configuration the editor holds and keeps in the browser: the 18 slots, like the device.
_Avoid_: project, workspace

**Device view**:
The drawn UC4 in the editor; the upper area holds the encoders and push buttons around the
display, the lower area the faders, the crossfader and the green buttons.
_Avoid_: panel view, canvas

**Group carousel**:
One area of the device view stepping through its 8 groups; the upper and the lower carousel move
independently. Stepped by ‹ › outside the area; the encoder group shows on the display, the
fader/button group as the group-coloured LED above its green button (0006 decision 19).

**Crossfader**:
Fader 9, the horizontal fader; it has its own mapping in each fader/button group.
_Avoid_: fader 9 table (outside protocol notes)

**Setup list**, **property panel**:
The editor's two side areas around the device view: the setups on the right, the properties of
the selected control on the left, as Setup and Edit sit on the UC4.
_Avoid_: sidebar, inspector

**Edit mode**:
A control is selected and its properties are being edited, on the device or in the editor (the
Edit LED is lit in both).
_Avoid_: selection mode, inspect

**Live view**:
The device view with no control selected, showing what the UC4 sends.
_Avoid_: monitor mode, play mode

**MIDI monitor**:
The list at the bottom of Connections of the messages arriving from the chosen inputs, one row per message key
(type, channel, number) whose value updates in place.
_Avoid_: log, console

**Match**:
A control of the library whose message is the one that arrived; several matches are ranked by the active setup and
groups.
_Avoid_: hit, mapping

**Pin**:
The user's pick of which match a message key is, held until the active setup changes.
_Avoid_: lock, bind

**Warning**:
Something in a setup that may be a mistake but is allowed, such as two controls that can play at the same time
sending the same message; it never blocks a send.
_Avoid_: problem (the validator rejects), error

**Waive**:
To accept a warning before a send; the editor remembers it and hides the warning until "Show waived".
_Avoid_: ignore, dismiss, mute

**Map**:
Giving a control the command type, channel and number of a MIDI monitor row's message.
_Avoid_: learn (the later quick mode), assign, bind

**Learn**:
A later quick mode that maps each new incoming message to the next control in turn.
_Avoid_: map (one row to one control); the UC4's own learn is the device's (hold encoder 6)

**Connections**:
The column for the UC4's MIDI connection, the dumps it received and kept, and later the sends to it and other MIDI
inputs. Collapsed, it is a strip showing the connection state.
_Avoid_: devices (the device is the UC4; the device view is the drawn UC4), MIDI panel, drawer

**Kept dump**:
A raw dump the editor holds in the library, received from the UC4 or imported from a `.syx` file.
_Avoid_: saved dump, history

**Dump notice**:
The note that a dump arrived from the device, waiting until the user reviews or dismisses it.
_Avoid_: popup, alert

**Help line**:
The one quiet line at the bottom of the editor that explains what is under the mouse or in focus.
_Avoid_: tooltip, status message

**Device hint**:
The key sequence that sets a property on the UC4 by hand, shown in the help line.
_Avoid_: shortcut

**Problem**:
A value in a loaded configuration that the validator rejects; it is marked, never changed, and
blocks sending.
_Avoid_: error (a refused file), warning (allowed, see Warning)

**Transfer**:
Receiving a dump from the device or sending one to it over MIDI.
_Avoid_: sync, upload, download
