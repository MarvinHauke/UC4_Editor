# How it works

This page is for UC4 owners who want to look under the hood, and for Faderfox. It describes the
dump the UC4 sends and receives, as far as the editor knows it. You do not need it to use the
editor.

Everything here was read from dumps with **firmware 02.05**.

## How sure we are

Every fact has one of three levels:

| Level | Meaning |
| --- | --- |
| **confirmed** | Shown by a pair of dumps that differ by one change made on the UC4 (or by exactly the bytes predicted for a combined dump). |
| **likely** | Fits every dump we have, but no pair shows it. |
| **unknown** | Not read yet. |

**The editor writes only confirmed fields.** Every other byte is copied unchanged from the dump the
setup came from (for all setups without such a dump: from the factory dump). So reading a real dump and writing it back gives the same bytes. Bytes the editor
does not understand are kept, not dropped.

## The dump

A dump is one SysEx message: `F0` … `F7`.

| Part | What it is | Level |
| --- | --- | --- |
| Manufacturer id | `00 00 00` after `F0` | likely |
| Encoding | Every payload byte is three bytes `4c 2h 1l`: a command nibble, then the value as two nibbles | confirmed |
| Header | Four commands in this order. The second says what the message is: `02` = `Sndc` (one setup), `03` = `SndA` (all 18). The third and fourth, `02 05`, match firmware 02.05 | message type confirmed; firmware values likely |
| Records | Each record has a 16-bit address, 64 data bytes, a 16-bit sum and 30 bytes of padding (`00`) | confirmed |
| Sum | The 16-bit sum of the record's data bytes. The address is not part of it | confirmed |
| Trailer | One closing command, then `F7` | confirmed |

A `SndA` is 100,640 bytes (430 full records). A `Sndc` is 5,072 bytes (21 full records and one
32-byte record). A `SndA` is one message, not 18 `Sndc` in a row (likely). Dumps are deterministic:
two dumps of unchanged setups are byte for byte the same, with no counter and no time stamp.

## Where a setup lives

The records write into one memory image. A `SndA` covers `0x1480`–`0x7FFF`. A `Sndc` carries the
same bytes for its own setup only: its bytes equal the `SndA` bytes at the same addresses.

For setup `s` (`SE01` is 1, `SE18` is 18):

| What | Address | Size |
| --- | --- | --- |
| Encoder group names | `0x1480 + 0x20·(s−1)` | 32 bytes |
| Fader 9 table | `0x1700 + 0x40·(s−1)` | 64 bytes |
| Setup block (the controls) | `0x1C00 + 0x500·(s−1)` | 1,280 bytes |

A `Sndc` has no slot number in its header: the slot is only in the addresses. That layout is
**confirmed for what the UC4 sends**. Whether the UC4 stores a `Sndc` at the addresses it names is
only **likely**, because it has been seen for `SE16` only.

The UC4 also has a copy buffer for its copy and paste function. Its bytes sit at `0x16C0`–`0x16DF`,
`0x1B80`–`0x1BA7` and `0x7600`–`0x7AFF` (likely). The editor does not write them. The current
setup and the routing (`Rou0`–`Rou6`) were not found in any dump.

## The controls

The setup block has 20 fields of 64 bytes: five properties for each of four kinds of control.

| Fields | Kind |
| --- | --- |
| 0–4 | Encoders (`Enc1`–`Enc8` of an encoder group) |
| 5–9 | Push buttons |
| 10–14 | Green buttons (of a fader/button group) |
| 15–19 | Faders 1–8 (of a fader/button group) |

Inside a field, control *n* of group *g* is byte `8·(g−1) + (n−1)`. The two group selections are
independent: encoders and push buttons use the 8 encoder groups, green buttons and faders use the 8
fader/button groups. The five fields of a kind:

| Field | Holds |
| --- | --- |
| +0 | Low nibble: channel − 1. High nibble: command type |
| +1 | Number, 0–127 |
| +2 | Lower value, 0–127 |
| +3 | Upper value, 0–127 |
| +4 | High nibble: mode. Low nibble: display scale |

