import { resolve } from 'path'
import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '')
  // Payload behind the dev server, so the browser sees one origin.
  // Set ABW_PAYLOAD_PROXY_TARGET=https://api.questurian.com and
  // VITE_PAYLOAD_API_URL=http://localhost:3003/payload to write against the live API.
  const payloadProxyTarget = env.ABW_PAYLOAD_PROXY_TARGET || 'http://localhost:4000'

  return {
    root: __dirname,
    plugins: [react()],
    resolve: {
      alias: {
        '@shared/types': resolve(__dirname, '../../packages/shared/types.ts')
      }
    },
    server: {
      host: true,
      port: 3003,
      proxy: {
        '/payload': {
          target: payloadProxyTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/payload/, ''),
          // Drop Domain=questurian.com so the cookie lands on localhost.
          cookieDomainRewrite: '',
          configure: (proxy) => {
            // localhost is not in Payload's CSRF list; without Origin/Referer it
            // accepts the cookie on Sec-Fetch-Site: same-origin instead.
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.removeHeader('origin')
              proxyReq.removeHeader('referer')
            })
          }
        }
      }
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
  }
})
