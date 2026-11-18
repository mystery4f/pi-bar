/**
 * Working-tree change counts, for the row that answers "what did the agent just touch?".
 *
 * The number comes from `git diff --shortstat` plus `git diff --cached --shortstat`, so staged
 * and unstaged edits land in one figure. Untracked files are left out on purpose: git reports
 * them as whole new files, and a file count read as a line count would be a lie.
 */
import { execFile } from 'node:child_process';

export interface ChangeCounts {
  insertions: number;
  deletions: number;
}

const TIMEOUT_MS = 2000;

const count = (pattern: RegExp, text: string): number => Number(pattern.exec(text)?.[1] ?? 0);

/** ` 3 files changed, 12 insertions(+), 4 deletions(-)` — either half may be missing. */
export const parseShortStat = (text: string): ChangeCounts => ({
  insertions: count(/(\d+) insertions?/, text),
  deletions: count(/(\d+) deletions?/, text),
});

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
  const [unstaged, staged] = await Promise.all([
    shortStat(cwd, ['diff', '--shortstat']),
    shortStat(cwd, ['diff', '--cached', '--shortstat']),
  ]);
  const worktree = parseShortStat(unstaged);
  const index = parseShortStat(staged);

  return {
    insertions: worktree.insertions + index.insertions,
    deletions: worktree.deletions + index.deletions,
  };
};
