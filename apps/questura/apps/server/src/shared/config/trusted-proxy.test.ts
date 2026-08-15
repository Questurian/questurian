import { describe, expect, it } from 'vitest'

import {
  TRUSTED_PROXY_HEADERS,
  TRUSTED_PROXY_NAMES,
  resolveTrustedProxyHeader,
} from './trusted-proxy'

describe('resolveTrustedProxyHeader', () => {
  it('maps a configured platform to its one header', () => {
    expect(resolveTrustedProxyHeader('cloudflare')).toBe('cf-connecting-ip')
  })

  it('accepts the value as written in an env file', () => {
    expect(resolveTrustedProxyHeader('  Cloudflare  ')).toBe('cf-connecting-ip')
  })

  it('refuses an unset deployment rather than guessing one', () => {
    expect(resolveTrustedProxyHeader(undefined)).toBeNull()
    expect(resolveTrustedProxyHeader('')).toBeNull()
    expect(resolveTrustedProxyHeader('   ')).toBeNull()
  })

  // A typo must not resolve to something plausible: production refuses to boot
  // on null, which is the intended outcome of a misspelled platform name.
  it('refuses a name it does not know', () => {
    expect(resolveTrustedProxyHeader('cloudfare')).toBeNull()
    expect(resolveTrustedProxyHeader('aws')).toBeNull()
  })

  it('never resolves to a header a caller is free to write', () => {
    const callerWritable = ['x-forwarded-for', 'x-real-ip', 'forwarded']

    for (const header of Object.values(TRUSTED_PROXY_HEADERS)) {
      expect(callerWritable).not.toContain(header)
    }
  })

  it('exposes every configured name for the boot diagnostic', () => {
    expect(TRUSTED_PROXY_NAMES).toContain('cloudflare')
    expect(TRUSTED_PROXY_NAMES.length).toBe(Object.keys(TRUSTED_PROXY_HEADERS).length)
  })
})
