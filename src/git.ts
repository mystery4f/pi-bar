/**
 * Working-tree change counts, for the row that answers "what did the agent just touch?".
 *
 * The line counts come from `git diff --shortstat` plus `git diff --cached --shortstat`, so staged
 * and unstaged edits land in one figure. The file count comes from `status --porcelain` instead:
 * a file edited in both places shows up in both diffs and must still count once. Untracked files
 * are left out of both on purpose: git has no lines to diff, and a file count read as a line count
 * would be a lie.
 */
import { execFile } from 'node:child_process';

export interface LineCounts {
  insertions: number;
  deletions: number;
}

export interface ChangeCounts extends LineCounts {
  files: number;
}

const TIMEOUT_MS = 2000;

const count = (pattern: RegExp, text: string): number => Number(pattern.exec(text)?.[1] ?? 0);

/** ` 3 files changed, 12 insertions(+), 4 deletions(-)` — either half may be missing. */
export const parseShortStat = (text: string): LineCounts => ({
  insertions: count(/(\d+) insertions?/, text),
  deletions: count(/(\d+) deletions?/, text),
});

/** One line per changed path; `??` entries are untracked and carry no lines to count. */
export const parseStatusCount = (text: string): number =>
  text.split('\n').filter((line) => line.length >= 2 && !line.startsWith('??')).length;

/** A failing git (no repository, no binary, no permission) reads as "nothing changed". */
const shortStat = (cwd: string, args: string[]): Promise<string> =>
  new Promise((resolve) => {
    execFile(
      'git',
      args,
      {
        cwd,
        timeout: TIMEOUT_MS,
        env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
        windowsHide: true,
      },
      (error, stdout) => resolve(error === null ? stdout : ''),
    );
  });

export const readChangeCounts = async (cwd: string): Promise<ChangeCounts> => {
  const [unstaged, staged, status] = await Promise.all([
    shortStat(cwd, ['diff', '--shortstat']),
    shortStat(cwd, ['diff', '--cached', '--shortstat']),
    shortStat(cwd, ['status', '--porcelain']),
  ]);
  const worktree = parseShortStat(unstaged);
  const index = parseShortStat(staged);

  return {
    files: parseStatusCount(status),
    insertions: worktree.insertions + index.insertions,
    deletions: worktree.deletions + index.deletions,
  };
};
