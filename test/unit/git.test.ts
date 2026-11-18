import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { parseShortStat, readChangeCounts } from '../../src/git.ts';

const repo = (): string => {
  const cwd = mkdtempSync(join(tmpdir(), 'pi-bar-git-'));
  execFileSync('git', ['init', '-q'], { cwd });

  return cwd;
};

it('reads both halves of a shortstat line', () => {
  expect(parseShortStat(' 3 files changed, 12 insertions(+), 4 deletions(-)')).toEqual({
    insertions: 12,
    deletions: 4,
  });
});

it('reads the half a pure addition leaves out', () => {
  expect(parseShortStat(' 1 file changed, 7 insertions(+)')).toEqual({ insertions: 7, deletions: 0 });
});

it('says nothing changed outside a repository', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'pi-bar-nogit-'));

  return expect(readChangeCounts(cwd)).resolves.toEqual({ insertions: 0, deletions: 0 });
});

it('adds an untracked file to nothing, since git has no lines to diff yet', async () => {
  const cwd = repo();
  writeFileSync(join(cwd, 'one.txt'), 'a\nb\n', 'utf8');

  await expect(readChangeCounts(cwd)).resolves.toEqual({ insertions: 0, deletions: 0 });
});

it('sums staged and unstaged edits into one pair of counts', async () => {
  const cwd = repo();
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd });
  execFileSync('git', ['config', 'user.name', 'test'], { cwd });
  writeFileSync(join(cwd, 'two.txt'), 'one\ntwo\nthree\n', 'utf8');
  execFileSync('git', ['add', 'two.txt'], { cwd });
  execFileSync('git', ['-c', 'commit.gpgsign=false', 'commit', '-qm', 'first'], { cwd });
  writeFileSync(join(cwd, 'two.txt'), 'one\nthree\nfour\nfive\n', 'utf8');
  writeFileSync(join(cwd, 'staged.txt'), 'x\n', 'utf8');
  execFileSync('git', ['add', 'staged.txt'], { cwd });

  await expect(readChangeCounts(cwd)).resolves.toEqual({ insertions: 3, deletions: 1 });
});
