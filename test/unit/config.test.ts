/**
 * The config reader is the only place a user's file can hurt the bar: every test here
 * asserts that a bad input leaves a usable config behind, not an exception.
 */
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { DEFAULT_CONFIG, ensureConfigFile, loadConfig, readConfig, TEMPLATE } from '../../src/config.ts';

const writeConfig = (body: string): string => {
  const path = join(mkdtempSync(join(tmpdir(), 'pi-bar-config-')), 'pi-bar.toml');
  writeFileSync(path, body, 'utf8');
  return path;
};

it('returns the defaults when the file does not exist', () => {
  const { config, warnings } = loadConfig(join(tmpdir(), 'pi-bar-definitely-absent.toml'));

  expect(config).toEqual(DEFAULT_CONFIG);
  expect(warnings).toEqual([]);
});

it('reads switches, style, limit and colours', () => {
  const path = writeConfig(`
[layout]
style = "flat"

[segments]
cwd = false
statuses = false

[statuses]
max_items = 2

[colors]
model = "#123456"
`);

  const { config, warnings } = loadConfig(path);

  expect(warnings).toEqual([]);
  expect(config.style).toBe('flat');
  expect(config.segments.cwd).toBe(false);
  expect(config.segments.statuses).toBe(false);
  expect(config.segments.model).toBe(true);
  expect(config.maxStatusItems).toBe(2);
  expect(config.colors.model).toEqual([0x12, 0x34, 0x56]);
});

it('reports a broken file and keeps the defaults', () => {
  const { config, warnings } = loadConfig(writeConfig('[layout\nstyle = '));

  expect(config).toEqual(DEFAULT_CONFIG);
  expect(warnings[0]).toContain('pi-bar.toml');
});

it('warns about unknown keys instead of dropping the whole file', () => {
  const { config, warnings } = loadConfig(
    writeConfig(`
[layout]
style = "wavy"

[colors]
nope = "#ffffff"
model = "blue"

[segments]
model = "yes"
`),
  );

  expect(config.style).toBe('mixed');
  expect(config.colors).toEqual({});
  expect(config.segments.model).toBe(true);
  expect(warnings).toHaveLength(4);
  expect(warnings.join('\n')).toContain('colors.model');
  expect(warnings.join('\n')).toContain('layout.style');
  expect(warnings.join('\n')).toContain('colors.nope');
  expect(warnings.join('\n')).toContain('segments.model');
});

it('ignores values of the wrong shape', () => {
  const config = readConfig({ statuses: { max_items: -1 }, segments: { cwd: 'off' } });

  expect(config.maxStatusItems).toBe(DEFAULT_CONFIG.maxStatusItems);
  expect(config.segments.cwd).toBe(true);
});

it('writes the template on first run and reads it back as the defaults', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'pi-bar-config-')), 'nested', 'pi-bar.toml');

  ensureConfigFile(path);
  expect(readFileSync(path, 'utf8')).toBe(TEMPLATE);
  expect(loadConfig(path)).toEqual({ config: DEFAULT_CONFIG, warnings: [] });
});

it('never overwrites a file the user already edited', () => {
  const path = writeConfig('[segments]\ncwd = false\n');

  ensureConfigFile(path);

  expect(readFileSync(path, 'utf8')).toBe('[segments]\ncwd = false\n');
});
