/**
 * Stop paying a dependency's timeout once it has clearly stopped answering.
 *
 * A command deadline bounds one command. It says nothing about how many
 * requests are each holding one. With a one-second Redis deadline and a
 * hundred arrivals a second, a blackholed Redis means a hundred requests in
 * flight at all times, every one of them waiting a full second to be told
 * what everybody already knows.
 *
 * After `failureThreshold` consecutive failures the breaker opens: calls fail
 * immediately for `openMs` instead of waiting. One call is then let through
 * to find out whether the dependency is back — if it succeeds the breaker
 * closes, if it fails the cooldown starts again. A single probe rather than a
 * flood, so recovery is not a thundering herd against something that has just
 * come back.
 *
 * The breaker deliberately does not decide what a failure *means*. Callers
 * keep their own policy: public read limits fail open, payments fail closed.
 * All this changes is how long they wait to find out.
 */

export type BreakerState = 'closed' | 'open' | 'probing'

export class CircuitOpenError extends Error {
  constructor(readonly name_: string) {
    super(`${name_} is not answering; failing fast instead of waiting for a timeout`)
    this.name = 'CircuitOpenError'
  }
}

export type BreakerOptions = {
  failureThreshold?: number
  openMs?: number
  now?: () => number
}

export class CircuitBreaker {
  private consecutiveFailures = 0
  private openedAt: number | null = null
  private probing = false

  readonly counters = { opened: 0, shortCircuited: 0, probes: 0 }

  constructor(
    readonly name: string,
    private readonly options: BreakerOptions = {},
  ) {}

  private get threshold(): number {
    return this.options.failureThreshold ?? 5
  }

  private get openMs(): number {
    return this.options.openMs ?? 5_000
  }

  private get now(): number {
    return (this.options.now ?? Date.now)()
  }

  state(): BreakerState {
    if (this.openedAt === null) return 'closed'
    if (this.probing) return 'probing'
    return this.now - this.openedAt >= this.openMs ? 'probing' : 'open'
  }

  async run<T>(work: () => Promise<T>): Promise<T> {
    const state = this.state()

    if (state === 'open') {
      this.counters.shortCircuited += 1
      throw new CircuitOpenError(this.name)
    }

    // Exactly one probe at a time: a cooldown that expires under load would
    // otherwise send every waiting request at a dependency that has just
    // started answering again.
    if (state === 'probing') {
      if (this.probing) {
        this.counters.shortCircuited += 1
        throw new CircuitOpenError(this.name)
      }
      this.probing = true
      this.counters.probes += 1
    }

    try {
      const value = await work()
      this.consecutiveFailures = 0
      this.openedAt = null
      this.probing = false
      return value
    } catch (error) {
      this.probing = false
      this.consecutiveFailures += 1
      if (this.consecutiveFailures >= this.threshold) {
        if (this.openedAt === null) this.counters.opened += 1
        this.openedAt = this.now
      }
      throw error
    }
  }

  stats() {
    return {
      name: this.name,
      state: this.state(),
      consecutiveFailures: this.consecutiveFailures,
      ...this.counters,
    }
  }

  /** Test seam. */
  reset(): void {
    this.consecutiveFailures = 0
    this.openedAt = null
    this.probing = false
  }
}
