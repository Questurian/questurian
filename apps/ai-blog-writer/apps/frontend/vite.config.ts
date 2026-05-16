import { resolve } from 'path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: __dirname,
  plugins: [react()],
  resolve: {
    alias: {
      '@shared/types': resolve(__dirname, '../../packages/shared/types.ts')
    }
  },
  server: {
    host: true,
    port: 3003
  },
  test: {
    environment: 'jsdom',
    globals: true,
    css: true,
    setupFiles: resolve(__dirname, 'src/test/setup.ts'),
    include: [
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
      'src/**/*.spec.ts',
      'src/**/*.spec.tsx',
    ],
  }
})
