/**
 * One browser-side answer to "who is reading?", shared by every consumer.
 *
 * Discovery finding 7: a fresh gated page asked `/api/me` twice — once for the
 * navbar (React Query, inside `PublicChrome`'s provider) and once for the gated
 * body (a plain fetch, because page content sits outside that provider by
 * design, ADR-0003). Under load that is twice the identity traffic, and the
 * gated copy turned *any* failure into "anonymous": a paying reader saw the
 * paywall whenever the backend was busy.
 *
 * This module is provider-independent — a module-level store, like the
 * bookmark store — so both consumers can use it without wrapping public page
 * output in anything dynamic. It is browser state only: nothing here runs in
 * a server render, and no personalised value is ever put in a shared cache.
 *
 *  - **Concurrent reads share one request.** A second consumer asking while a
 *    lookup is in flight gets the same promise.
 *  - **A recent answer is reused** for `maxAgeMs`, so a consumer that mounts a
 *    moment after the navbar resolved does not ask again.
 *  - **A failure is not an answer.** It is never cached, and it is reported
 *    as `unavailable` — distinct from `anonymous` — so no consumer can mistake
 *    "could not check" for "signed out".
 *  - **Generations.** `invalidate()` (sign-in, sign-out, a 401 elsewhere)
 *    bumps the generation. A lookup that started before it cannot publish its
 *    result, so a slow response for reader A can never land after reader B
 *    signed in. Subscribers are told, so the gated body and the bookmark store
 *    re-read instead of holding the previous reader's state.
 *
 * Dependency-free apart from the injected fetcher, so node:test can run it.
 */

export type IdentityPrincipal = {
  id: string
  membership: { active: boolean }
}

export type IdentityResponse = {
  authenticated: boolean
  principal: IdentityPrincipal | null
}

export type Identity =
  | { state: 'anonymous'; principal: null }
  | { state: 'signed-in'; principal: IdentityPrincipal; member: boolean }

type Fetcher = (signal: AbortSignal | undefined) => Promise<IdentityResponse>
type Listener = (generation: number) => void

export type IdentityStoreOptions = {
  fetcher: Fetcher
  now?: () => number
}

export function identityFromResponse(response: IdentityResponse): Identity {
  if (!response.authenticated || !response.principal) return { state: 'anonymous', principal: null }
  return {
    state: 'signed-in',
    principal: response.principal,
    member: response.principal.membership?.active === true,
  }
}

/**
 * Thrown when a lookup's generation was superseded before it finished. The
 * caller should drop the result; a subscriber has already been told to
 * re-read.
 */
export class IdentitySuperseded extends Error {
  constructor() {
    super('Identity changed while this lookup was in flight')
    this.name = 'IdentitySuperseded'
  }
}

export class IdentityStore {
  private generation = 0
  private inFlight: { generation: number; promise: Promise<IdentityResponse> } | null = null
  private last: { generation: number; at: number; value: IdentityResponse } | null = null
  private readonly listeners = new Set<Listener>()
  private readonly fetcher: Fetcher
  private readonly now: () => number
  /** Requests actually sent, for tests and the request-count capture. */
  requests = 0

  constructor(options: IdentityStoreOptions) {
    this.fetcher = options.fetcher
    this.now = options.now ?? (() => Date.now())
  }

  get currentGeneration(): number {
    return this.generation
  }

  /**
   * The current reader's identity response. Reuses an answer younger than
   * `maxAgeMs` and joins a lookup already in flight; otherwise asks once.
   * Rejects with the request's own error on failure (never cached), or with
   * `IdentitySuperseded` if the reader changed meanwhile.
   */
  async read(options: { maxAgeMs?: number } = {}): Promise<IdentityResponse> {
    const maxAgeMs = options.maxAgeMs ?? 0
    const generation = this.generation

    if (this.last && this.last.generation === generation && this.now() - this.last.at <= maxAgeMs) {
      return this.last.value
    }

    let entry = this.inFlight
    if (!entry || entry.generation !== generation) {
      this.requests += 1
      // A failure is never stored: only an answer is.
      const promise = this.fetcher(undefined).then((value) => {
        if (this.generation === generation) this.last = { generation, at: this.now(), value }
        return value
      })
      const started = { generation, promise }
      entry = started
      this.inFlight = started
      const clear = () => {
        if (this.inFlight === started) this.inFlight = null
      }
      promise.then(clear, clear)
    }

    const value = await entry.promise
    if (this.generation !== generation) throw new IdentitySuperseded()
    return value
  }

  /** Forget the reader: sign-in, sign-out, or a 401 that proves the session is gone. */
  invalidate(): void {
    this.generation += 1
    this.last = null
    this.inFlight = null
    for (const listener of this.listeners) listener(this.generation)
  }

  /** Called with the new generation whenever the reader may have changed. */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
}
