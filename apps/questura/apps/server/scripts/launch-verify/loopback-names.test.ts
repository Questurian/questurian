import dns from 'node:dns'
import { describe, expect, it } from 'vitest'

import { isLocalhostName, resolveLocalhostNamesToLoopback } from './loopback-names'

describe('loopback names', () => {
  it.each(['localhost', 'app.readiness.localhost', 'MEDIA.readiness.LOCALHOST.'])('treats %s as loopback', (name) => {
    expect(isLocalhostName(name)).toBe(true)
  })

  it.each(['questurian.com', 'localhost.questurian.com', 'notlocalhost', 'api.questurian.com'])('leaves %s to the OS', (name) => {
    expect(isLocalhostName(name)).toBe(false)
  })

  it('answers *.localhost with 127.0.0.1, in both callback shapes', async () => {
    resolveLocalhostNamesToLoopback()
    const one = await new Promise((done) => dns.lookup('media.readiness.localhost', {}, (_error, address, family) => done({ address, family })))
    expect(one).toEqual({ address: '127.0.0.1', family: 4 })
    const all = await new Promise((done) => dns.lookup('app.readiness.localhost', { all: true }, (_error, addresses) => done(addresses)))
    expect(all).toEqual([{ address: '127.0.0.1', family: 4 }])
  })

  it('answers the promise form too, which Playwright uses', async () => {
    resolveLocalhostNamesToLoopback()
    await expect(dns.promises.lookup('api.readiness.localhost', { all: true })).resolves.toEqual([{ address: '127.0.0.1', family: 4 }])
    await expect(dns.promises.lookup('api.readiness.localhost')).resolves.toEqual({ address: '127.0.0.1', family: 4 })
  })
})
