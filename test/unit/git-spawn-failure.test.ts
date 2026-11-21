import { describe, expect, it, vi } from 'vitest';

// Windows can refuse the spawn itself, so `execFile` throws instead of reporting through its
// callback; that throw used to escape as an unhandled rejection and take the whole pi host down.
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();

  return {
    ...actual,
    execFile: () => {
      throw Object.assign(new Error('spawn EPERM'), { code: 'EPERM' });
    },
  };
});

const { NO_UPSTREAM, readChangeCounts, readUpstreamCounts } = await import('../../src/git.ts');

describe('a git that cannot even be spawned', () => {
  it('leaves the change counts empty instead of rejecting', async () => {
    await expect(readChangeCounts('C:/no/such/place')).resolves.toEqual({
      files: 0,
      insertions: 0,
      deletions: 0,
    });
  });

  it('leaves the branch level', async () => {
    await expect(readUpstreamCounts('C:/no/such/place')).resolves.toEqual(NO_UPSTREAM);
  });
});
