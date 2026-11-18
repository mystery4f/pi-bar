# Tickets — tracer bullets

One ticket per vertical slice a person can see working. Order is dependency order; each
ticket may start only after the ones it blocks on are closed. Acceptance criteria describe
observable behaviour, never file paths.

## T1 — A bar appears and names the model

Starts from nothing installable, ends with a footer row in a live pi session.

Blocks on: none. Blocks: T2, T3, T4, T5, T6.

- Installing the package and starting pi shows one bar row and no built-in footer.
- The bar shows the active model id and the current thinking level.
- Switching model or thinking level updates the bar without a restart.
- With no config file present the bar renders from bundled defaults.

## T2 — The bar is configurable

Blocks on: T1. Blocks: T3, T4, T5, T6.

- A `config.toml` with two segments in a chosen order renders them in that order.
- A `#rrggbb` colour in config appears as that colour in the terminal.
- Removing a segment from config removes it from the bar.
- A malformed config renders the default bar and shows exactly one warning, never crashes.

## T3 — The bar fits a narrow terminal

Blocks on: T2. Blocks: T5.

- At 200 columns every configured segment is visible in full.
- Narrowing the terminal swaps the lowest `collapse_order` segment to its
  `collapsed_template` before anything is cut.
- A segment with `collapse_order` and no `collapsed_template` disappears once its turn comes.
- No rendered line is wider than the terminal at any width from 20 to 300 columns.

## T4 — The bar shows context pressure

Blocks on: T2. Blocks: none.

- The context segment shows the percentage of the model window used.
- Crossing a configured threshold changes that segment's colour.
- After a compaction the percentage reflects the new usage without a restart.
- With no model loaded the segment renders its `empty_text` instead of `NaN%`.

## T5 — The bar shows where you are

Blocks on: T3. Blocks: none.

- The cwd segment shows the directory name, and the configured template can show the full path.
- The git segment shows the branch of the repository containing the cwd.
- Dirty, staged, ahead and behind states each render their configured colour.
- Outside a repository, and in a detached HEAD, the git segment renders nothing and nothing errors.

## T6 — The bar shows what is happening, and what others publish

Blocks on: T2. Blocks: T7.

- While a tool runs, the activity segment names it; when the turn ends the segment clears.
- A configured spinner animates without any user input, and pi's own working row does not
  duplicate it.
- A status published by another extension through `ctx.ui.setStatus` appears with the
  configured appearance.
- A status key no segment names is rendered once by the `*` segment, never twice.
- A status published with an empty string removes its segment immediately.

## T7 — The bar can show outside data

Blocks on: T6. Blocks: none.

- A `command` segment shows the first line of a command's stdout.
- The command re-runs on its configured interval and a failing command leaves the last good
  value visible instead of blanking.
- An `eval` expression can compute a value from model, context and cwd, and its result appears
  in the template's `{value}`.
- A `when` expression that evaluates false hides its segment.
- An expression that references `process`, `require` or `globalThis` renders nothing and logs
  a warning instead of executing.
