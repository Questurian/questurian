import { describe, expect, it } from 'vitest'

import { parseClientAddressMode, parseEdgeFault, peerAddress } from './front-door-edge'

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

// Launch fix plan item 9: the edge can write the caller's real address, as
// Cloudflare does, so the one-caller problem and the load identity's fix can
// both be shown in the sandbox.
describe('front-door edge client address', () => {
  it('turns overwriting on and off with a boolean, and nothing else', () => {
    expect(parseClientAddressMode('{"overwrite":true}')).toBe(true)
    expect(parseClientAddressMode('{"overwrite":false}')).toBe(false)
    for (const body of ['', 'null', '{}', '{"overwrite":"yes"}', 'not json']) {
      expect(parseClientAddressMode(body), body).toBe('invalid')
    }
  })

  it('writes the peer address as Cloudflare would, unwrapping IPv4-mapped IPv6', () => {
    expect(peerAddress('::ffff:127.0.0.1')).toBe('127.0.0.1')
    expect(peerAddress('127.0.0.1')).toBe('127.0.0.1')
    expect(peerAddress('::1')).toBe('::1')
    expect(peerAddress(undefined)).toBe('0.0.0.0')
  })
})
