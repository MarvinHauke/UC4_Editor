# UC4 SysEx dump format

What we know about the bytes of a UC4 dump, firmware 02.05. Owned by uc4-protocol; method in
[plan 0003](../feature-plans/0003-sysex-research.md); the engine that uses it is
[plan 0004](../feature-plans/0004-protocol-engine.md). This page holds only the current reading.

**Faderfox's documentation (private).** On 2026-11-25 Faderfox sent the format of the UC4 transfer (a general part and a UC4 part). The
files are private and never committed or quoted; this page cites them only as "Faderfox's documentation (private)" and writes what
they settle in our own words. A field they settle gets the confidence **confirmed (Faderfox doc)**: stated by the maker, not
shown by a fixture pair. Where a pair and the document agree, both are named. Section 11 lists every difference found.

Status 2026-11-14 (0003 step 3): dump session 1 is closed; the framing and the fields below are written
up from it.

**Confidence.** `confirmed` = shown by a fixture pair (two dumps that differ by one change on the device,
or by exactly the predicted bytes of a combined dump, plan 0003 decision 8); for a field that repeats per
control, a pair at the first and at the last control of a kind confirms it for the whole kind through the
stride (decision 5). **A code counts as `confirmed` at a field when a pair shows it there as the before or the after value**
(the user saw the label on the device for both dumps); a code that only appears in factory data or in list order
is `likely`. `likely` = fits every dump we have, but no pair shows it. `unknown` = not read.
**The encoder writes only `confirmed` fields**; everything else is copied from the raw dump it started from.

