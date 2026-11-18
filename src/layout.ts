/**
 * Row primitives: a segment, the collapse ladder, and the two ways of drawing a row.
 *
 * Nothing here reads pi state, so a test can drive any row shape through `renderLine`
 * without a session.
 */
import {
  bg,
  FLAT_SEPARATOR,
  fg,
  PALETTE,
  RESET,
  type RGB,
  SEPARATOR_LEADING,
  SEPARATOR_MIDDLE,
  SEPARATOR_TRAILING,
  stripAnsi,
} from './palette.ts';

export type LineStyle = 'block' | 'flat';

/** Live settings, so the preview harness can render the same code in each style. */
export const layout = {
  styles: ['block', 'flat', 'flat'] as LineStyle[],
};

export interface Segment {
  text: string;
  fg: RGB;
  bg: RGB;
  /** A quieter lead-in, e.g. the key of a status entry. */
  prefix?: string;
  prefixFg?: RGB;
  /** Text colour on a flat row; `fg` is tuned for sitting on `bg`. */
  flatFg?: RGB;
  /** Lower gives up space first. Undefined means "never collapse". */
  collapse?: number;
  /** Shown instead of `text` once this segment's turn to collapse comes. */
  collapsed?: string;
}

/** Width on screen: escape sequences count zero, wide glyphs count two. */
export function visualWidth(input: string): number {
  const plain = stripAnsi(input);
  let width = 0;
  for (const char of plain) {
    const code = char.codePointAt(0) ?? 0;
    const wide =
      (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2e80 && code <= 0xa4cf) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe30 && code <= 0xfe6f) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6) ||
      (code >= 0x1f300 && code <= 0x1f64f) ||
      (code >= 0x1f900 && code <= 0x1f9ff);
    width += wide ? 2 : 1;
  }
  return width;
}

/** One segment's text, prefix first, with no background of its own. */
const segmentText = (segment: Segment, color: RGB): string =>
  (segment.prefix === undefined ? '' : `${fg(segment.prefixFg ?? PALETTE.dim)}${segment.prefix} `) +
  fg(color) +
  segment.text;

const blockLine = (list: readonly Segment[]): string => {
  const first = list[0];
  if (first === undefined) return '';
  let out = fg(first.bg) + SEPARATOR_LEADING;
  for (const [index, segment] of list.entries()) {
    out += `${bg(segment.bg)} ${segmentText(segment, segment.fg)} `;
    const next = list[index + 1];
    out += next ? fg(segment.bg) + bg(next.bg) + SEPARATOR_MIDDLE : fg(segment.bg) + SEPARATOR_TRAILING;
  }
  return out;
};

const flatLine = (list: readonly Segment[]): string =>
  list
    .map((segment) => ` ${segmentText(segment, segment.flatFg ?? segment.fg)} `)
    .join(`${RESET}${fg(PALETTE.sep)}${FLAT_SEPARATOR}`);

/**
 * Draws one row inside `width`. When it does not fit, the segments with the lowest
 * `collapse` order give up space first — as shortened text, or by leaving the row —
 * and nothing is ever cut mid-word.
 */
export function renderLine(segments: readonly Segment[], width: number, style: LineStyle): string {
  const draw = (list: readonly Segment[]): string => (style === 'block' ? blockLine(list) : flatLine(list));
  const show = (list: readonly Segment[]): string => {
    const usable = list.filter((segment) => segment.text.length > 0);
    return usable.length === 0 ? '' : `${draw(usable)}${RESET}`;
  };

  // Collapse ladder: give up the lowest order first, one segment per step, and stop as
  // soon as the row fits. Segments that share an order therefore leave from the right,
  // and a row of equally-ranked segments loses its tail instead of everything at once.
  const visible: Segment[] = segments.map((segment) => ({ ...segment }));
  const orders = [...new Set(visible.map((s) => s.collapse).filter((n): n is number => n !== undefined))].sort(
    (a, b) => a - b,
  );

  let current = show(visible);
  for (const order of orders) {
    const targets = visible
      .map((segment, index) => ({ segment, index }))
      .filter(({ segment }) => segment.collapse === order)
      .map(({ index }) => index)
      .reverse();

    for (const index of targets) {
      if (visualWidth(current) <= width) return current;

      const segment = visible[index];
      if (segment === undefined) continue;
      segment.text = segment.collapsed ?? '';
      current = show(visible);
    }
  }

  return visualWidth(current) <= width ? current : show(visible);
}
