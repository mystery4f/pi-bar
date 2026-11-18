# ADR-0005 — No programmatic extension API; `setStatus` is the only channel

## Context

Other extensions want to put something in the bar (MCP server count, LSP errors, queue depth).
The obvious design is a registry module other packages import and call
`registerSegment(name, provider)`.

pi installs packages per source; two extensions can each resolve their own copy of the same
npm dependency, so a module-level registry is not shared between them. A registry call from
another package would either silently write to a second copy or throw on a missing import.

## Decision

The only documented channel is `ctx.ui.setStatus(key, text)`, already provided by pi and
surfaced to the footer through `footerData.getExtensionStatuses()`. Producers stay ignorant of
pi-bar: they publish a string, pi-bar decides if and how to render it.

## Rejected options

- **Module registry** — broken by duplicate package instances, as above.
- **Global object on `globalThis`** — works, but every producer and consumer then shares one
  untyped mutable surface with no lifecycle.
- **Event bus on `pi.events`** — carries payloads between extensions but not a render contract;
  a producer would need to know pi-bar's internal shape anyway.

## Consequences

A producer cannot ask for a specific colour or width; it publishes text and the `status`
segment in config owns the appearance. Richer contributions (an arbitrary component in the bar)
are impossible by design; `command` and `value` segments cover the data-shaped cases.