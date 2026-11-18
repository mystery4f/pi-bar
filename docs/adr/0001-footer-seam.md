# ADR-0001 — Render through `ctx.ui.setFooter`

## Context

pi 1.5.2 offers three places a persistent line can live: `ctx.ui.setStatus(key, text)`
(a text slot in the built-in footer), `ctx.ui.setWidget` (a block above or below the
editor), and `ctx.ui.setFooter(factory)` (replaces the whole footer with our component).

The old pi-bar used `setFooter` but hid the method name behind
`` `set${String.fromCharCode(70,111,111,116,101,114)}` `` and cast the UI context to a
`Record<string, unknown>` (`src/pi-bar.ts:131` in the previous implementation).

## Decision

Call `ctx.ui.setFooter` directly with the typed `ExtensionUIContext`, and render one
`Component` whose `render(width)` returns `[line, '']`.

## Rejected options

- **`setStatus` only** — no per-segment colours, no width negotiation, no collapse
  ladder; the distinguishing behaviour of pi-bar becomes impossible.
- **`setWidget`** — a widget is a multi-row block, so it steals transcript rows and
  still cannot own the footer row.
- **`ctx.ui.custom`** — takes keyboard focus; a bar must never capture input.

## Consequences

The bar owns the entire footer row, so the built-in git-branch/status footer is gone while
pi-bar is active. `ctx.ui.setWorkingVisible(false)` is required to keep pi's working row
from duplicating the `activity` segment.
