import { describe, expect, it } from 'vitest'

import {
  isBenchmarkAddress,
  LOAD_IDENTITY_HEADER,
  loadIdentityAddress,
  loadIdentityState,
  loadIdentityVerdict,
  loadTestConfigProblems,
  MAX_LOAD_TEST_WINDOW_MS,
  readLoadTestConfig,
  signLoadIdentity,
} from './load-identity'

/**
 * Decision D3's guard rails, one test each where the code enforces them
 * (launch fix plan item 9). "Every use is logged" is in proxy.test.ts;
 * "launch:verify fails while it is set" is in scripts/launch-verify.
 */

const KEY = 'load-test-key-for-unit-tests-0123456789abcdef'
const NOW = Date.parse('2026-09-25T12:00:00Z')
const UNTIL = '2026-09-25T15:00:00Z'
const ON = { LOAD_TEST_KEY: KEY, LOAD_TEST_UNTIL: UNTIL }

function signed(address: string, key = KEY): Headers {
  return new Headers({ [LOAD_IDENTITY_HEADER]: `${address};${signLoadIdentity(key, address)}` })
}

describe('off by default', () => {
  it('is off with nothing set, and a signed header means nothing', () => {
    expect(readLoadTestConfig({})).toEqual({ state: 'off' })
    expect(loadIdentityState({}, NOW)).toBe('off')
    expect(loadIdentityAddress(signed('198.18.0.5'), {}, NOW)).toBeNull()
    expect(loadIdentityVerdict(signed('198.18.0.5'), readLoadTestConfig({}), NOW)).toEqual({ kind: 'ignored' })
  })

  it('treats a blank key as unset', () => {
    expect(readLoadTestConfig({ LOAD_TEST_KEY: '   ' })).toEqual({ state: 'off' })
  })

  it('refuses a window left behind without its key, so the cleanup is finished', () => {
    expect(readLoadTestConfig({ LOAD_TEST_UNTIL: UNTIL }).state).toBe('invalid')
    expect(loadTestConfigProblems({ LOAD_TEST_UNTIL: UNTIL }, NOW)).toHaveLength(1)
  })
})

describe('32+ characters', () => {
  it('refuses a key of 31 characters, at boot and at runtime', () => {
    const env = { LOAD_TEST_KEY: 'k'.repeat(31), LOAD_TEST_UNTIL: UNTIL }
    expect(loadTestConfigProblems(env, NOW)).toEqual([expect.stringContaining('shorter than 32')])
    expect(loadIdentityState(env, NOW)).toBe('invalid')
    expect(loadIdentityAddress(signed('198.18.0.5', 'k'.repeat(31)), env, NOW)).toBeNull()
  })

  it('accepts a key of exactly 32', () => {
    expect(loadTestConfigProblems({ LOAD_TEST_KEY: 'k'.repeat(32), LOAD_TEST_UNTIL: UNTIL }, NOW)).toEqual([])
  })
})

describe('only during the test window', () => {
  it('needs LOAD_TEST_UNTIL with the key, as a real time', () => {
    expect(loadTestConfigProblems({ LOAD_TEST_KEY: KEY }, NOW)).toEqual([expect.stringContaining('LOAD_TEST_UNTIL')])
    expect(loadTestConfigProblems({ LOAD_TEST_KEY: KEY, LOAD_TEST_UNTIL: 'tonight' }, NOW)).toHaveLength(1)
  })

  it(`refuses to boot with a window ending more than ${MAX_LOAD_TEST_WINDOW_MS / 3_600_000} hours away`, () => {
    const far = new Date(NOW + MAX_LOAD_TEST_WINDOW_MS + 60_000).toISOString()
    expect(loadTestConfigProblems({ LOAD_TEST_KEY: KEY, LOAD_TEST_UNTIL: far }, NOW)).toEqual([expect.stringContaining('hours away')])
    const near = new Date(NOW + MAX_LOAD_TEST_WINDOW_MS).toISOString()
    expect(loadTestConfigProblems({ LOAD_TEST_KEY: KEY, LOAD_TEST_UNTIL: near }, NOW)).toEqual([])
  })

  it('stops working when the window ends, even with the key still set, and says so', () => {
    const after = Date.parse(UNTIL)
    expect(loadIdentityAddress(signed('198.18.0.5'), ON, after - 1)).toBe('198.18.0.5')
    expect(loadIdentityAddress(signed('198.18.0.5'), ON, after)).toBeNull()
    expect(loadIdentityVerdict(signed('198.18.0.5'), readLoadTestConfig(ON), after)).toMatchObject({ kind: 'refused' })
    expect(loadIdentityState(ON, after)).toBe('expired')
  })

  it('still boots after the window (a restart must not become an outage); launch:verify reports it', () => {
    expect(loadTestConfigProblems(ON, Date.parse(UNTIL) + 3_600_000)).toEqual([])
  })
})

describe('what a load identity can claim', () => {
  it('counts a correctly signed benchmarking address as that address', () => {
    expect(loadIdentityState(ON, NOW)).toBe('on')
    expect(loadIdentityAddress(signed('198.18.0.5'), ON, NOW)).toBe('198.18.0.5')
    expect(loadIdentityAddress(signed('198.19.255.250'), ON, NOW)).toBe('198.19.255.250')
  })

  it('refuses a wrong key, a tampered address or a malformed value', () => {
    const verdict = (headers: Headers) => loadIdentityVerdict(headers, readLoadTestConfig(ON), NOW)
    expect(verdict(signed('198.18.0.5', `${KEY}x`))).toEqual({ kind: 'refused', reason: 'wrong signature' })
    const tampered = new Headers({ [LOAD_IDENTITY_HEADER]: `198.18.0.6;${signLoadIdentity(KEY, '198.18.0.5')}` })
    expect(verdict(tampered)).toEqual({ kind: 'refused', reason: 'wrong signature' })
    for (const raw of ['198.18.0.5', '198.18.0.5;', `198.18.0.5;${'z'.repeat(64)}`, ';abc']) {
      expect(verdict(new Headers({ [LOAD_IDENTITY_HEADER]: raw })).kind, raw).toBe('refused')
    }
  })

  it('can never name a real reader: only 198.18.0.0/15, even correctly signed', () => {
    for (const address of ['203.0.113.7', '198.20.0.1', '198.17.255.255', '10.0.0.1', '2001:db8::1', '198.18.0.256', '198.18.01.5']) {
      expect(isBenchmarkAddress(address), address).toBe(false)
      expect(loadIdentityAddress(signed(address), ON, NOW), address).toBeNull()
    }
  })

  it('is absent when the header is', () => {
    expect(loadIdentityVerdict(new Headers(), readLoadTestConfig(ON), NOW)).toEqual({ kind: 'absent' })
  })
})
