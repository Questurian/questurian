import { describe, expect, it } from 'vitest'

import { parseEdgeFault } from './front-door-edge'

describe('front-door edge fault control', () => {
  it('clears on null or an empty body', () => {
    expect(parseEdgeFault('null')).toBeNull()
    expect(parseEdgeFault('')).toBeNull()
  })

  it('accepts a 5xx status with a match', () => {
    expect(parseEdgeFault('{"status":503,"match":"path=%2Fa"}')).toEqual({ status: 503, match: 'path=%2Fa' })
  })

  it('refuses anything that is not a server error with a match', () => {
    for (const body of ['{"status":200,"match":"x"}', '{"status":404,"match":"x"}', '{"status":503}', '{"status":503,"match":""}', '{"status":"503","match":"x"}', 'not json']) {
      expect(parseEdgeFault(body), body).toBe('invalid')
    }
  })
})
