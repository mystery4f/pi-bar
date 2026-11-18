import { beforeEach, expect, it, vi } from 'vitest';
import piBar from '../../src/index.ts';
import { createHarness, type Harness, stripAnsi } from '../support/fake-pi.ts';

let harness: Harness;

const install = (options?: Parameters<typeof createHarness>[0]): Harness => {
  harness = createHarness(options);
  piBar(harness.pi);
  harness.emit('session_start');
  return harness;
};

beforeEach(() => {
  vi.useRealTimers();
});

it('renders the three rows in order, working row first', () => {
  const bar = install().plain(150);

  expect(bar.rows).toHaveLength(3);
  expect(bar.rows[0]).toContain('group/deepseek-flash');
  expect(bar.rows[1]).toContain('pi-bar');
  expect(bar.rows[1]).toContain('main');
  // The last row is the spacer the footer keeps, not content.
  expect(bar.rows[2]).toBe('');
});

it('drops the report row when no extension pushed a status', () => {
  const bar = install().plain(150);

  // Two content rows plus the trailing spacer: an empty report row costs nothing.
  expect(bar.rows).toHaveLength(3);
  expect(bar.rows[1]).toContain('pi-bar');
  expect(bar.rows[2]).toBe('');
});

it('lists every status key on the report row, one segment per key', () => {
  const bar = install();
  bar.setStatus('todo', '3/8');
  bar.setStatus('lint', 'ok');

  const reported = bar.plain(150).rows.filter((row) => row.includes('todo'));
  expect(reported).toHaveLength(1);
  expect(reported[0]).toContain('3/8');
  expect(reported[0]).toContain('lint ok');
});

it('shows the running tool on the working row and clears it afterwards', () => {
  const bar = install();
  bar.emit('tool_execution_start', { toolCallId: 'call-1', toolName: 'bash' });

  expect(bar.plain(150).rows[0]).toContain('bash');

  bar.emit('tool_execution_end', { toolCallId: 'call-1' });
  expect(bar.plain(150).rows[0]).not.toContain('bash');
});

it('repaints while a turn is streaming and stops on turn_end', () => {
  vi.useFakeTimers();
  const bar = install();
  const before = bar.repaints();

  bar.emit('turn_start');
  vi.advanceTimersByTime(350);
  expect(bar.repaints()).toBeGreaterThan(before);

  const afterTurn = bar.repaints();
  bar.emit('turn_end');
  vi.advanceTimersByTime(350);
  expect(bar.repaints()).toBeLessThanOrEqual(afterTurn + 1);
  vi.useRealTimers();
});

it('drops the folder before the branch when the terminal narrows', () => {
  const bar = install();
  const wide = bar.plain(150).rows[1];
  const narrow = bar.plain(30).rows[0] ?? '';

  expect(wide).toContain('pi-bar');
  expect(narrow.length).toBeLessThanOrEqual(30);
  expect(stripAnsi(narrow)).toContain('deepseek-flash');
});

it('renders the branch name and no git segment outside a checkout', () => {
  const bar = install();

  bar.setBranch(null);
  const rows = bar.plain(150).rows;
  expect(rows[1]).toContain('pi-bar');
  expect(rows[1]).not.toContain('main');
});
