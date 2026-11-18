---
title: Handover
description: Where pi-bar stands, what is decided, and what to do next.
---

# Handover

State as of 2026-11-18, after `03ad79c`. The plugin runs in the local pi and is committed
on `master`; nothing is published.

## What exists

A three-row footer bar, replacing pi's built-in footer for the session.

- Row 1 (`working`, seconds): activity spinner plus running tool names, model, thinking
  level, context percentage.
- Row 2 (`place`, hours): working directory, git branch.
- Row 3 (`reported`, catch-all): every extension status pi pushes, plus `ctx 125K/1M` and
  the provider count when it is above one.
- A row with no segments is dropped, so an idle session costs two rows.
- Narrow terminals shed segments by `collapse` order instead of truncating; each row runs
  its own ladder.

## Where things are

| Path | Holds |
|---|---|
| `src/index.ts` | event wiring only — no rendering decisions |
| `src/bar.ts` | spinner, active tools, the three rows |
| `src/layout.ts` | `Segment`, `visualWidth`, `renderLine` + the collapse ladder, `layout.styles` |
| `src/config.ts` | TOML schema, loader, `ensureConfigFile`, palette override |
| `src/palette.ts` | colours, escape helpers, `stripAnsi` |
| `src/rates.ts` | prefill vs generation windows, `in`/`out` tokens per second |
| `scripts/preview.ts` | renders every state into `.tmp/preview.html` (`npm run preview`) |
| `test/support/fake-pi.ts` | installs the entry into a fake pi and replays events |
| `docs/scope.md` | in / out / deferred, with unlock conditions |
| `docs/config.md` | every config key, user-facing |
| `docs/adr/` | seven decisions with the rejected options |
| `docs/tickets.md` | ticket graph for the remaining work |

## Gates

`npm run verify` = `check` (tsc twice: src with declarations, src+test+scripts no-emit) →
`lint` (biome) → `test` (vitest projects `unit`, `integration`). Current state: 29 tests
green. CI runs the same three gates as separate steps on Ubuntu and Windows, Node 22 and
24.

Visual check: `npm run preview`, then serve `.tmp/preview.html` over HTTP (playwright
refuses `file:`) and screenshot it.

## Decisions a newcomer will otherwise re-open

- Data comes from three sources only: pi's footer data, the extension context, and
  `ui.setStatus` keys. No module-level registry, because pip-installed copies would
  duplicate it (ADR-0005).
- One expression language for conditionals and values; there is no second dialect
  (ADR-0006).
- Config is TOML parsed by `smol-toml`, one file at `~/.pi/agent/pi-bar.toml`, no
  project-level overlay. A broken file degrades key by key with one warning (ADR-0002).
- The palette follows upstream pi-bar (`#005b95` / `#313244` / …) rather than Theme
  tokens, because pi 1.5.2 exposes `theme.fg` only through the footer factory's second
  argument and mixing both sources produced two competing colour systems.
- Three rows, weighted (block / flat / flat), because the footer sits in a flex container
  and is not truncated to one line (ADR-0007).

## Known issues

- A blank line can appear under the bar on some terminals. Verified as **not** produced by
  the plugin: disabling pi-bar reproduces it. The plugin returns exactly three rows and
  pi's dock has nothing below the footer. Do not re-investigate without new evidence.
- `getAvailableProviderCount()` returned `0` in a real session while the model was
  running; the provider segment is therefore usually hidden.
- `dist/` holds declarations only (`emitDeclarationOnly`). A stale `dist/` has already
  masked a real bug once — treat the running code as `src/`.

## Next steps, in order

- `README.md` (install, screenshot, config pointer) — the repo has none.
- Release prep: `private: true`, version `2.0.0-prototype.2`, and whether to publish as
  `@mystery4f/pi-bar` from `0.1.0` or `1.0.0`.
- Segment capabilities still deferred in `docs/scope.md`: git dirty marker (today the
  branch is shown without state), a `command` segment, meter bands, config hot reload.
