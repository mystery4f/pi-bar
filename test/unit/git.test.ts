import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { parseRevList, parseShortStat, parseStatusCount, readChangeCounts, readUpstreamCounts } from '../../src/git.ts';

const repo = (): string => {
  const cwd = mkdtempSync(join(tmpdir(), 'pi-bar-git-'));
  execFileSync('git', ['init', '-q'], { cwd });

  return cwd;
};

const NOTHING = { files: 0, insertions: 0, deletions: 0 };

it('reads both halves of a shortstat line', () => {
  expect(parseShortStat(' 3 files changed, 12 insertions(+), 4 deletions(-)')).toEqual({
    insertions: 12,
    deletions: 4,
  });
});

it('reads the half a pure addition leaves out', () => {
  expect(parseShortStat(' 1 file changed, 7 insertions(+)')).toEqual({ insertions: 7, deletions: 0 });
});

it('counts every changed path and skips the untracked ones', () => {
  const status = ' M one.txt\nA  two.txt\n?? three.txt\n D four.txt\n';

  expect(parseStatusCount(status)).toBe(3);
});

it('says nothing changed outside a repository', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'pi-bar-nogit-'));

  return expect(readChangeCounts(cwd)).resolves.toEqual(NOTHING);
});

it('adds an untracked file to nothing, since git has no lines to diff yet', async () => {
  const cwd = repo();
  writeFileSync(join(cwd, 'one.txt'), 'a\nb\n', 'utf8');

  await expect(readChangeCounts(cwd)).resolves.toEqual(NOTHING);
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

  await expect(readChangeCounts(cwd)).resolves.toEqual({ files: 2, insertions: 3, deletions: 1 });
});

it('counts a file once when it is edited in both the index and the tree', async () => {
  const cwd = repo();
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd });
  execFileSync('git', ['config', 'user.name', 'test'], { cwd });
  writeFileSync(join(cwd, 'both.txt'), 'one\ntwo\nthree\nfour\n', 'utf8');
  execFileSync('git', ['add', 'both.txt'], { cwd });
  execFileSync('git', ['-c', 'commit.gpgsign=false', 'commit', '-qm', 'first'], { cwd });
  writeFileSync(join(cwd, 'both.txt'), 'one\nTWO\nthree\nfour\n', 'utf8');
  execFileSync('git', ['add', 'both.txt'], { cwd });
  writeFileSync(join(cwd, 'both.txt'), 'one\nTWO\nTHREE\nfour\n', 'utf8');

  await expect(readChangeCounts(cwd)).resolves.toEqual({ files: 1, insertions: 2, deletions: 2 });
});

it('reads the two rev-list counts, left ahead and right behind', () => {
  expect(parseRevList('2\t1\n')).toEqual({ ahead: 2, behind: 1 });
  expect(parseRevList('0\t3\n')).toEqual({ ahead: 0, behind: 3 });
});

it('reports no upstream position on a branch that has never been pushed', async () => {
  const cwd = repo();
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd });
  execFileSync('git', ['config', 'user.name', 'test'], { cwd });
  writeFileSync(join(cwd, 'one.txt'), 'a\n', 'utf8');
  execFileSync('git', ['add', 'one.txt'], { cwd });
  execFileSync('git', ['-c', 'commit.gpgsign=false', 'commit', '-qm', 'first'], { cwd });

  await expect(readUpstreamCounts(cwd)).resolves.toEqual({ ahead: 0, behind: 0 });
});

it('counts the commits the upstream is missing', async () => {
  const remote = mkdtempSync(join(tmpdir(), 'pi-bar-remote-'));
  execFileSync('git', ['init', '-q', '--bare'], { cwd: remote });

  const cwd = repo();
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd });
  execFileSync('git', ['config', 'user.name', 'test'], { cwd });
  writeFileSync(join(cwd, 'one.txt'), 'a\n', 'utf8');
  execFileSync('git', ['add', 'one.txt'], { cwd });
  execFileSync('git', ['-c', 'commit.gpgsign=false', 'commit', '-qm', 'first'], { cwd });
  execFileSync('git', ['remote', 'add', 'origin', remote], { cwd });
  execFileSync('git', ['push', '-q', '-u', 'origin', 'HEAD'], { cwd });

  await expect(readUpstreamCounts(cwd)).resolves.toEqual({ ahead: 0, behind: 0 });

  writeFileSync(join(cwd, 'two.txt'), 'b\n', 'utf8');
  execFileSync('git', ['add', 'two.txt'], { cwd });
  execFileSync('git', ['-c', 'commit.gpgsign=false', 'commit', '-qm', 'second'], { cwd });

  await expect(readUpstreamCounts(cwd)).resolves.toEqual({ ahead: 1, behind: 0 });
});
