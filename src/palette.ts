/**
 * Colours and escape helpers.
 *
 * Two sets exist on purpose: `PALETTE.*` block colours are dark backgrounds for a filled
 * powerline cell, while the `ink` colours are the same hues lifted enough to read as text
 * directly on a dark terminal.
 */

export type RGB = readonly [number, number, number];

/**
 * Colour sequences are built from a string constant rather than a regex literal, so the
 * control character never has to be smuggled through a pattern.
 */
const ESCAPE = '\u001b';
const ANSI_SEQUENCE = new RegExp(`${ESCAPE}\\[[0-9;]*m`, 'g');

/** The row as the terminal measures it: no colour sequences, wide glyphs counted twice. */
export const stripAnsi = (value: string): string => value.replace(ANSI_SEQUENCE, '');
export const RESET = '\x1b[0m';

export const fg = (c: RGB): string => `\x1b[38;2;${c[0]};${c[1]};${c[2]}m`;

export const bg = (c: RGB): string => `\x1b[48;2;${c[0]};${c[1]};${c[2]}m`;

const hex = (value: string): RGB => [
  Number.parseInt(value.slice(1, 3), 16),
  Number.parseInt(value.slice(3, 5), 16),
  Number.parseInt(value.slice(5, 7), 16),
];

export const PALETTE = {
  text: hex('#cdd6f4'),
  model: hex('#005b95'),
  thinking: hex('#005b95'),
  dir: hex('#313244'),
  gitClean: hex('#006b1d'),
  /** The clean branch in a quiet row: slate instead of green, so the row stops competing. */
  quietClean: hex('#3b4261'),
  gitDirty: hex('#a17a00'),
  activity: hex('#313244'),
  activityFg: hex('#2dd4bf'),
  ok: hex('#006b1d'),
  warn: hex('#a17a00'),
  alert: hex('#972e2d'),
  /** Keys, units and flat separators: present, but never louder than the value. */
  dim: hex('#6c7086'),
  sep: hex('#6c7086'),
  inkText: hex('#cdd6f4'),
  inkBlue: hex('#89b4fa'),
  inkTeal: hex('#94e2d5'),
  inkGreen: hex('#a6e3a1'),
  inkYellow: hex('#f9e2af'),
  inkRed: hex('#f38ba8'),
};

export const SEPARATOR_LEADING = '\uE0BA';
export const SEPARATOR_MIDDLE = '\uE0B0';
export const SEPARATOR_TRAILING = '\uE0BC';
export const FLAT_SEPARATOR = '\u2502';
