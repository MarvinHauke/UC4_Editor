# 0013 — CC tables for instruments

_Stage: draft — from the 0008 grilling (user, 2026-11-26, decision 21); grill after 0008 is built._
_Owner: uc4-model (tables, storage), uc4-ui (monitor names, picker) · Depends on: 0008_

## Problem

The MIDI monitor shows an instrument's messages as raw numbers ("CC 74 ch 2"). The user has to know what each
number does on the synth before mapping it to a UC4 control, and names a group label by hand.

## Design

A **CC table** per instrument names the monitor's rows ("CC 74 · Filter cutoff") and the mapping's result line.
Source: [pencilresearch/midi](https://github.com/pencilresearch/midi) (MIDI Guide): one CSV per device in a folder
per manufacturer, columns `manufacturer, device, section, parameter_name, parameter_description, cc_msb, cc_lsb,
cc_min_value, cc_max_value, cc_default_value, nrpn_msb, nrpn_lsb, …, orientation, notes, usage`; several hundred
devices; CC BY-SA 4.0; no manufacturer ID, model ID or port name in the files.

## Decisions

1. **Fetched on demand, never bundled** (user, 2026-11-26, 0008 R4-Q6): the editor fetches the chosen device's CSV
   from GitHub and keeps it in the library; the repo ships none of the data; credit in Settings → About and in the
   monitor. Works offline with tables already fetched. Why: no redistribution of CC BY-SA data, always current.
2. **Suggested from the port name, confirmed by the user** (user, 2026-11-26, 0008 R4-Q7): the input's port name is
   compared with `manufacturer`/`device`; without a match the user picks from a searchable list; the choice is
   remembered per input.

## Open questions

1. How the list of devices is fetched (the GitHub tree API, its rate limit, a cached index).
2. NRPN: the monitor shows NRPN as four CCs today; does 0013 join them into one row, and can the UC4 send NRPN at
   all? (It can't, per `uc4-device.md`: then NRPN rows are named but not mappable.)
3. Whether a mapping also suggests the group label or a section name from the table.
4. What a fetch failure says (offline, GitHub down, a renamed file).
5. Third-party controllers: the source has instruments only; a controller's own layout is out of scope here.

## Steps

Written by `/to-tickets` after grilling.

## Out of scope

- Editing or contributing CC tables.
- Sending anything to an instrument.
