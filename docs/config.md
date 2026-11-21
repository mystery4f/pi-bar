---
title: Configuration
description: The pi-bar.toml keys, what each one changes, and how a broken file is handled.
---

# Configuration

pi-bar reads one optional file, `~/.pi/agent/pi-bar.toml`, at session start. On first run
the plugin writes a fully commented default file there, so every key is discoverable
without reading this page; an existing file is never touched. Restart pi after an edit,
because the file is read once per session.

The file is deliberately small: it turns rows and segments off, picks a row style and
repaints the palette. Anything it cannot express is out of scope until a key for it exists.

## Example

```toml
[layout]
style = "mixed"          # mixed | chips | block | flat

[segments]
rates = true
elapsed = true
cwd = true
branch = true
upstream = true
statuses = true

[statuses]
max_items = 6

[colors]
model = "#005b95"
thinking = "#005b95"
activity = "#313244"
```

## Keys

`layout.style` — how each row is drawn. `mixed` (default) is block, flat, flat top to
bottom, with the quiet rows' separators lifted to `#6c7086` and their text aligned to the
first column of a cell. `chips` keeps the same geometry on every row but gives the quiet rows
a slate background, so the family matches without the bottom rows competing. `block` and
`flat` paint all three rows the same way.

`segments.*` — boolean switches, all default `true`. Each one removes a segment:

| Key | Removes |
|---|---|
| `activity` | the spinner and running tool names |
| `model` | the provider and the model, as `provider/id` |
| `thinking` | the thinking level (`think:off` when unset) |
| `context` | the context percentage |
| `rates` | `out 160 t/s`, the session's output-token throughput |
| `elapsed` | `12s`, how long the current turn has run (`1m05s` past a minute); the last turn's time stays on screen after it ends |
| `cwd` | the working directory's last two levels, `mystery4f/pi-bar`, on the second row |
| `session` | the pi session name (`/name` or `--name`) beside the working directory; an unnamed session shows nothing |
| `branch` | the git branch on the second row |
| `changes` | `Edits • 12 files • +98 -7`, the working tree beside the branch: a label, the changed-file count, then the line counts as plain coloured text (green added, red removed) instead of filled cells |
| `upstream` | `↑2↓1`, commits not pushed yet and commits the upstream has that the branch lacks; a branch with no upstream shows nothing |
| `statuses` | extension statuses on the third row |
| `tokens` | `ctx 125K/1M` on the third row |
| `providers` | the provider count (only shown above one) |

A row with no segments left is dropped, so turning off every segment of a row costs
nothing.

The rate is the output tokens divided by the wall clock the requests took, from the end of the
previous message to the end of the answer, and the totals accumulate over the session. That keeps
`out` comparable between providers and across a session that grows; cached prompt tokens are not
counted as fresh work. A request
with no usage (an abort) is left out entirely, and a total under 50ms reports nothing rather than
dividing by a tick. `PI_BAR_DEBUG_RATES=1` prints the prompt tokens, the output tokens and the
duration of each finished request to stderr.

`rate.window` — how much history the rates average over, in whole seconds from `0` to `120`.
`0`, the default, averages the whole session. A window follows a burst instead of the session, so
the figure moves; a request counts whole or not at all, since its token count cannot be sliced,
and one that started before the window opened is left out rather than divided by the part of its
time that falls inside.

`statuses.max_items` — how many extension statuses the third row may show, default `6`.
The row keeps the leftmost ones and drops the rest.

`colors.*` — `#rrggbb` overrides for the palette. Valid names are `text`, `dim`, `sep`,
`inkText`, `inkBlue`, `inkGreen`, `inkYellow`, `inkRed`, `model`, `thinking`,
`dir`, `activity`, `activityFg`, `gitClean`, `ok`, `warn`, `alert`. A flat row draws text
in the colour of its own text (`fg`, tuned for the coloured cell it usually sits on), a block
row uses the block colour as background.

## When the file is wrong

A missing file is normal and silent. A file that cannot be parsed, or a value of the wrong
shape, keeps the default for that key and shows one warning in the pi UI naming the file
and the key. The bar keeps rendering throughout — a bad edit never blanks it.
