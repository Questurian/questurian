import { describe, expect, it } from 'vitest'

import nextConfig from '../../../next.config.mjs'

// The API and the Payload admin carry the same framing and sniffing guards as
// the site (launch harness D4). The admin is the one page here with buttons
// worth clickjacking.
describe('server security headers', () => {
  it('every route sends them', async () => {
    type Rule = { source: string; headers: Array<{ key: string; value: string }> }
    // `withPayload` adds its own catch-all rule beside ours; combine them.
    const rules = (await nextConfig.headers!()) as Rule[]
    const headers = Object.fromEntries(
      rules
        .filter((rule) => rule.source === '/:path*')
        .flatMap((rule) => rule.headers)
        .map(({ key, value }) => [key.toLowerCase(), value])
    )
    expect(headers['x-frame-options']).toBe('DENY')
    expect(headers['content-security-policy']).toMatch(/frame-ancestors 'none'/)
    expect(headers['x-content-type-options']).toBe('nosniff')
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
    expect(Number(/max-age=(\d+)/.exec(headers['strict-transport-security'])?.[1])).toBeGreaterThanOrEqual(15_552_000)
  })
})
