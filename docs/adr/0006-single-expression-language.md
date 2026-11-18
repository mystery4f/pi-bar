# ADR-0006 — One expression language for `eval` and `when`

## Context

The previous implementation evaluated expressions in four places with four field names:
`value_eval` (`src/statusbar.ts:519`), `collapsed_eval` (`:542`), segment-level `eval` (`:703`)
and the activity values (`:800`), each building its own scope, plus `show_if` as a fifth
boolean variant. A user had to remember which name belonged to which segment type.

## Decision

Every segment gets exactly two optional expression fields:

- `when` — a boolean expression; false hides the segment.
- `eval` — a value expression; the result feeds `{value}` in the template.

Both run through one evaluator: a single `new Function('s', 'with' …)`-free scope, receiving
one frozen object with the snapshot fields and the current config record. No `process`,
`require`, `globalThis`, `import` or nested `eval` reachable. A throwing expression hides its
segment and logs once per expression at debug level.

## Rejected options

- **Keep per-type field names** — four names for one concept, and every new segment type
  reopens the question.
- **No expressions at all** — `context` and `condition` cases become impossible; the bar would
  only show fixed fields.
- **Full script sandbox (vm, worker)** — heavyweight per render; the bar evaluates on every
  frame at spinner rate.

## Consequences

Configs from the old format do not map one-to-one; that is accepted by ADR-0002's decision to
drop compatibility. A malicious config can still allocate memory in the expression; the threat
model is "the user's own file", not a third-party package.