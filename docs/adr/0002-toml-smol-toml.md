# ADR-0002 — TOML parsed by `smol-toml`

## Context

The previous implementation shipped a 789-line hand-written TOML reader
(`src/config.ts`), complete with a `Section` state machine and two whitelists of allowed
keys. It handled the bundled `config.toml` and little else: arrays of tables, inline
tables and multi-line strings were re-implemented by hand.

## Decision

Keep TOML as the format, and parse it with `smol-toml` (1.9.1). Validate the resulting
object against a small TypeScript schema; unknown keys are reported once and ignored.

## Rejected options

- **Hand-written parser** — the reason it existed was "zero runtime dependencies", which
  costs more in maintenance than a 140 KB parser costs in install size.
- **JSON** — a personal config needs comments and trailing commas; JSON gives neither.
- **TypeScript config module** — expressive, but it turns a status bar setting into code
  the user must type-check and pi must import from a path.

## Consequences

`smol-toml` becomes the first runtime dependency of the package. `pi install` resolves npm
dependencies, so this is invisible to the user.

## Where the file lives

One file, `~/.pi/agent/pi-bar.toml`, with no project-level overlay: a status bar is a
personal view of the agent, so per-repository variants would answer a question nobody
asked and would double the loading rules. `PI_BAR_CONFIG` overrides the path, exists so a
test never reads the developer's own file.
