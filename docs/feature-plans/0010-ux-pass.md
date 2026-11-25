# 0010 — UX pass

_Stage: in work — step 1 done, step 2 audit done (2026-11-19); fixes to grill (Q41–Q44)._
_Owner: architect (audit), uc4-ui (fixes) · Depends on: 0006_

## Problem

Barriers in the editor have so far been fixed as the user happened to see them. Before the editor is shown to
Faderfox and other UC4 owners, it needs one systematic look as a newcomer meets it, with fixes in order of how much
each barrier gets in the way.

## Design

- **Audit** (architect, in the browser, on its own port with the demo library, never the user's library or the
  UC4): the journeys
  1. first open without a UC4, and in a browser without Web MIDI;
  2. connect and receive (`Sndc`, `SndA`);
  3. find and edit a control, switch groups, undo;
  4. Copy / Paste of a setup, a group, a control;
  5. Send and Restore up to the open dialog (never sent);
  6. import and export a file;

  each at 1024, 1280 and 1440 px, dark and light, and once by keyboard only.
- **Ranked list** in this plan: **blocks** (the user gets stuck), **slows** (the user stops to think), **polish**;
  each finding with a picture and the journey it came from. First-run findings rank highest.
- **Fixes** as numbered steps for uc4-ui, each reviewed and browser-checked; the guide shots are retaken after.
- **Outside test:** Mathias (Faderfox) is the first outsider; his first reaction counts as the test.

## Decisions

1. Find the barriers first, then fix: the audit above, a ranked list. (user, 2026-11-19, Q36)
2. Known items go to uc4-ui at once, alongside the audit: the `rEc` callouts that cover fader labels; the
   crossfader only fades in place while the lower area slides (0006 decision 46); at 1024 px the setup list's
   stored width gives way so the device view always fits; one full look at the light theme. (user, 2026-11-19, Q37)
3. First-run barriers rank highest. (user, 2026-11-19, Q38; Mathias knows `SndA`, other owners may not.)
4. Its own plan, not more lines in 0006. (user, 2026-11-19, Q39)
5. The outside test is the mail to Mathias. (user, 2026-11-19, Q40)
6. **"How to send a dump" becomes a guide overlay** (user, 2026-11-25, Q49): the button in Connections opens the
   dimmed device view with callouts, as Send does. The card chooses **One setup (`Sndc`)** or **All setups
   (`SndA`)**; callouts: 1 Hold Shift, 2 Press Edit twice (Setup LED on), 3 Turn encoder 1 to the setup (`Sndc`
   only), 4 Hold encoder 4's (`Sndc`) or 8's (`SndA`) push button until the bars have run. The card says "Waiting for
   a dump from the UC4…" and closes by itself when a dump arrives; Close ends it. Nothing is sent. A first step
   toward B1: the start card can open it later.
7. **Work in the public repository's folder, on local branches, pushed only after the user's OK** (user, 2026-11-25,
   Q50).
8. **"Clear old dumps" leaves an empty list** (user, 2026-11-25, Q57, Q58): it deletes every dump nothing needs,
   including the newest `Sndc` per slot. What stays (the newest `SndA` as the backup for Restore, and every dump a
   setup needs for Revert, `.syx` export and the send's base) is **hidden**: the list shows only dumps received or
   imported after the clear. **Show all** shows the hidden ones too, marked ("backup", "kept for SE05"). Why: the
   list is for what just arrived; resetting to factory is more common than restoring, and the backup is still
   there when Restore needs it. Changes 0005 decisions 6/10/15 for what the list shows. The backup is the newest readable `SndA` the UC4
   sent (the one Restore and Send use); a `SndA` imported from a file is no backup and goes. (architect, 2026-11-25,
   from the step 6 review)

## Open questions

- Whether to publish the repository, or write to Mathias first (0009 decision 8; asked 2026-11-19).

## Steps

1. **Known fixes** (decision 2) — done 2026-11-19 (`b69bdc4`, `28d09c7`, `85e1e30`, light theme see git log; reviewed) — uc4-ui · blocked by: none · the four items; checks per item in the browser,
   1024 px and light theme included.
2. **Audit** (decision 1) — done 2026-11-19 (Playwright on :5176, demo library and MIDI stub; 26 shots in the architect's scratchpad; list below) — architect · blocked by: none · the journeys, the ranked list written into this plan.
3. **Fixes from the list** — uc4-ui · blocked by: 2 · one step per finding or small group, blocks first.
5. **Dump overlay** (decision 6) — done 2026-11-25 (`5231f47`, reviewed; auto-close unit-tested, the real-UC4 check is the user's; at 1024 px the card slightly overlaps `SndA` callout 3) — uc4-ui · blocked by: none · the button in Connections, the overlay from the
   guide data, the auto-close on a received dump; tests for the callouts per choice.
6. **Compact dumps list** (decision 8) — storage done (`3a0ac6f`), list in work — uc4-model (the hidden mark, the clear rule, tests), then uc4-ui (the
   list, Show all, the question's text) · blocked by: none.
4. **Guide shots retaken** — uc4-docs or architect · blocked by: 3 · `npm run docs:shots`, text checked.

## Audit findings (2026-11-19)

First open, connect, receive, edit, Copy / Paste, Send dialog (never sent), Import / Export, keyboard (25 Tab stops),
light; 1024×768, 1280×800, 1440×900. Ranked; first-run first (decision 3).

**Blocks**

- **B1 First open gives no way in.** A new owner sees 18 factory setups named SE01–SE18, and the help line says
  "Click a control to edit it". Nothing says these are not the setups on their UC4, or how to get those: Connect
  (inside the collapsed Connections strip), press `SndA`, follow "Dump received: open Connections" in the status bar,
  Review, Replace library. Four places, none on screen at the start. Risk: editing a factory setup and sending it
  overwrites the owner's real setup.
- **B2 Not yet connected:** with MIDI access not yet granted, the only sign is the vertical "UC4 not connected" in
  the closed strip; the Connect button is inside it.

**Slows**

- **S1 The first Review sounds dangerous.** Replacing an untouched factory library says "Lost: all 18 setups now in
  the editor are replaced", and the title quotes "the dump from the UC4" as if it were a file name.
- **S2 Send is below the fold at 1024×768:** the list column scrolls, `Send SE01 to UC4…` is out of view, "Reset
  all…" wraps.
- **S3 The Send hint is cut off** without a connection at 1280×800 ("Connect your UC4 first: a send" ends at the
  window edge).
- **S4 Connections drawer:** the status-bar notice "Dump received: open Connections" stays while it is open; the
  property panel's Copy button peeks out at the drawer's edge.
- **S5 "UC4 unsupported"** in the strip (no Web MIDI) says nothing about why; the text inside the drawer is good
  ("Open the editor in Chrome or Edge").

**Polish**

- **P1** The selected setup row shows "SE…" at the list's 160 px minimum. **P2** The list handle's `aria-valuemax`
  stays 420 above the cap. **P3** Callout 3 of the `rEc` guide covers the dimmed encoders 5 and 6. **P4** At
  1024×768 the encoder panel still scrolls by about one field. **P5** `device-send.png` shows the old callouts.

Fine as is: the keyboard order (toolbar, panel, device, list), the light theme, the Import question, Copy / Paste.

## Out of scope

Command mode, the Archive `.zip`, live view: their own plans.
