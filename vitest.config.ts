import { defineConfig } from 'vitest/config';

// Three test projects:
//   unit -> pure logic and the in-memory repository (fast, no network)
//   db   -> SQL migrations, RLS and RPCs against a real Postgres (DATABASE_URL)
//   e2e  -> the built app in a headless browser, in demo mode
// db and e2e run one file at a time: fileParallelism is a global option in vitest 3 (ignored inside a
// project), so it is passed as --no-file-parallelism in their npm scripts instead.
export default defineConfig({
  test: {
    projects: [
      { test: { name: 'unit', include: ['frontend/src/**/*.test.ts'], environment: 'node' } },
      { test: { name: 'db', include: ['backend/supabase/tests/**/*.test.ts'], environment: 'node', testTimeout: 60000, hookTimeout: 120000 } },
      { test: { name: 'e2e', include: ['frontend/e2e/**/*.e2e.test.ts'], environment: 'node', testTimeout: 60000, hookTimeout: 120000 } },
    ],
  },
});
