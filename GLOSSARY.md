# Glossary

One term per concept. Use these words in code, config, docs and issues.

## Bar

The single line pi renders at the bottom of the terminal. Rendered by one footer
component that pi-bar installs through `ctx.ui.setFooter`.

_Avoid_: statusbar, status line, footer bar, powerline.

## Segment

The smallest rendered unit of the bar: one coloured block with a foreground, a
background and rendered text. A segment is declared in config, never in code.

_Avoid_: item, widget, chip, block, cell.

## Segment type

The data source and template model a segment uses. The set is closed:
`model`, `context`, `cwd`, `git`, `activity`, `status`, `command`, `value`.

_Avoid_: kind, provider, plugin, renderer.

## Snapshot

Everything the bar knows at render time: active model, thinking level, context
usage, working directory, git state, extension statuses, activity state. Built
once per render, read by every segment, never mutated by segments.

_Avoid_: state, context object, model.

## Status

A string another extension publishes with `ctx.ui.setStatus(key, text)`. pi-bar
renders statuses; it never produces them.

_Avoid_: badge, notification, message.

## Status key

The string an extension passes to `setStatus`. A `status` segment names one key,
or `*` to render every key no other segment claimed.

_Avoid_: id, name, channel.

## Collapse

Replacing a segment's `template` with its `collapsed_template`, or hiding the
segment, when the bar does not fit the terminal width. Segments collapse in
ascending `collapse_order`.

_Avoid_: shrink, truncate, wrap, overflow.

## Collapse order

The integer rank that says when a segment gives up space. Lower collapses first.
A segment with no `collapse_order` never collapses.

_Avoid_: priority, weight, level.

## Expression

A JavaScript expression a segment may carry in `eval` or `when`. Evaluated in one
constrained scope against the snapshot; it is not a script and has no statements.

_Avoid_: formula, eval, script, template.

## Template

The string a segment renders, with `{token}` placeholders substituted from the
snapshot. Token names are owned by the segment type.

_Avoid_: format, layout, pattern.
