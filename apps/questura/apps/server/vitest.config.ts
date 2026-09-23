import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'
import path from 'path'

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  resolve: {
    alias: {
      'next/headers': path.resolve(__dirname, 'src/__mocks__/next/headers.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    reporters: 'dot',
    include: [
      'src/shared/**/*.test.ts',
      'src/features/**/*.test.ts',
      'src/app/**/*.test.ts',
      // The load harness's pure modules. Registered deliberately: everything
      // else under scripts/ is operational and has no unit tests.
      'scripts/measure/**/*.test.ts',
      // The readiness sandbox's pure modules: preflight refusals, manifest
      // shape, workload expectations. The integration tests beside them skip
      // themselves when no disposable Postgres is reachable, so CI stays
      // green without pretending it ran them.
      'scripts/readiness/**/*.test.ts',
      // The env check the Railway template is held to (launch harness C1).
      'scripts/env-check/**/*.test.ts',
    ],
  },
})
