import { describe, expect, it } from 'vitest'

import { CircuitBreaker, CircuitOpenError, type BreakerOptions } from './circuit-breaker'

/**
 * A command deadline bounds one command. It says nothing about how many
 * requests are each holding one — which is the actual failure: with a
 * one-second Redis deadline and a hundred arrivals a second, a blackholed
 * Redis means a hundred requests in flight at all times, each waiting a full
 * second to be told what the previous hundred already found out.
 */
function clock() {
  let now = 0
  return { now: () => now, advance: (ms: number) => (now += ms) }
}

function breaker(options: BreakerOptions = {}) {
  const time = clock()
  return {
    time,
    breaker: new CircuitBreaker('redis', { failureThreshold: 3, openMs: 1_000, now: time.now, ...options }),
  }
}

const fail = () => Promise.reject(new Error('timeout'))
const succeed = () => Promise.resolve('value')

describe('CircuitBreaker', () => {
  it('passes work through while the dependency is answering', async () => {
    const { breaker: cut } = breaker()
    await expect(cut.run(succeed)).resolves.toBe('value')
    expect(cut.state()).toBe('closed')
  })

  it('stays closed while failures are occasional', async () => {
    const { breaker: cut } = breaker()
    await expect(cut.run(fail)).rejects.toThrow('timeout')
    await expect(cut.run(succeed)).resolves.toBe('value')
    await expect(cut.run(fail)).rejects.toThrow('timeout')

    expect(cut.state()).toBe('closed')
  })

  it('opens after consecutive failures and then fails immediately', async () => {
    const { breaker: cut } = breaker()
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expect(cut.run(fail)).rejects.toThrow('timeout')
    }

    expect(cut.state()).toBe('open')
    // The point: this rejection did not wait for a timeout.
    await expect(cut.run(fail)).rejects.toThrow(CircuitOpenError)
    expect(cut.stats().shortCircuited).toBe(1)
  })

  it('lets exactly one probe through when the cooldown expires', async () => {
    const { breaker: cut, time } = breaker()
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expect(cut.run(fail)).rejects.toThrow('timeout')
    }

    time.advance(1_000)
    expect(cut.state()).toBe('probing')

    // A cooldown expiring under load must not send everything at once at a
    // dependency that has only just started answering.
    let released!: () => void
    const held = new Promise<string>((resolve) => {
      released = () => resolve('value')
    })

    const probe = cut.run(() => held)
    await expect(cut.run(succeed)).rejects.toThrow(CircuitOpenError)

    released()
    await expect(probe).resolves.toBe('value')
    expect(cut.stats().probes).toBe(1)
  })

  it('closes once a probe succeeds', async () => {
    const { breaker: cut, time } = breaker()
    for (let attempt = 0; attempt < 3; attempt += 1) await cut.run(fail).catch(() => {})

    time.advance(1_000)
    await expect(cut.run(succeed)).resolves.toBe('value')

    expect(cut.state()).toBe('closed')
    expect(cut.stats().consecutiveFailures).toBe(0)
  })

  it('starts the cooldown again when a probe fails', async () => {
    const { breaker: cut, time } = breaker()
    for (let attempt = 0; attempt < 3; attempt += 1) await cut.run(fail).catch(() => {})

    time.advance(1_000)
    await expect(cut.run(fail)).rejects.toThrow('timeout')
    expect(cut.state()).toBe('open')

    time.advance(999)
    expect(cut.state()).toBe('open')
    time.advance(1)
    expect(cut.state()).toBe('probing')
  })

  it('counts how often it opened, so an outage is visible after the fact', async () => {
    const { breaker: cut, time } = breaker()
    for (let attempt = 0; attempt < 3; attempt += 1) await cut.run(fail).catch(() => {})
    expect(cut.stats().opened).toBe(1)

    time.advance(1_000)
    await cut.run(succeed)
    for (let attempt = 0; attempt < 3; attempt += 1) await cut.run(fail).catch(() => {})
    expect(cut.stats().opened).toBe(2)
  })
})
