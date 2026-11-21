/**
 * A config file has to change what the footer shows, end to end: the entry point loads it
 * at session start and the rows it produces are the proof.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import piBar from '../../src/index.ts';
import { createHarness, type Harness, stripAnsi } from '../support/fake-pi.ts';

const install = (toml: string, options: Parameters<typeof createHarness>[0] = {}): Harness => {
  const path = join(mkdtempSync(join(tmpdir(), 'pi-bar-config-')), 'pi-bar.toml');
  writeFileSync(path, toml, 'utf8');

  const harness = createHarness({ ...options, configPath: path });
  piBar(harness.pi);
  harness.emit('session_start');
  return harness;
};

it('drops the segments a config turns off', () => {
  const bar = install(`
[segments]
cwd = false
branch = false
tokens = false
`).plain(150);

  expect(bar.rows).toHaveLength(1);
  expect(bar.rows[0]).toContain('group/deepseek-flash');
  expect(bar.rows[0]).not.toContain('pi-bar');
});

it('honours the status limit', () => {
  const harness = install(`
[statuses]
max_items = 1
`);
  harness.setStatus('one', 'first');
  harness.setStatus('two', 'second');

  const rows = harness.plain(150).rows;
  const report = rows[rows.length - 1] ?? '';

  expect(report).toContain('first');
  expect(report).not.toContain('second');
});

it('applies a colour override', () => {
  const bar = install(`
[colors]
model = "#123456"
`).render(150);

  expect(bar[0]).toContain('38;2;18;52;86');
});

it('reports a broken file once and still renders the default bar', () => {
  const harness = install('[layout\nstyle = ');
  const notices = harness.notifies();

  expect(notices).toHaveLength(1);
  expect(notices[0]).toContain('pi-bar.toml');
  expect(harness.plain(150).rows[0]).toContain('group/deepseek-flash');
});

it('wraps every row in cells when style is chips', () => {
  const rows = install('[layout]\nstyle = "chips"').render(150).map(stripAnsi);

  expect(rows[1]).toContain('\uE0BA');
  expect(rows[2]).toContain('\uE0BA');
});

it('keeps the quiet rows as text in the default style', () => {
  const rows = install('').render(150).map(stripAnsi);

  expect(rows[1]).not.toContain('\uE0BA');
});

it('sends the quiet rows slate instead of green in chips style', () => {
  const place = install('[layout]\nstyle = "chips"').render(150)[1] ?? '';

  expect(place).toContain('48;2;59;66;97');
  expect(place).not.toContain('48;2;0;107;29');
});

it('averages only the configured rate window', () => {
  vi.useFakeTimers();
  const harness = install(`
[rate]
window = 1
`);

  const first = { role: 'assistant' };
  harness.emit('message_start', { message: first });
  vi.advanceTimersByTime(1000);
  harness.emit('message_end', { message: { ...first, usage: { input: 10_000, output: 100 } } });

  const second = { role: 'assistant' };
  harness.emit('message_start', { message: second });
  vi.advanceTimersByTime(1000);
  harness.emit('message_end', { message: { ...second, usage: { input: 20_000, output: 200 } } });

  // The first request began before the one-second window, so only the second one is averaged.
  const working = harness.plain(150).rows[0] ?? '';
  expect(working).toContain('out 200 t/s');
  vi.useRealTimers();
});
