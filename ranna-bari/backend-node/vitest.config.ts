import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The in-memory replica set downloads a mongod binary on first run and
    // takes a few seconds to elect a primary, so the default 5s is not enough.
    testTimeout: 30_000,
    hookTimeout: 180_000,
    // One database, shared. Parallel files would each start their own
    // replica set and race on the same collections.
    fileParallelism: false,
    pool: 'forks',
  },
});
