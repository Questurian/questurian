import { defineConfig, devices } from '@playwright/test'

/**
 * Real-browser tests (launch harness B1).
 *
 * By default they run against the readiness sandbox, the production build on
 * the laptop with its own database and no network:
 *
 *   pnpm --dir apps/questura/apps/server readiness:stack -- up --build
 *   pnpm --dir apps/questura/apps/e2e test
 *
 * Launch day points them at the real site with a dedicated test account:
 *
 *   E2E_BASE_URL=https://www.questurian.com \
 *   E2E_MEMBER_EMAIL=… E2E_MEMBER_PASSWORD=… \
 *   E2E_MEMBER_ARTICLE=/some/member/article \
 *   pnpm --dir apps/questura/apps/e2e test
 *
 * WebKit needs one system library on Linux (`sudo apt-get install
 * libevent-2.1-7t64`). Skip it with `--project='chromium*' --project='firefox*'`,
 * which runs both desktop engines and the phone projects below.
 */
const SANDBOX = !process.env.E2E_BASE_URL

/**
 * Journey 11 (launch fix plan item 8): journeys 1–3 on two phones. Chromium
 * emulates each phone whole (screen, pixel density, touch, mobile user
 * agent). Firefox has no mobile mode in Playwright, so it gets the phone's
 * screen, density, touch and user agent without `isMobile`. The iPhone
 * profile normally runs in WebKit, which stays off on this laptop.
 */
const PHONES = { 'pixel-7': devices['Pixel 7'], 'iphone-13': devices['iPhone 13'] } as const
const JOURNEYS_ON_PHONES = /journey [123]:/
const phoneProjects = Object.entries(PHONES).flatMap(([name, { defaultBrowserType: _engine, isMobile: _mobile, ...phone }]) => [
  { name: `chromium-${name}`, grep: JOURNEYS_ON_PHONES, use: { ...devices['Desktop Chrome'], ...phone, isMobile: true } },
  { name: `firefox-${name}`, grep: JOURNEYS_ON_PHONES, use: { ...devices['Desktop Firefox'], ...phone } },
])

export default defineConfig({
  testDir: './tests',
  globalSetup: './tests/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://app.readiness.localhost:3100',
    trace: 'retain-on-failure',
    // In the sandbox nothing may leave this machine. A route cannot stop that
    // alone: requests that follow a redirect are never routed. Every host but
    // loopback goes to a proxy that is not there, so it fails at once.
    ...(SANDBOX ? { proxy: { server: 'http://127.0.0.1:9', bypass: '127.0.0.1,localhost,.localhost' } } : {}),
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    ...phoneProjects,
  ],
})