**Evidence names.** Fixtures are in `tests/fixtures/sysex/` (`.syx` + `.json` note, all SE16 `Sndc` unless
noted; `base` = SE16 after `rESc`; `factory-SndA` = all 18 setups after `rESA`, no user data). **Backup** =
`dumps/2026-11-13-backup-SndA.syx` (the user's real setups, 18 identical captures), `Sndc-SEnn` = the
`Sndc` series in `dumps/`. `dumps/` is committed while the repo is private and is never a fixture.

**Tools and code.** `node tools/uc4-dump.ts info|diff|note` (Node ≥ 22.18). `src/protocol/frame.ts` (frame ⇄
records, sums, write-back) and `src/protocol/image.ts` (memory image, diff, address names). The tables of this page
(field positions, code tables, per-position confidence) are written once in `src/protocol/profiles/uc4.ts`;
`src/protocol/setupCodec.ts` applies them (`decode`, `encode`, `unknownRegions`, `diff`). The factory SndA the encoder
patches without a base is generated from `factory-SndA.syx` by `node tools/uc4-factory.ts write` (`check` verifies it).

## 1. Framing

A message is `F0`, a header, records, a trailer and `F7`.

| What | Value | Confidence | Evidence |
|---|---|---|---|
| Start / end | `F0` … `F7` | SysEx standard | all dumps |
| Manufacturer id | `00 00 00` after `F0` | confirmed (Faderfox doc): every Faderfox message starts `F0 00 00 00`, three zero bytes as the inventor id | all dumps |
| Token | every payload byte is 3 bytes `4c 2h 1l`: command nibble `c`, then the value `(h<<4)\|l` (the scheme of the EC4 script, plan 0003 decision 7) | confirmed, and confirmed (Faderfox doc): command byte high nibble 4, data MSB high nibble 2, data LSB high nibble 1; only `F0`/`F7` are single bytes | every dump parses completely |
| Header | commands `1`, `2`, `3`, `4` in this order, one token each | confirmed | all dumps |
| Header cmd 1 = `06` | download start (`41` in Faderfox's names): the device id; `06` = UC4 | confirmed (Faderfox doc) | all dumps |
| Header cmd 2 | download type: `03` = `SndA` (all setups), `02` = `Sndc` (one setup); **`01` = the firmware** (never written by the editor, §9b) | confirmed (pairs and Faderfox doc) | `SndA` vs `Sndc` dumps |
| Header cmd 3, 4 | firmware version and sub-version (`02`, `05` = 02.05, the user's firmware); whether the device checks them on receive is unknown | confirmed meaning (Faderfox doc); other firmware values untested | all dumps |
| Record | cmd `9` address high byte, cmd `A` address low byte, then 64 × cmd `D` (data byte), cmd `B` sum high byte, cmd `C` sum low byte, then padding. Faderfox calls it a page: at most 64 data bytes, 234 bytes on the wire when full | confirmed (pairs and Faderfox doc: page-number commands `49`/`4A` are a memory address, `4D` data, `4B`/`4C` sum) | 452+ records in every dump |
| Short record | the group-name record of a `Sndc` has 32 data bytes (the sum covers those 32) | confirmed | all `Sndc` |
| Record sum | 16-bit sum (mod 65536) of the record's data bytes; the address is not covered | confirmed (also Faderfox doc: a 16-bit register adds the values of the data commands only) | matches in every record of every dump |
| Padding | 30 × `00` after every record's sum command; no zeros elsewhere | confirmed (also Faderfox doc: required at the end of every page for the transfer to succeed) | all dumps; length adds up exactly |
| Trailer | one token cmd `F` (`4F` download stop) = the device id `06`, then `F7`; a message ends sum, sum, stop, `F7` | confirmed (also Faderfox doc: the stop command carries the device id) | all dumps |
| Message length | `SndA`: 100,640 bytes (430 full records); `Sndc`: 5,072 bytes (21 full records + one 32-byte record = 22) | confirmed | all dumps |
| `SndA` is one message | one `F0 … F7` with the same record framing, not 18 `Sndc` in a row (answers the open question of 0003); it carries all 20 setup memories (18 setups and the two internal copy slots, §2) | confirmed (backup; Faderfox doc: type `03` is one download of all setups) | the backup |
| Deterministic | 18 `SndA` of unchanged setups are byte-identical (no counter, no timestamp); a reset `Sndc` equals `base` byte for byte | confirmed | backup ×18; `base` vs the dump after `rESc` |
| Round trip | `writeFrame(parseFrame(x))` = x byte for byte (sum and padding kept as received; `lossless` is false otherwise) | confirmed (tests) | `tests/protocol/fixtures.test.ts` over every fixture |

Framing and record sums are `confirmed` (plan 0004 decision 15): the rule matches every record of every fixture, checked by
`tests/protocol/engine-parse.test.ts`. `parse` refuses a message with a wrong sum (`bad-checksum`), length or record count
(`wrong-length`) or header cmd 2 (`unknown-message-type`); an unknown firmware (header cmd 3/4 other than `02 05`) only warns.

What the device checks on receive (sums, padding, header) is **not known**: it needs a send test (user's yes,
fresh `SndA` backup). Faderfox's documentation says the 30 padding bytes matter for a successful transfer and the sum is per page,
so the encoder keeps writing both exactly as the device wrote them. The manufacturer id, header cmd 1 and the meaning of cmd 3/4
are now confirmed (Faderfox doc); the firmware values other than `02 05` are still untested.

## 2. Memory image and slots

Records place data at 16-bit addresses; together they form one image. `SndA` covers `0x1480`–`0x7FFF`
(27,520 bytes, no gaps, no overlap). A `Sndc` covers the three regions of its own setup; every byte equals
the `SndA` byte at the same address (0 differences, six `Sndc` compared), so a `Sndc` is a subset of the
`SndA` image. Setup `s` = 1…18 is `SE01`…`SE18`.

| Region | Address (setup `s`) | Size | What | Confidence |
|---|---|---|---|---|
| Group names | `0x1480 + 0x20·(s−1)` | 32 | 8 encoder-group names × 4 characters (§5) | stride 4 per group confirmed; stride 0x20 per setup confirmed (below, six cuts) |
| Copy slot 19, names | `0x16C0`–`0x16DF` | 32 | the 19th slot's names (setup-19 address; `FF` when empty); see "Copy and paste" | likely; that slots 19 and 20 exist and are internal copy slots: confirmed (Faderfox doc) |
| Copy slot 20, names | `0x16E0`–`0x16FF` | 32 | the 20th slot's names; all `FF` in every dump seen. Earlier called "filler": it is a setup memory | confirmed (Faderfox doc: group data covers 20 setups, 640 bytes); content `FF` seen |
| Fader 9 table | `0x1700 + 0x40·(s−1)` | 64 | 8 records × 5 bytes, then 24 × `FF` (§4) | stride 5 per group confirmed; stride 0x40 per setup confirmed (below, six cuts) |
| Copy slot 19, fader 9 | `0x1B80`–`0x1BA7` | 40 | the 19th slot's fader 9 (8 records × 5 bytes) | likely |
| Copy slot 19, free bytes | `0x1BA8`–`0x1BBF` | 24 | unused | confirmed (Faderfox doc: 24 bytes free per crossfader table) |
| Copy slot 20, fader 9 table | `0x1BC0`–`0x1BFF` | 64 | the 20th slot's table (40 data + 24 free); all `FF` in every dump seen. Earlier part of "filler" | confirmed (Faderfox doc: 20 tables of 64 bytes) |
| Setup block | `0x1C00 + 0x500·(s−1)` | 1,280 | 20 fields of 64 bytes (§3) | field layout confirmed; stride 0x500 per setup confirmed (below, six cuts) |
| Copy slot 19, block | `0x7600`–`0x7AFF` | 1,280 | the 19th slot's setup block (`FF` when empty) | likely |
| Copy slot 20, block | `0x7B00`–`0x7FFF` | 1,280 | the 20th slot's setup block; all `FF` in every dump seen. Earlier "(end)" | confirmed (Faderfox doc: 20 setups × 25,600 bytes / 20) |

The three areas end exactly at `0x16FF`, `0x1BFF` and `0x7FFF`; together they are 27,520 bytes, the whole of a `SndA` (confirmed, Faderfox doc and every dump). The device sends and receives slots 19 and 20 with the rest. Whatever is not in these three areas is not part of the transfer (see the area guard, §9b).

**Where SE16 lives** (the scratch setup of every pair): names `0x1660`, fader 9 table `0x1AC0`, block
`0x6700` (`0x1C00 + 0x500·15`).

**A `Sndc` has 22 records:** the 32-byte name record, one 64-byte fader 9 row, and the 20 fields of the block
(one record each). The header is identical in every `Sndc` (`06 02 02 05`; SE01, 02, 09, 16, 17, 18 seen), so
the **slot is not in the header, only in the addresses**. **Slot layout (stride `0x20` / `0x40` / `0x500`) is
`confirmed` for what the UC4 sends** (architect's decision, 2026-11-18): six slots across both ends, SE01, 02, 09, 16, 17
and 18, cut from a `SndA` of the same state by `cutSlot` equal their device `Sndc` byte for byte
(`tests/protocol/engine-cutslot.test.ts`; SE16, SE09, SE17 and SE18 are checked against fixtures of factory data, SE01 and SE02 hold the user's own setups and are checked only when `dumps/` is present). **`likely`: "a received `Sndc` is stored at the addresses it names"**: seen
only for SE16 (4 sends and 2 damaged files). It is not a gate for sending: a send writes the device's own bytes back to
the addresses they were read from, plus confirmed fields, and the device checks the sum per record. Whether the device
accepts a `Sndc` written at another slot's addresses (a "copy to another slot") is untested.

**Not in the image:** the current setup, the routing (`Rou0`–`Rou6`) and other global state. Nothing outside
the three regions changes with a setup, and nothing below `0x1480` is dumped. Faderfox's documentation names exactly three data areas
for the transfer, so these are not part of it (confirmed (Faderfox doc)): the editor can neither read nor set them over SysEx.

## 3. Setup block (`0x1C00 + 0x500·(s−1)`)

20 fields of 64 bytes, four kinds × five properties:

| Fields | Kind | Model type |
|---|---|---|
| F0–F4 | encoders (`Enc1`…`Enc8` of an encoder group) | `Encoder` |
| F5–F9 | push buttons (`Pbt1`…`Pbt8` of an encoder group) | `PushButton` |
| F10–F14 | green buttons (`btn1`…`btn8` of a fader/button group) | `GreenButton` |
| F15–F19 | faders 1–8 (`FAd1`…`FAd8` of a fader/button group); fader 9 is its own table (§4) | `Fader` |

Faderfox's documentation lists the same order (encoders, encoder keys = our push buttons, keys = our green buttons, faders; each as type/channel, number, lower, upper, mode/scale) and the same 64-byte fields, so **the layout of the block is confirmed (Faderfox doc)** for all four kinds, and with it the group-major byte `8·(g−1) + (n−1)` of every kind. Field `f` of the block starts at `block + 64·f`. Inside a field, **control `n` of group `g` is byte
`8·(g−1) + (n−1)`** (group-major; confirmed by `enc876g8-stride`: control-major would have hit other bytes).
The two group selections are independent: encoders and push buttons use the 8 encoder groups, green buttons
and faders the 8 fader/button groups.

The five fields of a kind, in order:

| Field | Encoding |
|---|---|
| +0 channel/type | low nibble = channel − 1 (`0`–`F`); high nibble = type code (§6) |
| +1 number | plain 0…127 |
| +2 lower | plain 0…127 |
| +3 upper | plain 0…127 |
| +4 mode/display | high nibble = mode code, low nibble = display code (§6); Faderfox calls it mode and **scale** |

**Confidence per kind and property.** "Control 1" = group 1, control 1; "control 8" = group 8, control 8
(the last control of the kind). A cell says what the pairs show **at those two controls and for the encoder
kind's whole layout**; the next paragraph says what that means for the controls in between.

| Property | Encoder | Push button | Green button | Fader | Fader 9 record |
|---|---|---|---|---|---|
| channel | confirmed | confirmed | confirmed | confirmed | confirmed (group 8) |
| number | confirmed | confirmed | confirmed | confirmed | confirmed (group 1) |
| lower | confirmed | confirmed | confirmed | confirmed | confirmed (group 4) |
| upper | confirmed | confirmed | confirmed | confirmed | confirmed (group 8) |
| type | confirmed (all 7 codes at control 1; `CCr1` at control 8, `enc8g8-CCr1`; confirmed at both ends, so between them too, 0004 decision 12) | confirmed (all 5; `CC` also at control 8) | confirmed (4 codes at control 1, `CC` at control 8) | confirmed (all 4 at control 1, `PrGC` at control 8) | per code, all four confirmed: `CCAb`, `PrGC` (group 6, before/after), `Pbnd`, `AFtt` (group 1, `fad9g1-Pbnd`, `fad9g1-AFtt`) |
| mode | confirmed (`Acc0`–`Acc3`; `Acc0` at control 8) | confirmed (`toGL` at controls 1 and 8) | confirmed (`toGL` at control 1 and, `combined-se16`, at control 8) | confirmed (`SnAP` at controls 1 and 8) | per code: `JMP`, `SnAP` confirmed (group 7) |
| display | confirmed (all 3; `OFF` at control 8) | **a scale field exists** (Faderfox doc: the encoder key has mode in the high nibble and a scale in the low nibble) but its values are not listed for the push button and the manual shows none; 0 in every factory-like setup; the model has no push display, the encoder never writes it | confirmed (all 3 at control 1; `OFF` at control 8) | confirmed (all 3 at control 1; `OFF` at control 8, `combined-se16`) | per code, all three confirmed: `Std`, `OFF` (group 5), `bPoL` (group 1, `fad9g1-bPoL`) |

**Order and stride for the other three kinds.** Group-major order (`8·(g−1)+(n−1)`) is proved for the
encoder kind by `enc876g8-stride` (offsets 62 and 61, which control-major would put at 55 and 47). For push button,
green button and fader the first pairs sat at byte 0 (group 1, control 1) and byte 63 (group 8, control 8), **the same
byte under group-major and control-major**, so they did not tell the orders apart and the other controls were `likely`.
The combined SE16 dump (`combined-se16`, 2026-11-16) settles it with off-diagonal controls: `Pbt8` of group 1 landed at
byte 7 (control-major: 56), `btn1` of group 8 at byte 56 (control-major: 7), `FAd8` of group 1 at byte 7. So the order
is **confirmed group-major for push button, green button and fader**, and the encoder writes those kinds at every
control (0004 decision 14, applied 2026-11-16).

Whether a user can edit `lower`/`upper` for a given type (the device ignores them for some types) is a
device-profile question for uc4-model, not a format question: the dump always stores all five fields.

## 4. Fader 9 table (`0x1700 + 0x40·(s−1)`)

Fader 9 has no block field. Its table holds **8 records of 5 bytes, one per fader/button group**, at
`0x1700 + 0x40·(s−1) + 5·(g−1)`: the same five properties as a control (channel/type, number, lower, upper,
mode/display), then 24 × `FF`. Factory: `[s−1, 70, 00, 7F, 01]` (CC 112, JMP, Std) in SE01–16; `[0D, 30, 00, 7F, 01]`
in SE17/18 (CC 48, channel 14).

Faderfox's documentation calls this table the crossfader data (our fader 9) and lists the same 5 bytes per group and 24 free bytes after them (confirmed (Faderfox doc)).

**Confirmed** (SE16): record layout and group stride 5 by `fad9g1-n113`, `fad9g4-L001`, `fad9g8-ch01`; byte 3
upper, byte 4 high nibble mode, byte 0 high nibble type, byte 4 low nibble display by `fad9-g876`,
`fad9g5-dispOFF`. It is a `Fader` in the model (index 9 of `faders`), with the fader code tables; the codes are confirmed per code (§3, 0004 Q14).

## 5. Group names (`0x1480 + 0x20·(s−1)`)

8 encoder-group names of 4 bytes each, in group order; group `g` at `0x1480 + 0x20·(s−1) + 4·(g−1)`, character
`c` (1–4) at `+ (c−1)`. The case is not stored (7-segment display). Factory: SE01–16 `GrP1`…`GrP8`, SE17/18
`Snd1 Snd2 Snd3 Snd4 traC RAC PAn GLOb`.

**Confidence.** All 32 positions are **confirmed**: group stride 4 and character 1 for groups 1 and 2 by session 1;
characters 2–4 of groups 1–2 and every character of groups 3–8 by the combined name dumps `names-g1-4` and `names-g5-8`
(2026-11-16, below). The encoder writes a name character only when its **code** is `confirmed`; an unchanged name is
copied from the base.

Character codes (hex). **Confirmed** = a character changed to it between two dumps (SE16, session 1 batch 8/8b);
**factory** = seen only in factory names, no change to it captured (counts as `likely`: the encoder does not write it); **likely** = from list order. Since 2026-11-16 only `o` (`17`) was left of these; Faderfox's list settled it on 2026-11-25.

| Code | Character | Confidence |
|---|---|---|
| `00` | `0` | confirmed (`g1name-0`) |
| `01`–`08` | `1`–`8` | confirmed (`names-g5-8`: group 5 `1234`, group 6 `5678`) |
| `09` | `9` | confirmed (`g1name-9`) |
| `0A` | `a` | confirmed (`names-g1-4`: group 1 char 2 and group 4 char 1) |
| `0B` | `b` | confirmed (`names-g1-4`) |
| `0C` | `c` | confirmed (`names-g1-4`) |
| `0D` | `d` | confirmed (`names-g1-4`) |
| `0E`, `0F` | `e`, `f` | confirmed (`names-g1-4`; list order, no gap: `a`…`t` = 19 letters = `0A`…`1C`) |
| `10` | `g` | confirmed (before value of `g1name-0`, `g2name-l`) |
| `11`, `12` | `h`, `i` | confirmed (`names-g1-4`) |
| `13` | `j` | confirmed (`g1name-j`) |
| `14` | `l` (**no `k`** on the device) | confirmed (`g1name-l`, `g2name-l`) |
| `15` | `m` | confirmed (`names-g1-4`) |
| `16` | `n` | confirmed (`names-g1-4`) |
| `17` | `o` | confirmed (Faderfox doc: the device's list puts `O` at index 23); no pair shows it (planned for group 4 char 1, the user set `a` instead); the encoder writes it since engine 0.13.0 (architect's OK, 2026-11-25; `tests/protocol/name-o.test.ts`) |
| `18` | `p` | confirmed (`names-g5-8`: group 7 `rprp`) |
| `19` | `q` | confirmed (`names-g1-4`) |
| `1A` | `r` | confirmed (`names-g5-8`) |
| `1B` | `s` | confirmed (`names-g1-4`) |
| `1C` | `t` | confirmed (`names-g1-4`) |
| `1D` | `u` (`u` and `v` show the same sign; one code) | confirmed (`g2name-u`) |
| `1E` | `x` (looks like `H`) | confirmed (`g2name-x`) |
| `1F` | `y` | confirmed (`g2name-y`) |
| `20` | `z` (looks like `2`) | confirmed (`g1name-z`) |
| `21` | symbol 1: middle segment `-` | confirmed (`g2name-sym1`) |
| `22` | symbol 2: bottom segment `_` | confirmed (`g2name-sym2`) |
| `23` | symbol 3: upper left `'` | confirmed (`g2name-sym3`) |
| `24` | symbol 4: upper left + upper right `"` | confirmed (`g2name-sym4`) |
| `25` | symbol 5: bottom + middle | confirmed (`g2name-sym5`) |
| `26` | symbol 6: all off = blank (space) | confirmed (`g2name-sym6`) |

Faderfox's documentation gives the device's list of 39 characters in order: `0`–`9`, `A b C d E F G H I J`, `L M n O P Q r S t U`, `X Y Z`, then `-` `_` `'` `"` `=` and blank; there is no `K`. Index = code, so it agrees with every row above (all 39 codes `00`–`26`, including `o` = `17`); it settles the whole table as confirmed (Faderfox doc), and the group name as 8 groups × 4 characters per setup.

Symbol 5 (`25`, bottom + middle segment) is `=` (plan 0002, decided 2026-11-14). The device's list is
`a b c d e f g h i j l m n o p q r s t u x y z` (no `k`, no `w`, `u`/`v` one sign; user, batch 8b): `a`…`t` are the
19 codes `0A`…`1C`, then `u` `1D`, `x` `1E`, `y` `1F`, `z` `20`. Each pair changed exactly one byte.

## 6. Value codes

Position in the device's list, 0-based; every value seen in the backup fits.

| What | Code | Confidence |
|---|---|---|
| Encoder type (+0 high) | `0` CCr1, `1` CCr2, `2` CCAb, `3` PrGC, `4` CCAh, `5` Pbnd, `6` AFtt | confirmed, all seven (`enc1-*` pairs; `PrGC` by `enc1-PrGC`) |
| Push button type (+0 high) | `0` OFF, `1` notE, `2` CC, `3` PrGC, `4` AFtt | confirmed, all five (`pbt1-*`) |
| Green button type (+0 high) | `1` notE, `2` CC, `3` PrGC, `4` AFtt; **no `OFF`** (device list, user 2026-11-13) | confirmed (`btn1-CC`, `btn1-PrGC`, `btn1-AFtt`; `notE` is the factory value) |
| Fader type (+0 high; fader 9: confirmed per code, §3) | `0` CCAb, `1` PrGC, `2` Pbnd, `3` AFtt: **its own table**, not the encoder's | confirmed (`fad1-PrGC`, `fad1-Pbnd`, `fad1-AFtt`; fader 9 `PrGC`, `Pbnd`, `AFtt`) |
| Encoder mode (+4 high) | `0` Acc0, `1` Acc1, `2` Acc2, `3` Acc3 | confirmed (`enc1-Acc*`, `enc8g8-Acc0`) |
| Push, green button mode (+4 high) | `0` btn, `1` toGL | confirmed (`pbt1-toGL`, `btn1-toGL`) |
| Fader mode (+4 high; fader 9: per code, §3) | `0` JMP, `1` SnAP | confirmed (`fad1-SnAP`, `fad9-g876`) |
| Display (+4 low), encoder, fader | `0` OFF, `1` Std, `2` bPoL | confirmed (`enc1-dispOFF`, `enc1-bPoL`, `fad1-dispOFF`, `fad1-bPoL`; fader 9 `fad9g1-bPoL`) |
| Display (+4 low), green button | `0` OFF, `1` Std, `2` EXt | confirmed (`btn1-dispOFF`, `btn1-EXt`) |
| Push button +4 low nibble | not a display: 0 in factory-like setups; SE02 (user-edited) has `01`/`02` there | unknown; the encoder never writes it |
| Channel | stored as channel − 1, low nibble of +0 | confirmed |

Faderfox's documentation gives the same code tables for all five properties and adds what the device does with a value outside them (it converts it, so such a byte is not a stored setting): key (green button) type, encoder-key (push) type and encoder type: to code 2 (`CCAb` for the encoder, `CC` for the buttons); fader type: to 0 (`CCAb`); key and fader mode: to 0 (`btn`, `JMP`); encoder mode: to 3 (`Acc3`); every scale: to 1 (`Std`). Channels are `0`–`F`, number, lower and upper `00`–`7F`; the number is not used by `PrGC`, `AFtt` and `Pbnd` (any value may sit there). The documentation lists scales only for the key (`OFF`, `Std`, `EXt`) and the encoder (`OFF`, `Std`, `bPoL`); the fader's `bPoL` rests on our pairs alone, it does not contradict the document.

A byte whose nibble is outside these tables is read as a problem (the decoder reports the field and keeps
the byte), never mapped silently.

## 7. Behaviour of the device that shapes the encoder

- **The number drops to 31 when the type becomes `CCAh`** (confirmed, `enc1-CCr1-n127` → `enc1-CCAh-clamp`: type byte
  `00`→`40` and number byte `7F`→`1F`). `CCr1`/`CCr2` keep `7F` (`enc1-CCr2-n127`, `enc1-CCr1-n127`). It is the device
  clamping on a type change (`CCAh`: MSB 0–31, the LSB is number + 32), not a rule of the format: the encoder writes what
  the model holds and never clamps silently; validation (`CCAh` ≤ 31) is uc4-model's. Other types may clamp too: not checked.
- **Dumps are deterministic**, and an accidental press (the user's `btn1` press in `enc1-PrGC-back-CCAb`) changed no
  byte: that dump is byte-identical to `enc8g8-n104`.
- **Display order of the encoder types equals the code order** (user, 2026-11-13).

## 8. Factory check

The model "factory table + the codes above" predicts every byte of the block and the fader 9 table of SE03–SE16 in
the backup: 0 deviations in 14 setups (`factory-SndA` also equals `factorySetup(1…18)` control for control, checked by a script; 0004 makes it a test).
SE01 differs in 1 byte (`Enc1` group 1 mode `Acc2`, the user's edit), SE02 in 130 (the user's main setup). SE17/18
match their irregular factory table (channels 13/14, permuted notes, fader CC 40–47, `OFF`/`notE` push pattern); SE18
group 6 encoder channel 13 is factory (a typo in the manual table).

## 9. Open rows

| Open | Why it matters | How to settle it |
|---|---|---|
| A received `Sndc` is stored at the addresses it names (slot stride confirmed for what the UC4 sends, §2) | a send to a slot other than SE16 | `likely`, accepted untested by the architect (2026-11-18); Faderfox's documentation says the page header is a memory address, which supports it but does not state it for one setup; settled by the first non-SE16 send and a new `SndA` |
| Copy to another slot | moving a setup between slots | send a `Sndc` with another slot's addresses and read back (user's yes, fresh `SndA` backup, a named scratch slot) |
| ~~Routing `Rou0`–`Rou6`, current setup~~ | settled (Faderfox doc): not in the three data areas, so not in the transfer | none |
| Push button +4 low nibble | the device has a scale field there (Faderfox doc), values for the push button not listed; the manual shows none; SE02 uses it | pair on a push button, or ask Faderfox (0001 decision 14) |
| ~~Group-name characters 2–4 and groups 3–8~~ | settled by `names-g1-4`, `names-g5-8` | none |
| ~~Name codes `e f h i m q`~~; `o` | all but `o` settled by pairs; `o` settled by Faderfox's list (confirmed (Faderfox doc)) | the encoder writes it since 2026-11-25 |
| Per-type clamps other than `CCAh` | validation ranges | change type with high values (`Pbnd`, `AFtt`, `PrGC`) |
| `lower`/`upper` meaning per type, `CCAh` LSB | UI hints | manual + pairs |
| What the device checks on receive (sums, padding, header cmd 3/4) | whether a generated dump is accepted | send test (user's yes); Faderfox says the padding and the per-page sum matter |
| ~~Header cmd 1 = `06`~~ | settled (Faderfox doc): the device id of the UC4; cmd 3/4 = firmware and sub-version, values for other firmware untested | none |
| What `FF` regions are | whether the device needs them | settled in part (Faderfox doc): the 24 bytes after each fader 9 table are free (unused); slots 19/20 are real setup memories; a send test shows whether `FF` content matters |

## 9b. How the engine reads it (`decode`, plan 0004 step 2)

`decode` reads every control of the four kinds (8 groups × 8 controls), fader 9 of each group, and the eight group
names of each slot present in the message. It reads `likely` fields too (decision 14); the confidence only matters
to `encode` and to `unknownRegions`. A value outside the code tables (a type or mode code not in §6, green-button type
`0`, a number above 127, a name code above `26`) is *not* mapped: the model keeps the factory value and the field is
listed in `DecodedSetup.unreadable`.

`unknownRegions` = image bytes not wholly covered by confirmed fields, **position by position**: a byte is confirmed when
every nibble in it has a spec confirmed at that control's position (within one kind a nibble is confirmed between the ends only if it is confirmed at both ends: push button, green button, fader: every nibble with a spec, at every control, since `combined-se16` and `enc8g8-CCr1` (decisions 12 and 14); encoder: every nibble; fader 9: every group). The push-button `+4` low nibble has no spec, so those bytes are always listed.
A group-name byte counts as confirmed at every position (since 2026-11-16); the code of a character is per value
(`nameCodes`, used by `encode`).

**Writing (`encode`, plan 0004 step 3).** `encode` patches a copy of the base dump: for every field it compares the
request with what `decode(base)` gives and writes only the fields that differ. A changed field is written only when its
position **and** its code are `confirmed` (the tables of `profiles/uc4.ts`); otherwise the whole call fails with
`unconfirmed-fields` and the list. The sum of every changed record is recomputed; header, padding, trailer and every
other byte come from the base. A nibble is changed alone: the other nibble of its byte stays as in the base. Evidence:
for each of the 80 fixture pairs the predecessor plus the noted change encodes to the device's own dump byte for byte,
sums included (`tests/protocol/engine-encode.test.ts`). A field that is unreadable in the base (a byte outside the code tables)
is only written when the request differs from its factory fallback; unchanged, the base byte survives. A setup whose own
`slot` differs from the slot it is written to is refused as a slot move. What the device accepts on receive is still untested (send test).

**With a `source`** (engine 0.9.0, plan 0007 step 3.1) `encode` first copies a setup's group-name, fader 9 and block regions from the dump it came from, so a `SndA` built from setups of several dumps keeps their unknown bytes (e.g. the push `+4` low nibble). Same slot only.

**`cutSlot`** (engine 0.11.0) builds a `Sndc` from a `SndA`: a `Sndc` is the SndA's slot at the same addresses (names 32 bytes at `0x1480 + 0x20·(s−1)`, fader 9 row, block), header command 2 `02` instead of `03`, other header values, padding and trailer as in the SndA. `confirmed`: cutting SE16 / SE01 / SE02 / SE09 / SE17 / SE18 from the SndA of the same state gives the device's `Sndc` byte for byte (`tests/protocol/engine-cutslot.test.ts`).

**Without a base** `encode` patches the factory SndA (all 18 setups after `rESA`, firmware 02.05; the same bytes as the
fixture, `profiles/uc4Factory.ts` rebuilds the frame around the generated image, a test compares it byte for byte). Only a
SndA can be built that way; a Sndc needs a Sndc base (`no-base`). Every setup the request does not list keeps its factory
value, and so does every byte the model has no field for (for example the push-button +4 low nibble).

**`diff`** names each differing image byte by setup and field. A byte that holds two nibble fields gives one entry per
changed nibble; a byte (or nibble) no field covers gives `field: null`; an address outside the three per-setup regions
gives `slot: null`. `confidence` is the weakest of the field's position and the codes of both values, so a change to or from a
`likely` position or code shows as `likely`. Where one image does not cover the address (Sndc against SndA), every field
of the byte is named, weighed by its position and the present value's code. Evidence: for all 80 pairs the diff names exactly the noted fields, all
`confirmed` (`tests/protocol/engine-factory-diff.test.ts`).

**`capabilities()` and `canEncode(field, value?)`** read the same tables as `encode`: a field with a value is writable
when its position and its code are `confirmed` and the value can be stored. `capabilities().controls` is the weakest
confidence over all positions of a kind (since `combined-se16` and `enc8g8-CCr1` the four kinds read `confirmed`; fader 9 reads `confirmed` too since `fad9g1-*`); the
exact answer for a position is `canEncode`. A property test (`tests/protocol/engine-capabilities.test.ts`) tries every
code and some plain and out-of-range values at eight positions of each kind, fader 9 and the name characters, and
checks that `canEncode` is yes exactly when `encode` writes the field.

**The area guard** (engine 0.12.0, plan 0011; `src/protocol/guard.ts`, `tests/protocol/guard.test.ts`). The manufacturer's rule
(Faderfox's documentation, private): write only group names (`0x1480`, 640 bytes), crossfader (`0x1700`, 1,280 bytes) and setup
data (`0x1C00`, 25,600 bytes), 20 setups each, and download only one setup (`02`) or all setups (`03`), never the firmware
(`01`). `checkSendable(bytes)` refuses, as a result with a reason and never a throw: a message that is not read back exactly
(an unknown command such as an app function `4E`, stray bytes), a download type other than `02`/`03`, and any record whose
address range is not wholly inside one of the three areas. `encode` and `cutSlot` run it on what they make; the connection
runs it again in `sendDump` before `send`. The areas are `profile.layout.writeAreas`; the allowed types are `profile.framing.writeTypes` (`02`, `03`), a list of their own, not the types the engine can read. The areas touch each other, but a record must lie wholly inside **one** of them: a record that crosses an area edge is refused even though every byte it writes is allowed. That is deliberate (no real dump does it); do not "fix" it.

## 10. Evidence: fixture pairs

Session 1, batches 1–9: chained one-change pairs on the scratch setup SE16, `Sndc` after each (fixtures in
`tests/fixtures/sysex/`, each `.json` names its predecessor). Single-change pairs differ by **exactly one image
byte**, except `enc1-CCr1` and `enc1-CCAh-clamp` (two: the number clamp, §7); combined dumps (decision 8, `pbf*`,
`enc876g8-stride`, batch 9) differ by exactly the predicted bytes, one per control. Addresses are SE16 (`0x6700` =
`0x1C00 + 0x500·15` + field 0 + byte 0).

| Pair (from → to) | Address | Byte | Shows | Confidence |
|---|---|---|---|---|
| `base` → `enc1-ch01`: `Enc1` channel `Ch16` → `Ch01` | `0x6700` | `2F` → `20` | channel − 1 is the low nibble of field 0; the high nibble (type) is untouched | **confirmed for Enc1, group 1** |
| `enc1-ch01` → `enc1-n009`: number `n008` → `n009` | `0x6740` | `08` → `09` | field 1 = number, plain 7-bit | **confirmed for Enc1, group 1** |
| `enc1-n009` → `enc1-n127`: number `n009` → `n127` | `0x6740` | `09` → `7F` | same, up to the maximum | **confirmed for Enc1, group 1** |
| `enc1-n127` → `enc1-L001`: lower `L000` → `L001` | `0x6780` | `00` → `01` | field 2 = lower, plain 7-bit | **confirmed for Enc1, group 1** |
| `enc1-L001` → `enc1-U126`: upper `U127` → `U126` | `0x67C0` | `7F` → `7E` | field 3 = upper, plain 7-bit | **confirmed for Enc1, group 1** |
| `enc1-U126` → `enc1-CCr1`: type `CCAb` → `CCr1` | `0x6700`, `0x6740` | `20` → `00`; `7F` → `1F` | type = high nibble of field 0, `CCr1` = 0 (also the SE17/18 factory value for G5 enc 4–5). **Also** the number went `n127` → `n031` (the user passed through `CCAh` on the way, so this is the `CCAh` clamp, not a `CCr1` rule: §7) | type nibble **confirmed for Enc1, group 1** |
| `enc1-CCr1` → `enc1-CCr2` | `0x6700` | `00` → `10` | `CCr2` = 1 | **confirmed for Enc1, group 1** |
| `enc1-CCr2` → `enc1-CCAh` | `0x6700` | `10` → `40` | `CCAh` = 4 | **confirmed for Enc1, group 1** |
| `enc1-CCAh` → `enc1-Pbnd` | `0x6700` | `40` → `50` | `Pbnd` = 5 | **confirmed for Enc1, group 1** |
| `enc1-Pbnd` → `enc1-AFtt` | `0x6700` | `50` → `60` | `AFtt` = 6 | **confirmed for Enc1, group 1** |
| `enc1-AFtt` → `enc1-CCAb-n031` | `0x6700` | `60` → `20` | `CCAb` = 2; the dump differs from `enc1-U126` only in the number (`1F`) | **confirmed for Enc1, group 1** |
| `enc1-CCAb-n031` → `enc1-Acc0`: mode `Acc3` → `Acc0` | `0x6800` | `31` → `01` | field 4 high nibble = mode, `Acc0` = 0 (and `Acc3` = 3, factory) | **confirmed for Enc1, group 1** |
| `enc1-Acc0` → `enc1-Acc1` | `0x6800` | `01` → `11` | `Acc1` = 1 | **confirmed for Enc1, group 1** |
| `enc1-Acc1` → `enc1-Acc2` | `0x6800` | `11` → `21` | `Acc2` = 2 | **confirmed for Enc1, group 1** |
| `enc1-Acc2` → `enc1-dispOFF`: display `Std` → `OFF` | `0x6800` | `21` → `20` | field 4 low nibble = display scale, `OFF` = 0 (`Std` = 1) | **confirmed for Enc1, group 1** |
| `enc1-dispOFF` → `enc1-bPoL`: display `OFF` → `bPoL` | `0x6800` | `20` → `22` | `bPoL` = 2 | **confirmed for Enc1, group 1** |
| `enc1-bPoL` → `enc8g8-n104`: `Enc8` of encoder group 8, number `n103` → `n104` | `0x677F` | `67` → `68` | **stride pair**: control 8 of group 8 is byte 63 of the field (`8·7 + 7`), the last control of the kind | **confirmed** for the number field, and with it the stride (8 per group, 64 per field) for the encoder kind |
| `enc8g8-n104` → `enc1-PrGC`: type `CCAb` → `PrGC` | `0x6700` | `20` → `30` | `PrGC` = 3 | **confirmed for Enc1, group 1** |
| `enc1-PrGC` → `enc1-PrGC-back-CCAb` | `0x6700` | `30` → `20` | back to `CCAb` | confirmed |
| `enc1-PrGC-back-CCAb` → `enc1-CCAb-n127`: number `n031` → `n127` | `0x6740` | `1F` → `7F` | number again | confirmed |
| `enc1-CCAb-n127` → `enc1-CCr2-n127`: type one step down | `0x6700` | `20` → `10` | **the number stays `7F`** | confirmed |
| `enc1-CCr2-n127` → `enc1-CCr1-n127`: type one step down | `0x6700` | `10` → `00` | **the number stays `7F`** | confirmed |
| `enc1-CCr1-n127` → `enc1-CCAh-clamp`: `Enc1` type `CCr1` → `CCAh` | `0x6700`, `0x6740` | `00` → `40`; `7F` → `1F` | type `CCAh` = 4 again; **the number drops to 31 when the type becomes `CCAh`** (device behaviour, see the clamp finding) | confirmed |
| `enc1-CCAh-clamp` → `pbf1-ch01`: channel `Ch16` → `Ch01` on `Pbt1`, `btn1`, `FAd1` | `0x6840`, `0x6980`, `0x6AC0` | `1F`→`10`; `1F`→`10`; `0F`→`00` | channel − 1 = low nibble of field 0 of the push button, green button and fader; the type nibble stays (likely notE, notE, CCAb) | **confirmed** (control 1, group 1, each kind) |
| `pbf1-ch01` → `pbf1-number`: number | `0x6880`, `0x69C0`, `0x6B00` | `00`→`7F`; `40`→`41`; `20`→`21` | number, plain 7-bit, in each kind's field 1 | **confirmed** (control 1, group 1, each kind) |
| `pbf1-number` → `pbf1-lower`: lower `L000` → `L001` | `0x68C0`, `0x6A00`, `0x6B40` | `00`→`01` ×3 | lower, plain 7-bit | **confirmed** (control 1, group 1, each kind) |
| `pbf1-lower` → `pbf1-upper`: upper `U127` → `U126` | `0x6900`, `0x6A40`, `0x6B80` | `7F`→`7E` ×3 | upper, plain 7-bit | **confirmed** (control 1, group 1, each kind) |
| `pbf1-upper` → `pbf8-stride`: `Pbt8` number, `btn8` lower, `FAd8` upper (group 8) | `0x68BF`, `0x6A3F`, `0x6BBF` | `3F`→`40`; `00`→`01`; `7F`→`7E` | stride (8 per group, 64 per field) at the last control | **confirmed** for push number, green button lower, fader upper |
| `pbf8-stride` → `enc876g8-stride`: encoder group 8: `Enc8` channel, `Enc7` lower, `Enc6` upper | `0x673F`, `0x67BE`, `0x67FD` | `2F`→`20`; `00`→`01`; `7F`→`7E` | last-control pairs for the encoder channel/type, lower and upper fields; offsets 63, 62, 61 = **group-major** `8·(g−1)+(n−1)` (control-major would have hit 55 and 47) | **confirmed**: stride **and order** for the encoder kind |
| `enc876g8-stride` → `enc8g8-Acc0`: `Enc8` group 8 mode `Acc3` → `Acc0` | `0x683F` | `31` → `01` | mode nibble at the last control | **confirmed** |
| `enc8g8-Acc0` → `enc8g8-dispOFF`: display `Std` → `OFF` | `0x683F` | `01` → `00` | display nibble at the last control | **confirmed** |
| `enc8g8-dispOFF` → `pbt1-OFF`: `Pbt1` type `notE` → `OFF` | `0x6840` | `10` → `00` | type nibble of the push button, `OFF` = 0, `notE` = 1 (the before value) | **confirmed** (Pbt1, group 1) |
| `pbt1-OFF` → `pbt1-CC` | `0x6840` | `00` → `20` | `CC` = 2 | **confirmed** |
| `pbt1-CC` → `pbt1-PrGC` | `0x6840` | `20` → `30` | `PrGC` = 3 | **confirmed** |
| `pbt1-PrGC` → `pbt1-AFtt` | `0x6840` | `30` → `40` | `AFtt` = 4 | **confirmed** |
| `pbt1-AFtt` → `btn1-CC`: `btn1` type `notE` → `CC` | `0x6980` | `10` → `20` | `CC` = 2 on the green button too (as on the push button); `notE` = 1 is the before value | **confirmed** (btn1, group 1) |
| `btn1-CC` → `btn1-toGL`: `btn1` mode `btn` → `toGL` | `0x6A80` | `01` → `11` | mode = high nibble of field 4 for green buttons, `toGL` = 1, `btn` = 0 (before); low nibble `1` (likely `Std`) stays | **confirmed** (btn1, group 1) |
| `btn1-toGL` → `btn1-dispOFF`: `btn1` display `Std` → `OFF` | `0x6A80` | `11` → `10` | green button display = low nibble of field 4; `Std` = 1 (before), `OFF` = 0 | **confirmed** (btn1, group 1) |
| `btn1-dispOFF` → `btn1-EXt`: display → `EXt` | `0x6A80` | `10` → `12` | `EXt` = 2 | **confirmed** (btn1, group 1) |
| `btn1-EXt` → `pbt1-toGL`: `Pbt1` mode `btn` → `toGL` | `0x6940` | `00` → `10` | push mode = high nibble of field 4, `toGL` = 1, `btn` = 0 (before). The low nibble is 0 here and in every factory-identical setup of the SndA (SE03–SE16) and in SE17/18 (all `00`), but SE02 (user-edited) has `01`/`02` there; this fits "push buttons have no display scale" (open in plan 0002) — evidence only, still likely | **confirmed** (Pbt1, group 1; mode only) |
| `pbt1-toGL` → `fad1-SnAP`: `FAd1` mode `JMP` → `SnAP` | `0x6BC0` | `01` → `11` | fader mode = high nibble of field 4, `JMP` = 0 (before), `SnAP` = 1; low nibble `1` (likely `Std`) stays | **confirmed** (FAd1, group 1) |
| `fad1-SnAP` → `fad1-PrGC`: `FAd1` type `CCAb` → `PrGC` | `0x6AC0` | `00` → `10` | fader type = high nibble of field 0, `CCAb` = 0 (before), `PrGC` = 1: **its own table, not the encoder's** (`PrGC` is 3 there) | **confirmed** (FAd1, group 1) |
| `fad1-PrGC` → `fad1-Pbnd`: type → `Pbnd` | `0x6AC0` | `10` → `20` | `Pbnd` = 2 (order `CCAb PrGC Pbnd AFtt`, manual) | **confirmed** (FAd1, group 1) |
| `fad1-Pbnd` → `fad1-AFtt`: `FAd1` type → `AFtt` | `0x6AC0` | `20` → `30` | `AFtt` = 3 (fader table `CCAb 0, PrGC 1, Pbnd 2, AFtt 3`) | **confirmed** (FAd1, group 1) |
| `fad1-AFtt` → `fad1-dispOFF`: `FAd1` display `Std` → `OFF` | `0x6BC0` | `11` → `10` | fader display = low nibble of field 4, `OFF` = 0; mode nibble stays | **confirmed** (FAd1, group 1) |
| `fad1-dispOFF` → `fad1-bPoL`: display → `bPoL` | `0x6BC0` | `10` → `12` | `bPoL` = 2 | **confirmed** (FAd1, group 1) |
| `fad1-bPoL` → `fad9g1-n113`: fader 9, group 1 number `n112` → `n113` | `0x1AC1` | `70` → `71` | fader 9 table: 5-byte record per group at `0x1AC0 + 5·(g−1)`; byte 1 = number | **confirmed** (record layout, number) |
| `fad9g1-n113` → `fad9g4-L001`: group 4 lower `L000` → `L001` | `0x1AD1` | `00` → `01` | `0x1AC0 + 5·3 + 2`: byte 2 = lower, group stride 5 | **confirmed** |
| `fad9g4-L001` → `fad9g8-ch01`: group 8 channel `Ch16` → `Ch01` | `0x1AE3` | `0F` → `00` | `0x1AC0 + 5·7 + 0`: byte 0 low nibble = channel − 1 | **confirmed** |
| `fad9g8-ch01` → `btn1-PrGC`: `btn1` type `CC` → `PrGC` | `0x6980` | `20` → `30` | green button `PrGC` = 3 (green button has no `OFF`) | **confirmed** (btn1, group 1) |
| `btn1-PrGC` → `btn1-AFtt`: type → `AFtt` | `0x6980` | `30` → `40` | `AFtt` = 4 | **confirmed** (btn1, group 1) |
| `g2name-y` → `last-ch-num-lower` (9.1): `Pbt8` channel `Ch16` → `Ch01`, `btn8` number n127 → n126, `FAd8` lower L000 → L001 | `0x687F`, `0x69FF`, `0x6B7F` | `1F`→`10`; `7F`→`7E`; `00`→`01` | channel (push), number (green button), lower (fader) at control 8 of group 8. **Also** `0x6BBF` `7E`→`7F` (`FAd8` upper `U126` → `U127`): the user bumped an encoder by accident; that address is already confirmed by `pbf8-stride`, differs from the three predicted ones, so it does not cast doubt on them (plan 0003 decision 8, architect's reading) | **confirmed** (stride, these three fields) |
| `last-ch-num-lower` → `last-lower-ch-num` (9.2): `Pbt8` lower, `btn8` channel, `FAd8` number n111 → n110 | `0x68FF`, `0x69BF`, `0x6B3F` | `00`→`01`; `1F`→`10`; `6F`→`6E` | lower (push), channel (green button), number (fader) at the last control | **confirmed** |
| `last-lower-ch-num` → `last-upper-ch` (9.3): `Pbt8` upper, `btn8` upper, `FAd8` channel | `0x693F`, `0x6A7F`, `0x6AFF` | `7F`→`7E` ×2; `0F`→`00` | upper (push, green button), channel (fader) at the last control | **confirmed** |
| `last-upper-ch` → `last-mode-disp` (9.4): `Pbt8` mode → `toGL`, `btn8` display → `OFF`, `FAd8` mode → `SnAP` | `0x697F`, `0x6ABF`, `0x6BFF` | `00`→`10`; `01`→`00`; `01`→`11` | mode/display nibbles of field 4 at the last control | **confirmed** |
| `last-mode-disp` → `last-types` (9.5): `Pbt8` `notE` → `CC`, `btn8` `notE` → `CC`, `FAd8` `CCAb` → `PrGC` | `0x687F`, `0x69BF`, `0x6AFF` | `10`→`20` ×2; `00`→`10` | type nibble of field 0 at the last control, same code tables as control 1 | **confirmed** |
| `last-types` → `fad9-g876` (9.6): fader 9 group 8 upper → `U126`, group 7 mode → `SnAP`, group 6 type → `PrGC` | `0x1AE6`, `0x1AE2`, `0x1AD9` | `7F`→`7E`; `01`→`11`; `0F`→`1F` | fader 9 record byte 3 = upper, byte 4 high nibble = mode, byte 0 high nibble = type (fader codes) | **confirmed** |
| `fad9-g876` → `fad9g5-dispOFF` (9.7): group 5 display `Std` → `OFF` | `0x1AD8` | `01` → `00` | fader 9 record byte 4 low nibble = display | **confirmed** |
| `base` → `combined-se16` (2026-11-16, factory SE16, six changes by hand): `Pbt8` of group 1 number n007 → n008; `btn1` of group 8 number n120 → n121; `FAd8` of group 1 number n039 → n040 | `0x6887`, `0x69F8`, `0x6B07` | `07`→`08`; `78`→`79`; `27`→`28` | **order**: the off-diagonal controls landed at byte 7, 56 and 7 of their fields (group-major `8·(g−1)+(n−1)`; control-major would give 56, 7, 56) | **confirmed**: group-major order for push button, green button, fader (decision 14) |
| same pair: `btn8` of group 8 mode `btn` → `toGL`; `FAd8` of group 8 display `Std` → `OFF` | `0x6ABF`, `0x6BFF` | `01`→`11`; `01`→`00` | high nibble of green field 4 (`toGL` = 1) and low nibble of fader field 4 (`OFF` = 0) at control 8, each nibble of the byte changing alone | **confirmed** at both ends, so between them (decision 12) |
| same pair: `Enc8` of encoder group 8 type `CCAb` → `CCr1` | `0x673F` (and `0x677F`) | `2F`→`0F` (channel `Ch16` stays); `0x677F` `67`→`1F` | type nibble at control 8 (`CCr1` = 0). **Extra byte:** the number n103 → n031 was not made by hand: the user turned the type up through `PrGC` and `CCAh` to reach `CCr1` (user, 2026-11-16); the device clamps the number to 0–31 under `CCAh` and keeps it, the same drop as `enc1-CCr1` / `enc1-CCAh-clamp` (§7). Device behaviour, evidence only | not confirmed by this pair (0003 decision 8: an unpredicted byte on the same control); confirmed by the single-change dump `enc8g8-CCr1` below |
| `base` → `enc8g8-CCr1` (2026-11-16, SE16 after `rESc`, captured from the listen log): `Enc8` of encoder group 8 type `CCAb` → `CCr1`, turned **down** via `CCr2`, no `CCAh`, so no clamp | `0x673F` | `2F` → `0F` (channel `Ch16` stays) | exactly one byte changed (the user bumped an encoder by accident, a played CC value, no setup change); type nibble at control 8, `CCr1` = 0 | **confirmed** (encoder type at control 8, so between the ends too, decision 12) |

**Stride and order (decision 5), encoder kind.** Layout of an encoder-kind field: field `f` at `B + 64·f`, control `n` of group `g` at
byte `8·(g−1) + (n−1)` (group-major; control-major is ruled out by `enc876g8-stride`: `Enc7` lower and `Enc6` upper
landed at 62 and 61, not 55 and 47). All five encoder fields have a last-control pair (number `enc8g8-n104`, channel/type,
lower, upper `enc876g8-stride`, mode/display `enc8g8-Acc0`, `enc8g8-dispOFF`), so the **encoder kind is confirmed** (the type nibble is confirmed at group 1 control 1 and, by the single-change dump `enc8g8-CCr1`, at control 8 (`combined-se16` had an extra unpredicted byte there); a nibble counts as confirmed between the ends only if it is confirmed at both, 0004 decision 12). For
push button, green button and fader the order is proved by `combined-se16` (§3). The user's accidental `btn1` press in `enc1-PrGC-back-CCAb` changed no byte, and that dump is byte-identical
to `enc8g8-n104` (same sha256): dumps are deterministic and the press did nothing.
| `base` → `fad9g1-Pbnd` (2026-11-16, SE16 after `rESc`, listen log): fader 9 of group 1 type `CCAb` → `Pbnd`, turned up via `PrGC`, number unchanged | `0x1AC0` | `0F` → `2F` | exactly one image byte (4 wire bytes: the data token and the sum tokens of its record; `AFtt` and `bPoL` below change 2 each); the user bumped green button 1 once: played, no setup change. Fader 9 uses the same fader code table as faders 1–8: `Pbnd` = 2 | **confirmed** (fader 9 `Pbnd`) |
| `fad9g1-Pbnd` → `fad9g1-AFtt`: type `Pbnd` → `AFtt` | `0x1AC0` | `2F` → `3F` | `AFtt` = 3 | **confirmed** (fader 9 `AFtt`) |
| `fad9g1-AFtt` → `fad9g1-bPoL`: display `Std` → `bPoL` | `0x1AC4` | `01` → `02` | fader 9 record byte 4 low nibble, `bPoL` = 2 | **confirmed** (fader 9 `bPoL`) |
| `base` → `names-g1-4` (2026-11-16, combined dump, user's OK for names only; listen log): group 1 chars 2–4 `a b c`, group 2 chars 2–4 `d e f`, group 3 `h i m n`, group 4 `a q s t` | `0x1661`–`0x166F` (14 bytes) | `1A 18 01`→`0A 0B 0C`, … | every name byte of groups 1–4 except the two already confirmed; all changed bytes are name characters. Planned group 4 char 1 = `o`, the user set `a` (`0A`), so **`o` stays unconfirmed**; the position still changed | **confirmed**: positions groups 1–2 chars 2–4 and groups 3–4 chars 1–4; codes `0A`–`0F`, `11`, `12`, `15`, `16`, `19`, `1B`, `1C` |
| `names-g1-4` → `names-g5-8` (2026-11-16): group 5 `1 2 3 4`, group 6 `5 6 7 8`, group 7 `r p r p`, group 8 `0 z j l` | `0x1670`–`0x167F` (16 bytes) | `10 1A 18 05`→`01 02 03 04`, … | exactly the 16 predicted bytes | **confirmed**: positions of groups 5–8; codes `01`–`08`, `18`, `1A` (and `00`, `20`, `13`, `14` again) |

**Scope of the fader 9 codes.** These three pairs confirm the codes in the fader 9 table only. Faders 1–8 had all four type codes and `bPoL` confirmed already (`fad1-*`, group 1 control 1; the order and the control-8 nibbles by `combined-se16`), so they gain nothing; the fader 9 table is its own table (§4). That fader 9 and faders 1–8 share one code table is an observation (the same code gives the same value), not a rule the encoder relies on.

**Observation (live view, not a dump field; listen log 2026-11-16).** Fader 9 set to `Pbnd` sends pitch bend on channel 16 over 0…16383 (195 messages over a full throw, steps of about 129); set to `AFtt` it sends channel pressure 0…127. This is what the device sends, not what the dump stores.

**Group-name session and the rule of one change per dump.** 0003 decision 8 allows up to 3 combined changes, and Q15
asked for one name character per dump. The user decided on 2026-11-16 that this session may use two combined dumps for
names only, so these two pairs override Q15 for names (0003, 0004).

### Copy and paste (device behaviour; `likely`, one run each; 2026-11-16)

Evidence: `dumps/2026-11-16-copytest.md` (the second round) and the first round's `SndA` before and after the paste.

- **The clipboard is a 19th slot** at the setup-19 addresses: names `0x16C0` (32 bytes), fader 9 `0x1B80` (40 bytes),
  block `0x7600`–`0x7AFF` (1,280 bytes). All `FF` after `rESA` (empty). `CPYS` fills it at once. It is part of every
  `SndA`. In `SndA-after-CPYS-SE01` it equals SE01 byte for byte.
- **`CPYS` and `PStS` act only when the push button is held until the bars run.**
- **A `PStS` is stored only when setup mode is left.** A `Sndc` sent in setup mode right after the paste still shows the
  old data; after leaving setup mode it shows the clipboard (SE16 = SE01, 272 bytes different from `base`).
- **The first round's `FF`/`7F` setup was a paste of the empty (`FF`) clipboard.** Diff `SndA` backup → `SndA-after-paste`
  (`dumps/2026-11-16-SndA-after-paste.syx`): push button channel/type → `2F`, number/lower → `7F`, push `+4` → `01` (the
  unknown low nibble); green button channel/type → `2F`; encoder, fader and fader 9 number/lower → `7F`; names `FF`
  (group 1 char 1 `F6`); the upper bytes untouched. Pasting `FF` data writes the `FF` bytes into the fields, so a setup
  with such values is a paste artefact, not a setting.

**What the engine does with it.** No field of the model holds the clipboard (no decision for one). On decode → encode with
a base its bytes are kept unchanged (`tests/protocol/clipboard.test.ts`, with a filled clipboard). A `SndA` generated
without a base (the factory asset) writes an empty clipboard; known behaviour, no code change. No field confidence changes.
The decoder reads a name byte `FF` as unreadable and keeps the byte (`unreadable`, tested).

## 11. Differences from Faderfox's documentation (2026-11-25)

Our map was checked against Faderfox's documentation (private) field by field. Nothing the encoder writes is contradicted. What
changed or became sharper:

| # | What | Ours before | Faderfox's documentation | Effect |
|---|---|---|---|---|
| 1 | Slot 20 | `0x16E0`, `0x1BC0`–`0x1BFF`, `0x7B00`–`0x7FFF` called filler or end | internal copy slot 20, sent and received like the others | doc corrected (§2); no code change, decode ignores it and `encode` copies it from the base |
| 2 | Push button +4 low nibble | "none, not a display" | a mode/scale byte like the other kinds; push button scale values not listed | doc corrected (§3, §9); encoder still never writes it; uc4-model may want to know there is a field |
| 3 | Name code `o` (`17`) | unconfirmed | `O` is at index 23 of the device's list | `confirmed (Faderfox doc)` in the doc; the encoder now writes it (`NAME_CONFIRMED`, architect's OK 2026-11-25); tests of the gate mark `o` likely on purpose (`tests/protocol/markOLikely.ts`) |
| 4 | Header cmd 1 | probably the device, unknown | device id of the download start, `06` = UC4 | now confirmed |
| 5 | Header cmd 3/4 | `likely` firmware | firmware version and sub-version | meaning confirmed |
| 6 | Manufacturer id | likely | three zero bytes, the inventor id | now confirmed |
| 7 | Trailer value `06` | observed | the device id of the download stop | explained |
| 8 | Values the device converts | decoder reports them as unreadable and keeps the byte | the device itself converts them to a default (§6) | no contradiction; the decoder stays strict |
| 9 | Number of `PrGC`, `AFtt`, `Pbnd` | validation unknown | unused, any value possible | uc4-model should not reject any number there |
| 10 | Fader scale | `bPoL` from pairs | scales listed only for key and encoder | not contradicted, no Faderfox source |
| 11 | Routing, current setup | "not known" | not in the three transfer areas | settled: not transferable |
| 12 | Download type `01` | not seen | the firmware | never written; the area guard refuses it (§9b) |
| 13 | Names | "encoder-group names, 4 chars" | same; the group data holds two setups per 64-byte page, a `Sndc` sends its own 32 bytes | consistent |
