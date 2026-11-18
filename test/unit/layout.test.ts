import { describe, expect, it } from 'vitest';
import { renderLine, type Segment, visualWidth } from '../../src/layout.ts';
import { PALETTE } from '../../src/palette.ts';
import { stripAnsi } from '../support/fake-pi.ts';

const segment = (text: string, collapse?: number, collapsed?: string): Segment => ({
  text,
  fg: PALETTE.text,
  flatFg: PALETTE.inkText,
  bg: PALETTE.model,
  ...(collapse === undefined ? {} : { collapse }),
  ...(collapsed === undefined ? {} : { collapsed }),
});

describe('visualWidth', () => {
  it('ignores escape sequences', () => {
    expect(visualWidth('\x1b[38;2;1;2;3mabc\x1b[0m')).toBe(3);
  });

  it('counts a CJK glyph as two columns', () => {
    expect(visualWidth('中文')).toBe(4);
  });
});

describe('renderLine flat', () => {
  it('keeps a row inside the terminal width by collapsing, never by cutting text', () => {
    const segments = [segment('alpha-one', 1), segment('beta-two-long', 2), segment('gamma-three', 3)];
    const line = renderLine(segments, 24, 'flat');

    expect(visualWidth(line)).toBeLessThanOrEqual(24);
    // Whatever survives must be a whole word: every token is one of the originals.
    const tokens = stripAnsi(line)
      .split('\u2502')
      .map((token) => token.trim())
      .filter((token) => token.length > 0);
    for (const token of tokens) expect(['alpha-one', 'beta-two-long', 'gamma-three']).toContain(token);
  });

  it('drops a segment with empty text instead of leaving a stray separator', () => {
    const line = stripAnsi(renderLine([segment('kept'), segment('')], 80, 'flat'));

    expect(line).toBe('  kept ');
  });

  it('keeps multi-line status text on one line', () => {
    const line = stripAnsi(renderLine([segment('two\nlines\there')], 80, 'flat'));

    expect(line).not.toContain('\n');
    expect(line).toBe('  two lines here ');
  });

  it('returns an empty string when every segment is empty', () => {
    expect(renderLine([segment('')], 80, 'flat')).toBe('');
  });

  it('replaces text with the collapsed form at its own turn', () => {
    const line = stripAnsi(renderLine([segment('a-very-long-model-id', 1, 'id'), segment('keep-me')], 12, 'flat'));

    expect(line).toContain('id');
    expect(line).not.toContain('a-very-long-model-id');
  });

  it('gives up one segment per step when they share a collapse order', () => {
    const row = [segment('alpha', 0), segment('bravo', 0), segment('charlie', 0), segment('delta', 0)];
    const line = stripAnsi(renderLine(row, 30, 'flat'));

    // A shared order drops from the right, and the row stops as soon as it fits.
    expect(line).toContain('alpha');
    expect(line).toContain('bravo');
    expect(line).not.toContain('delta');
  });
});

describe('renderLine block', () => {
  it('opens and closes with the powerline caps', () => {
    const line = renderLine([segment('one')], 80, 'block');

    expect(stripAnsi(line)).toBe('\uE0BA one \uE0BC');
  });
});

describe('row alignment', () => {
  it('puts flat text on the same column as block text', () => {
    const flat = stripAnsi(renderLine([segment('same')], 80, 'flat'));
    const block = stripAnsi(renderLine([segment('same')], 80, 'block'));

    expect(flat.indexOf('same')).toBe(block.indexOf('same'));
  });

  it('leaves a flat row text-only unless a segment asks for a chip', () => {
    const plain = renderLine([segment('a'), segment('b')], 80, 'flat');
    const chipped = renderLine([segment('a'), { ...segment('b'), flatChip: true }], 80, 'flat');

    expect(plain).not.toContain('\x1b[48;2;0;91;149m');
    expect(chipped).toContain('\x1b[48;2;0;91;149m');
  });

  it('drops the separator before a joined segment so two chips touch', () => {
    const apart = stripAnsi(renderLine([segment('a'), segment('b')], 80, 'flat'));
    const joined = stripAnsi(renderLine([segment('a'), { ...segment('b'), join: true }], 80, 'flat'));

    expect(apart).toContain('\u2502');
    expect(joined).not.toContain('\u2502');
  });
});
