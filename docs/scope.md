# Scope — pi-bar rewrite

Status: decided (Phase 1). Supersedes the implementation of `@npm-ken/pi-bar@1.2.1`.

## In scope

| Item | Why |
|---|---|
| A three-line footer bar rendered through `ctx.ui.setFooter` | One row cannot hold "what is running", "where it runs" and "what other extensions report" without starving each other; three fixed rows keep each concern legible |
| Line roles fixed at three, each row collapsing on its own | `working` (model, thinking, context), `place` (cwd, git), `reported` (status keys, commands). A row with nothing to show is dropped, so an idle session uses two rows, not three |
| Weight by row: `block` for the live row, `flat` for the quiet rows | A row that changes every second may shout; rows that change once a session must not. Ink colours are separate from block colours so flat text stays readable on a dark terminal |
| TOML config at `~/.pi/pi-bar/config.toml`, parsed by `smol-toml` | Keeps a comment-friendly personal config, drops 789 lines of hand-written parser |
| Eight segment types: `model`, `context`, `cwd`, `git`, `activity`, `status`, `command`, `value` | Covers everything the old bar showed plus external-command data |
| Three-tier width adaptation (full → collapsed → hidden) by `collapse_order` | The one behaviour that distinguishes pi-bar from truncating bars |
| Status passthrough: any `ctx.ui.setStatus(key, text)` is renderable, `*` catches the rest | Zero-coupling extension point; no programmatic API needed |
| Single expression language (`eval`, `when`) in one constrained scope | Four old field names (`value_eval`, `collapsed_eval`, `eval`, `show_if`) were one concept |
| Debounced `git status --porcelain=v2` for dirty/ahead/behind, branch from `footerData.getGitBranch()` | Branch watching is already solved by pi; only the dirtiness needs a subprocess |
| Graceful degradation: bad TOML → defaults + one notification | A config typo must never make pi unusable |

## Out of scope (with reason)

| Item | Reason |
|---|---|
| A bar taller than three rows | Each extra row costs transcript space permanently; three covers the three concerns, and a fourth is a wish for a different tool |
| Backward compatibility with the old `config.toml` | Decision made 2026-11-18: new format, old file is not read |
| Programmatic extension API (a registry other packages import) | Two installed copies of an npm package mean two module registries; `setStatus` is the only reliable channel |
| Theme switching / built-in palettes | Config already takes `#rrggbb`; a palette layer is speculative |
| Mouse / click targets in the bar | Footer components receive no pointer events |
| Windows codepage fallback (non-UTF-8 glyph substitution) | Out of proportion for v1; users can set plain ASCII separators |

## Deferred (with unlock condition)

| Item | Unlock condition |
|---|---|
| `command` segment caching across renders | A user reports the 1 Hz refresh costing measurable CPU |
| Per-segment `min_width` reservation | Someone shows a bar where a long status starves a meter |
| `meter` thresholds as data series (min/max/bands) | A second meter type appears beyond context usage |
| Config hot reload while pi runs | Users ask to tune the bar without restarting |
| Truncation of a single over-wide segment | A segment wider than the whole terminal appears in practice |

## Acceptance lines

Each line is a behaviour plus the proof Phase 6 runs.

- The bar shows model, thinking level, context percent, cwd and git branch on session start — `test/integration/footer.test.ts`
- The bar renders three rows on a fresh session — `working`, `place`, `reported` — in that order — `test/unit/layout.test.ts`
- A row whose segments all collapse renders nothing and is dropped, so an empty session uses two rows instead of three — `test/unit/layout.test.ts`
- Each row collapses independently against its own width; a narrow terminal never makes one row push another out — `test/unit/layout.test.ts`
- A `collapse_order` segment swaps to `collapsed_template` before anything is cut, and hides when it has none — `test/unit/layout.test.ts`
- A status published with `ctx.ui.setStatus` appears; an unclaimed key falls to the `*` segment exactly once — `test/unit/segments.test.ts`
- Invalid TOML yields the default bar and a single warning notification, never a crash — `test/unit/config.test.ts`
- A `command` segment refreshes on its interval without blocking a render — `test/unit/command.test.ts`
- An expression cannot reach `process`, `require`, `globalThis` or `eval` — `test/unit/expression.test.ts`
- An empty git repo, a detached HEAD and a non-repo cwd all render without a `git` segment erroring — `test/unit/git.test.ts`
- The rendered line never exceeds the terminal width at any width from 20 to 300 columns — `test/unit/layout.test.ts`
