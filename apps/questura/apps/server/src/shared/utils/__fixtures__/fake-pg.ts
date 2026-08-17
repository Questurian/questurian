/**
 * A stand-in for `pg` used by `advisory-lock.test.ts`.
 *
 * Two things it models faithfully, because the code under test depends on both:
 *
 *   - Advisory locks belong to a *session*, are counted, and disappear when the
 *     session ends. That is what makes one connection able to hold several keys,
 *     and what makes discarding a connection a valid way to release a lock.
 *   - A pool that actually enforces `max`. Without that, connection exhaustion
 *     cannot be reproduced at all, and exhaustion is the bug.
 *
 * Lives in a fixture module rather than the test file because `vi.mock` factories
 * are hoisted above class declarations.
 */

export class FakePostgres {
  private holders = new Map<string, { sessionId: number; count: number }>()
  private waiters = new Map<string, Array<{ sessionId: number; grant: () => void }>>()

  lock(sessionId: number, id: string): Promise<void> {
    const held = this.holders.get(id)

    if (!held) {
      this.holders.set(id, { sessionId, count: 1 })
      return Promise.resolve()
    }

    if (held.sessionId === sessionId) {
      held.count += 1
      return Promise.resolve()
    }

    return new Promise((resolve) => {
      const queue = this.waiters.get(id) ?? []
      queue.push({ sessionId, grant: resolve })
      this.waiters.set(id, queue)
    })
  }

  unlock(sessionId: number, id: string): void {
    const held = this.holders.get(id)

    if (!held || held.sessionId !== sessionId) {
      throw new Error(`session ${sessionId} does not hold ${id}`)
    }

    held.count -= 1

    if (held.count > 0) {
      return
    }

    this.holders.delete(id)
    this.grantNext(id)
  }

  /** Discarding a connection ends its session, which drops everything it held. */
  endSession(sessionId: number): void {
    for (const [id, held] of [...this.holders]) {
      if (held.sessionId === sessionId) {
        this.holders.delete(id)
        this.grantNext(id)
      }
    }
  }

  private grantNext(id: string): void {
    const next = this.waiters.get(id)?.shift()

    if (!next) {
      return
    }

    this.holders.set(id, { sessionId: next.sessionId, count: 1 })
    next.grant()
  }

  get heldKeys(): number {
    return this.holders.size
  }
}

export class FakeClient {
  readonly queries: string[] = []

  constructor(
    private readonly pool: FakePool,
    readonly sessionId: number
  ) {}

  async query(text: string, values: string[] = []): Promise<unknown> {
    this.queries.push(text)

    if (text.includes('pg_advisory_unlock')) {
      if (this.pool.failUnlock) {
        throw new Error('connection lost')
      }

      this.pool.server.unlock(this.sessionId, values[0])
      return { rows: [] }
    }

    await this.pool.server.lock(this.sessionId, values[0])
    return { rows: [] }
  }

  release(error?: Error): void {
    this.pool.releaseClient(this, error)
  }
}

export class FakePool {
  static instances: FakePool[] = []

  readonly server = new FakePostgres()
  readonly max: number
  failUnlock = false
  connectCalls = 0
  peakCheckedOut = 0
  destroyed = 0

  private checkedOut = 0
  private nextSessionId = 1
  private idle: FakeClient[] = []
  private waiting: Array<(client: FakeClient) => void> = []

  constructor(config: { max?: number }) {
    this.max = config.max ?? 10
    FakePool.instances.push(this)
  }

  on(): this {
    return this
  }

  async connect(): Promise<FakeClient> {
    this.connectCalls += 1

    if (this.checkedOut >= this.max) {
      return new Promise((resolve) => {
        this.waiting.push(resolve)
      })
    }

    this.checkedOut += 1
    this.peakCheckedOut = Math.max(this.peakCheckedOut, this.checkedOut)

    return this.idle.pop() ?? new FakeClient(this, this.nextSessionId++)
  }

  releaseClient(client: FakeClient, error?: Error): void {
    if (error) {
      this.destroyed += 1
      this.server.endSession(client.sessionId)
    }

    // Hand straight to a waiter if there is one; the checkout count is unchanged.
    const waiter = this.waiting.shift()

    if (waiter) {
      waiter(error ? new FakeClient(this, this.nextSessionId++) : client)
      return
    }

    this.checkedOut -= 1

    if (!error) {
      this.idle.push(client)
    }
  }

  async end(): Promise<void> {}
}
