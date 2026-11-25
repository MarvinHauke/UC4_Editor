# 0012 — Onboarding: the six areas in the guide and a first-run tour

_Stage: decided (grilled 2026-11-25, Q51–Q56) — steps 1–4 in work, local branch `feat/onboarding`._
_Owner: uc4-ui (data, tour), uc4-docs (guide page) · Depends on: 0010 (dump overlay)_

## Problem

A new UC4 owner opens the editor and sees six areas at once, with no word on what each is for. No guide page
explains them together. And nothing says that the 18 setups on screen are factory setups until the owner brings
their own in (0010 audit B1).

## Design

```text
 ┌──────────────── 1 Toolbar: Import, Export, Undo, Guide, Settings ───────────────┐
 │2 Connections │ 3 Property panel │      4 Device view       │ 5 Setup list     │
 └──────────────── 6 Help line: explains what's under the mouse ────────────────┘
```

- **Area texts, once:** each area has a title and two or three sentences, kept as data in the device profile
  (`src/app/profile/uc4Tour.ts`). The tour reads them; the guide page is written from them, and a test checks that
  every title appears on the guide page.
- **Guide page "The editor":** an overview picture with six numbered markers, then one short section per area,
  then the details that are there now.
- **Tour in the editor:** the same look as the `rEc` guide and the dump overlay. The editor dims, one area at a
  time is lit with its number, and a card beside it holds the title, the sentences, "n of 7" (six areas and the closing step), Back / Next / Skip.
  Esc ends it, ← → page through. It is built on the existing guide data, not a new overlay system.
- **Last step:** "Get your own setups from the UC4", with a button that opens the dump overlay (`SndA`). Until
  then the setups on screen are factory setups; the step says so.

## Decisions

1. One text for both places, a drift test. (user, 2026-11-25, Q51)
2. The guide page: an overview with six numbers, a short section per area. (user, 2026-11-25, Q52)
3. The tour highlights one area at a time in the editor and explains it in a few words, with Back / Next / Skip.
   (user, 2026-11-25, Q53)
4. It starts by itself on first open (nothing received or imported yet, not dismissed). Settings has a **Tour**
   button that starts it again; it replaces Settings' "User guide" link. The guide stays reachable from the book
   icon in the toolbar and from the key help. "Seen" is kept in this browser only. (user, 2026-11-25, Q54)
5. The last step opens the dump overlay; this answers audit B1, and the start card is dropped.
   (user, 2026-11-25, Q55)
6. Its own plan, built locally on its own branch, pushed after the user has tried it. (user, 2026-11-25, Q56)
7. **"Seen" is written when the tour starts,** not when it ends, so a reload in the middle doesn't start it again.
   (architect, 2026-11-25, from the step 3 review)

## Steps

1. **Area texts as data, plus the drift test** — uc4-ui · blocked by: none.
2. **Guide page** — uc4-docs · blocked by: 1 · overview shot with six markers, a section per area.
3. **Tour** — uc4-ui · blocked by: 1 · dim, light, card, keys, first-run start, Settings' Tour button, "seen" stored.
4. **Last step into the dump overlay** — uc4-ui · blocked by: 3.

## Out of scope

Command mode; a tour per feature (Copy / Paste, Send); translations.
