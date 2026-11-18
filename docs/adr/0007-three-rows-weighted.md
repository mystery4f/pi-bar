# ADR-0007 — Three rows with fixed roles, weighted by row

## Context

Phase 1 assumed one row and put "multi-line bar" out of scope with the reason "pi allocates one
footer row; a second line fights the transcript viewport". A prototype built after that decision
showed the assumption was too strict on both counts.

`createChatViewport` mounts the footer as an ordinary flex child
(`{ component: options.footer, shrink: 1, minSize: 0 }` in `dist/modes/interactive/chat-viewport.js`),
so a custom footer that returns several lines is rendered, not clipped at one line. What a row
really costs is transcript height, and that cost is only worth paying when a row carries a
different concern.

One row could not hold all of it: activity, model, thinking level, context percent, cwd, git and
the status keys other extensions publish. Collapsing alone turned the bar into a queue of
unrelated facts, and the segment that mattered most (what is running) competed with the segment
that changes once a session (the branch).

## Decision

Three rows, each with a fixed role, rendered from the same snapshot:

- `working` — activity, model, thinking level, context percent. Changes every second.
- `place` — cwd, git branch. Changes once a session.
- `reported` — one segment per `ctx.ui.setStatus` key, later also `command` segments.

Two consequences follow from the roles:

- **Weight by row.** `working` is drawn as filled powerline cells; the two quiet rows are drawn
  as flat text separated by a hairline. Flat rows use their own ink palette, because a colour
  dark enough to hold white text on a block background is unreadable as text on a dark terminal.
- **Independent ladders.** Each row measures and collapses against its own width, so a segment
  giving up in `working` never changes what `reported` shows. A row that loses everything is
  dropped rather than left blank, so an idle session costs two rows, not three.

## Rejected options

- **One row, aggressive collapsing** — the original plan; produced a bar where the branch and the
  running tool traded places depending on width, and neither could be relied on.
- **Configurable row count** — every row count needs its own default composition and its own
  width story; three roles are a design decision, not a setting.
- **Four or more rows** — the fourth concern (session cost, todo, lint) fits in `reported` as a
  status key, and a fourth permanent row is transcript space spent on a rarely-read line.
- **Same style on every row** — three rows of filled cells shout equally, and the row that
  changes every second loses its emphasis.

## Consequences

The footer occupies up to four rows including its trailing spacer, three when `reported` is
empty. `docs/scope.md` states the row roles and three acceptance lines cover the row count, the
dropped-row rule and per-row independence. The prototype in `index.ts` already renders this
shape, and `scripts/preview.ts` renders every row in all three styles so a change can be checked
without a terminal.