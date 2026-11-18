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
style = "mixed"          # mixed | block | flat

[segments]
cwd = true
branch = true
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
bottom; `block` and `flat` paint all three rows the same way.

`segments.*` — boolean switches, all default `true`. Each one removes a segment:

| Key | Removes |
|---|---|
| `activity` | the spinner and running tool names |
| `model` | the model name |
| `thinking` | the thinking level (`think:off` when unset) |
| `context` | the context percentage |
| `cwd` | the working directory on the second row |
| `branch` | the git branch on the second row |
| `statuses` | extension statuses on the third row |
| `tokens` | `ctx 125K/1M` on the third row |
| `providers` | the provider count (only shown above one) |

A row with no segments left is dropped, so turning off every segment of a row costs
nothing.

`statuses.max_items` — how many extension statuses the third row may show, default `6`.
The row keeps the leftmost ones and drops the rest.

`colors.*` — `#rrggbb` overrides for the palette. Valid names are `text`, `dim`, `sep`,
`inkText`, `inkBlue`, `inkTeal`, `inkGreen`, `inkYellow`, `inkRed`, `model`, `thinking`,
`dir`, `activity`, `activityFg`, `gitClean`, `ok`, `warn`, `alert`. A flat row draws text
in its `ink*` colour, a block row uses the block colour as background.

## When the file is wrong

A missing file is normal and silent. A file that cannot be parsed, or a value of the wrong
shape, keeps the default for that key and shows one warning in the pi UI naming the file
and the key. The bar keeps rendering throughout — a bad edit never blanks it.
