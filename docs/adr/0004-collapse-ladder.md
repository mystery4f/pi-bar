# ADR-0004 — Width adaptation by collapse ladder, never truncation

## Context

A bar with eight configurable segments does not fit a narrow terminal. The three candidate
behaviours are: truncate the line, wrap onto a second row, or degrade segments.

The previous implementation's one durable idea was the ladder: each segment declares a
`collapse_order`, low values give up space first by swapping to a shorter `collapsed_template`,
and a segment without one disappears. Nothing is ever cut mid-glyph.

## Decision

Keep the ladder and make it the only width strategy. Render at full width; if the line exceeds
the terminal, collapse order 1, re-measure, then order 2, and so on; segments that never
collapse are hidden last. Measure with the same width function the renderer uses (visual width,
wide glyphs counted as two).

## Rejected options

- **Truncation** — cuts colours mid-escape and produces a half-word, which reads as a bug.
- **Wrapping to a second row** — pi gives the footer one row; a second row pushes the
  transcript.
- **Fixed proportional widths** — needs a layout table per terminal size and still cannot
  express "this segment matters more than that one".

## Consequences

Render cost is O(segments × collapse groups) measurements per frame, bounded and small. A
config where every segment refuses to collapse can still overflow; that is the user's
stated preference, and the line is then cut at the terminal edge by pi itself.

Each of the three rows runs its own ladder against the same width. A row is measured on its
own, so a segment collapsing in `working` never changes what `reported` shows; a row that
loses every segment is dropped instead of leaving a blank line above the prompt.