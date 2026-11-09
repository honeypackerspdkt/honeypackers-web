import { defineConfig } from 'vitest/config';

// Website tests + the box maths (packages/box-core). The admin app (admin/) has its own tests: cd admin && npm test.
export default defineConfig({
  test: { include: ['tests/**/*.test.ts', 'packages/*/src/**/*.test.ts'] },
});
