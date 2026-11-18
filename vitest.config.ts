import { cpus } from 'node:os';
import { defineConfig } from 'vitest/config';

// Unit suites are state-free; integration suites drive the entry point through a fake pi.
// Splitting them keeps a failing gate readable: unit means "the renderer disagrees",
// integration means "the wiring disagrees".
export default defineConfig({
  test: {
    maxWorkers: Math.min(8, Math.max(1, cpus().length)),
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: ['test/unit/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'integration',
          environment: 'node',
          include: ['test/integration/**/*.test.ts'],
        },
      },
    ],
  },
});
