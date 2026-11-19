import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

  // Exactly three rows: the footer container adds its own spacing, so an extra
  // spacer row here shows up as a blank strip under the bar.
  expect(bar.rows).toHaveLength(3);
  expect(bar.rows[0]).toContain('group/deepseek-flash');
  expect(bar.rows[1]).toContain('pi-bar');
  expect(bar.rows[1]).toContain('main');
  expect(bar.rows[2]).toContain('ctx');
});

it('counts the current turn and keeps the final time afterwards', () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  const bar = install();

  vi.setSystemTime(0);
  bar.emit('turn_start');
  vi.setSystemTime(12_000);

  expect(bar.plain(150).rows[0]).toContain(' 12s ');

  bar.emit('turn_end');
  vi.setSystemTime(90_000);

  expect(bar.plain(150).rows[0]).toContain(' 12s ');
});

it('reads a long turn as minutes and seconds', () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  const bar = install();

  vi.setSystemTime(0);
  bar.emit('turn_start');
  vi.setSystemTime(95_000);

  expect(bar.plain(150).rows[0]).toContain(' 1m35s ');
});
it('drops the report row when nothing falls through to it', () => {
  const bar = install({ tokens: null }).plain(150);

  // Two rows only: an empty report row costs nothing, not even a blank line.
  expect(bar.rows).toHaveLength(2);
  expect(bar.rows[1]).toContain('pi-bar');
});

it('reports the context tokens on the catch-all row', () => {
  const bar = install({ tokens: 118_400, contextWindow: 200_000 }).plain(150);
  const report = bar.rows[2] ?? '';

  expect(report).toContain('118K');
  expect(report).toContain('200K');
});

it('hides the provider count when there is only one provider', () => {
  const single = install({ providers: 1 }).plain(150);
  const many = install({ providers: 3 }).plain(150);

  expect(single.rows[2] ?? '').not.toContain('providers');
  expect(many.rows[2] ?? '').toContain('3');
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

it('puts the session name between the folder and the branch', () => {
  const bar = install({ sessionName: 'status-bar-rewrite' }).plain(150);
  const place = bar.rows[1] ?? '';

  expect(place).toContain('status-bar-rewrite');
  expect(place.indexOf('pi-bar')).toBeLessThan(place.indexOf('status-bar-rewrite'));
  expect(place.indexOf('status-bar-rewrite')).toBeLessThan(place.indexOf('main'));
});

it('shows nothing for an unnamed session', () => {
  const bar = install({ sessionName: undefined }).plain(150);
  const place = bar.rows[1] ?? '';

  // No placeholder, no empty cell: the row is the folder and the git data it always was.
  expect(place).toContain('pi-bar');
  expect(place).not.toContain('undefined');
  expect(place).not.toContain('session');
});

it('picks up a rename without waiting for the next turn', () => {
  const bar = install({ sessionName: 'first-name' });
  const before = bar.repaints();

  bar.setSessionName('second-name');
  bar.emit('session_info_changed', { name: 'second-name' });

  expect(bar.repaints()).toBeGreaterThan(before);
  const place = bar.plain(150).rows[1] ?? '';
  expect(place).toContain('second-name');
  expect(place).not.toContain('first-name');
});

it('shows in and out rates on the working row after a request', () => {
  vi.useFakeTimers();
  const bar = install();
  const message = { role: 'assistant' };

  bar.emit('message_start', { message });
  vi.advanceTimersByTime(500);
  bar.emit('message_update', { message });
  vi.advanceTimersByTime(2000);
  bar.emit('message_end', { message: { ...message, usage: { input: 20_000, output: 400 } } });

  // 20K prompt and 400 output tokens over the 2.5s the request took: one window, two halves.
  const working = bar.plain(150).rows[0] ?? '';
  expect(working).toContain('in 8k t/s');
  expect(working).toContain('out 160 t/s');
  vi.useRealTimers();
});

it('times the whole wait, so a request that never streamed still reports both halves', () => {
  vi.useFakeTimers();
  const bar = install();
  const message = { role: 'assistant' };

  bar.emit('message_start', { message });
  vi.advanceTimersByTime(1000);
  bar.emit('message_end', { message: { ...message, usage: { input: 20_000, output: 400 } } });
  bar.emit('turn_end');

  const working = bar.plain(150).rows[0] ?? '';
  expect(working).toContain('in 20k t/s');
  expect(working).toContain('out 400 t/s');
  vi.useRealTimers();
});

it('shows no rate before the first request finishes', () => {
  const bar = install();

  expect(bar.plain(150).rows[0] ?? '').not.toContain('/s');
});

it('shows the commits the upstream is missing', async () => {
  const remote = mkdtempSync(join(tmpdir(), 'pi-bar-remote-'));
  execFileSync('git', ['init', '-q', '--bare'], { cwd: remote });

  const cwd = mkdtempSync(join(tmpdir(), 'pi-bar-upstream-'));
  execFileSync('git', ['init', '-q'], { cwd });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd });
  execFileSync('git', ['config', 'user.name', 'test'], { cwd });
  writeFileSync(join(cwd, 'one.txt'), 'a\n', 'utf8');
  execFileSync('git', ['add', 'one.txt'], { cwd });
  execFileSync('git', ['-c', 'commit.gpgsign=false', 'commit', '-qm', 'first'], { cwd });
  execFileSync('git', ['remote', 'add', 'origin', remote], { cwd });
  execFileSync('git', ['push', '-q', '-u', 'origin', 'HEAD'], { cwd });
  writeFileSync(join(cwd, 'two.txt'), 'b\n', 'utf8');
  execFileSync('git', ['add', 'two.txt'], { cwd });
  execFileSync('git', ['-c', 'commit.gpgsign=false', 'commit', '-qm', 'second'], { cwd });

  const bar = install({ cwd });
  bar.emit('turn_end');

  await vi.waitFor(() => {
    expect(bar.plain(150).rows[1] ?? '').toContain('\u21911');
  });
});
