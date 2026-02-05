import { resolve } from 'path'
import { defineConfig } from 'vite'
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
  }
})
