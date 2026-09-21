import { describe, expect, it } from 'vitest'

import { currencyStartupPolicy } from './startup'

describe('currencyStartupPolicy', () => {
  it('keeps development as it was: seed and sync every boot', () => {
    expect(currencyStartupPolicy({ NODE_ENV: 'development' })).toEqual({ seedIfEmpty: true, sync: 'always' })
  })

  // Every cold serverless instance is a boot.
  it('never seeds in production and syncs only stale rates', () => {
    expect(currencyStartupPolicy({ NODE_ENV: 'production' })).toEqual({ seedIfEmpty: false, sync: 'if-stale' })
  })

  it('takes an explicit override and ignores nonsense', () => {
    expect(currencyStartupPolicy({ NODE_ENV: 'production', CURRENCY_STARTUP_SYNC: 'off' }).sync).toBe('off')
    expect(currencyStartupPolicy({ NODE_ENV: 'production', CURRENCY_STARTUP_SYNC: 'always' }).sync).toBe('always')
    expect(currencyStartupPolicy({ NODE_ENV: 'production', CURRENCY_STARTUP_SYNC: 'maybe' }).sync).toBe('if-stale')
  })
})
