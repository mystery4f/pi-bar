# ADR-0003 — Branch from pi, dirtiness from one debounced subprocess

## Context

`src/git.ts:29` (previous implementation) ran its own `GitSnapshotProvider`: raw reads of
`.git/HEAD`, a watcher on HEAD, a second watcher for reftable, retry timers and a debounce.
Meanwhile pi already exposes `ReadonlyFooterDataProvider.getGitBranch()`, which handles
regular repos, worktrees and reftable.

Branch is not the whole git segment though: users want staged/unstaged markers and
ahead/behind counts, which `FooterDataProvider` does not provide.

## Decision

Take the branch from `footerData.getGitBranch()`. Get staged/unstaged/ahead/behind from a
single `git status --porcelain=v2 --branch` subprocess, run debounced (~250 ms) after a
render request, with a 5 s ceiling between runs.

## Rejected options

- **Own fs watchers** — two watch backends, retry logic and platform quirks; that code was
  the second-largest file in the old package and the least testable.
- **No git data at all** — drops a feature users configure per-state colours for.
- **`git status` on every render** — the bar re-renders at spinner rate (~10 Hz) while a
  tool runs; a subprocess per frame is unacceptable.

## Consequences

The git segment can be up to ~250 ms stale after a commit. When `git` is absent or the cwd
is not a repo, the segment renders nothing rather than erroring.
