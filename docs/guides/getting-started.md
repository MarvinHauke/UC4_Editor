# Getting started

## What you need

- A **Faderfox UC4** and a USB cable.
- **Chrome or Edge.** The editor is made for them. Safari cannot talk to MIDI devices. In a browser
  without MIDI you can still edit and use files (`.json` and `.syx`), but you cannot connect the UC4.

You do not install anything and you do not need an account. The editor saves your work in your
browser, after every change.

## Open the editor

<a class="uc4-card"
   href="https://marvinhauke.github.io/UC4_Editor/">
<strong>Open the editor</strong>
<span>https://marvinhauke.github.io/UC4_Editor/</span>
</a>

Open the editor in Chrome or Edge. It starts with the 18 setups, `SE01` to `SE18`, in their factory
state. You can edit them right away. You do not need the UC4 for that.

## Connect the UC4

The first time, the editor connects only when you ask it to. After that it connects by itself when you
open it, and it only ever **listens**. It sends nothing to the UC4 until you press **Send** or
**Restore** in the Send window.

1. Connect the UC4 by USB and switch it on.
2. At the far left of the window is a narrow strip that shows the state of the UC4, for example
   *UC4 not connected*. Click it to open **Connections**.
3. Press **Connect UC4**. The browser asks once whether the page may use your MIDI devices.
   Allow it.
4. The strip changes to *UC4 connected*, with a green dot.

Press `Esc` or click the strip again to close Connections.

### If it does not connect

| You see | What to do |
| --- | --- |
| *MIDI access was blocked* | Allow **MIDI devices** for this site in the browser's site settings (the icon left of the address), then press **Connect UC4 again**. |
| *No UC4 found* | Connect the UC4 by USB and switch it on. The editor notices it by itself. |
| *Several ports match* | Select the one that is your UC4 in the list. |
| *This browser can't talk to MIDI devices* | Open the editor in Chrome or Edge. |

## Before you send anything to the UC4

Receiving a dump on the UC4 **overwrites its setups**. Make a `SndA` backup of all 18 setups first.
[From and to the UC4](device.md) shows how.

## Next

Go on with [The editor](editor.md).
