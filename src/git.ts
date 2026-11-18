/**
 * Working-tree change counts, for the row that answers "what did the agent just touch?".
 *
 * The line counts come from `git diff --shortstat` plus `git diff --cached --shortstat`, so staged
 * and unstaged edits land in one figure. The file count comes from `status --porcelain` instead:
 * a file edited in both places shows up in both diffs and must still count once. Untracked files
 * are left out of both on purpose: git has no lines to diff, and a file count read as a line count
 * would be a lie.
 *
 * The ahead/behind figures come from `rev-list --left-right --count HEAD...@{upstream}`: commits
 * the branch has not pushed, and commits the upstream has that it lacks. A branch with no upstream
 * (or a git that fails) reports nothing, so the segment stays off the row.
 */
import { execFile } from 'node:child_process';

export interface LineCounts {
  insertions: number;
  deletions: number;
}

export interface ChangeCounts extends LineCounts {
  files: number;
}

export interface UpstreamCounts {
  ahead: number;
  behind: number;
}

export const NO_UPSTREAM: UpstreamCounts = { ahead: 0, behind: 0 };

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

/** A failing git (no repository, no upstream, no binary, no permission) reads as no output. */
const runGit = (cwd: string, args: string[]): Promise<string> =>
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
    runGit(cwd, ['diff', '--shortstat']),
    runGit(cwd, ['diff', '--cached', '--shortstat']),
    runGit(cwd, ['status', '--porcelain']),
  ]);
  const worktree = parseShortStat(unstaged);
  const index = parseShortStat(staged);

  return {
    files: parseStatusCount(status),
    insertions: worktree.insertions + index.insertions,
    deletions: worktree.deletions + index.deletions,
  };
};

/** `2\t1` from `rev-list --left-right --count`: left is ahead, right is behind. */
export const parseRevList = (text: string): UpstreamCounts => {
  const [ahead, behind] = text.trim().split(/\s+/);

  return { ahead: Number(ahead ?? 0) || 0, behind: Number(behind ?? 0) || 0 };
};

/** Branch position against its upstream; a branch without one reads as level. */
export const readUpstreamCounts = async (cwd: string): Promise<UpstreamCounts> =>
  parseRevList(await runGit(cwd, ['rev-list', '--left-right', '--count', 'HEAD...@{upstream}']));