All five properties are **confirmed** for all four kinds, with one gap: the low nibble of a push
button's field +4 is **unknown**. The manual shows no display scale for push buttons, but one
edited setup uses that nibble. The editor never writes it.

Fader 9 has no block field. Its table has eight records of five bytes, one per fader/button group,
with the same five properties (**confirmed**).

### The codes

The code is the item's place in the UC4's own list, counted from 0. All of these are **confirmed**:

| Property | Codes |
| --- | --- |
| Encoder command type | `CCr1` 0, `CCr2` 1, `CCAb` 2, `PrGC` 3, `CCAh` 4, `Pbnd` 5, `AFtt` 6 |
| Push button command type | `OFF` 0, `notE` 1, `CC` 2, `PrGC` 3, `AFtt` 4 |
| Green button command type | `notE` 1, `CC` 2, `PrGC` 3, `AFtt` 4 (no `OFF`) |
| Fader command type | `CCAb` 0, `PrGC` 1, `Pbnd` 2, `AFtt` 3 |
| Encoder mode | `Acc0`–`Acc3` = 0–3 |
| Push and green button mode | `btn` 0, `toGL` 1 |
| Fader mode | `JMP` 0, `SnAP` 1 |
| Display scale, encoder and fader | `OFF` 0, `Std` 1, `bPoL` 2 |
| Display scale, green button | `OFF` 0, `Std` 1, `EXt` 2 |

A byte outside these tables is shown as a problem. It is never mapped silently.

## Group names

The eight encoder group names of a setup are 4 bytes each, one character per byte. The UC4 stores no
case, because its display has seven segments. The characters are the digits `0`–`9`, the letters
`a b c d e f g h i j l m n o p q r s t u x y z` (there is no `k` and no `w`, and `u` and `v` show the
same sign) and six symbols, the last of which is a blank: 39 codes in all, `0` to `38`. Every
character code is **confirmed**: all but `o` by dumps that changed them on the device, and `o` by
Faderfox's own list of the device's characters, which matches this order code for code.

## What the UC4 does itself

When you change an encoder's command type to `CCAh`, the UC4 lowers its number to 31 (**confirmed**).
`CCr1` and `CCr2` keep the number. This is the device's behaviour, not a rule of the file format. The
editor writes the value you set and does not change it behind your back. A `CCAh` number above 31 is
shown as a problem.

## What the UC4 does with a damaged dump

Tested by sending the UC4 a dump with one wrong record sum (one run each, firmware 02.05):

- The UC4 **checks the sum of every record**. A record with a wrong sum is not stored, and the
  display shows `Err`.
- The UC4 does **not** check the whole dump before it stores anything. Records with a right sum are
  stored as they arrive, and `Err` comes at the end. So after `Err` a setup can be **half written**.
  That is why the editor says: *If it shows Err, SE05 may be half written: send again.*

What the UC4 checks beyond the sums (the padding, the header, the manufacturer id) is **unknown**.
The editor writes the sums and the padding exactly as the UC4 wrote them.

## What the editor does

- **Reading:** it reads every control, fader 9 and the group names. It also reads fields that are only
  likely. A value that is not in the tables above is kept as a problem, and the factory value is shown.
- **Writing:** it patches a copy of the dump the setup came from (or, for all setups, the factory dump when there
  is none) and changes only the fields that differ. It changes a field only when the field's position and its code are both confirmed.
  Otherwise it refuses and names the fields. It recomputes the sum of every record it changed, and
  keeps the header, the padding, the trailer and every other byte.
- **Unknown firmware:** a dump with other firmware values than `02 05` is imported with a warning.
- **Evidence:** for each of the 80 pairs of test dumps, the earlier dump plus the noted change gives the
  UC4's own later dump byte for byte.

## What we do not know yet

- Whether the UC4 stores a `Sndc` written at another slot's addresses (copying a setup from one
  slot to another).
- The routing and the current setup. They are probably not in a dump at all.
- The meaning of the low nibble of a push button's field +4.
- What `lower` and `upper` mean for each command type, and whether the UC4 changes other values the way
  it does for `CCAh`.
- Header values for other firmware or other Faderfox devices.
