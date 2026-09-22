import { createServer, type Server } from 'node:http'
import { AddressInfo } from 'node:net'

/**
 * A stand-in for the frontend's `/api/revalidate`, which can be told to
 * misbehave.
 *
 * The publishing tasks all have the same shape of question: what does the
 * backend do when the frontend answers 401, answers 500, hangs past the
 * timeout, or is simply not there? Against the real client those states are
 * awkward to produce and impossible to produce deterministically. Here they
 * are a field on an object.
 *
 * It also records what it was asked to invalidate, which is the only way to
 * assert that a fan-out actually reached every destination rather than a
 * truncated first hundred.
 *
 * Binds to 127.0.0.1 explicitly. A test receiver that answered on a LAN
 * address would be a way for something outside this machine to make the
 * backend believe a page was refreshed.
 */

export type Delivery = { at: number; tags: string[]; paths: string[]; secret: string | null }

export type ReceiverMode =
  | { kind: 'ok' }
  | { kind: 'status'; status: number; body?: string }
  | { kind: 'hang'; ms: number }
  | { kind: 'close' }
  /**
   * Accept every request except the `nth` (1-based) whose body contains
   * `match`, which answers `status`. Counting only matching requests keeps a
   * late arrival from an earlier test from shifting the count.
   */
  | { kind: 'fail-nth'; nth: number; status: number; match: string }

export class FaultReceiver {
  readonly deliveries: Delivery[] = []
  mode: ReceiverMode = { kind: 'ok' }
  /** Set to refuse anything whose secret does not match. */
  expectedSecret: string | null = null

  private server: Server | null = null
  /** Requests received since `reset`, accepted or not. */
  received = 0
  private matched = 0

  async listen(port = 0): Promise<number> {
    this.server = createServer((req, res) => {
      const chunks: Buffer[] = []
      req.on('data', (chunk: Buffer) => chunks.push(chunk))
      req.on('end', () => {
        void this.answer(req.headers['x-revalidation-secret'], Buffer.concat(chunks).toString('utf8'), res)
      })
    })

    await new Promise<void>((resolve) => this.server!.listen(port, '127.0.0.1', resolve))
    return (this.server!.address() as AddressInfo).port
  }

  private async answer(
    secretHeader: string | string[] | undefined,
    body: string,
    res: import('node:http').ServerResponse,
  ): Promise<void> {
    const secret = Array.isArray(secretHeader) ? (secretHeader[0] ?? null) : (secretHeader ?? null)

    let parsed: { tags?: unknown; paths?: unknown } = {}
    try {
      parsed = JSON.parse(body) as typeof parsed
    } catch {
      // A malformed body is still a delivery attempt worth recording.
    }

    const mode = this.mode
    this.received += 1
    if (mode.kind === 'fail-nth' && body.includes(mode.match)) this.matched += 1

    if (mode.kind === 'fail-nth' && body.includes(mode.match) && this.matched === mode.nth) {
      res.writeHead(mode.status, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: `receiver failed request ${mode.nth}` }))
      return
    }

    if (mode.kind === 'close') {
      res.destroy()
      return
    }

    if (mode.kind === 'hang') {
      await new Promise((resolve) => setTimeout(resolve, mode.ms))
    }

    if (this.expectedSecret !== null && secret !== this.expectedSecret) {
      res.writeHead(401, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: 'Unauthorized' }))
      return
    }

    if (mode.kind === 'status') {
      res.writeHead(mode.status, { 'content-type': 'application/json' })
      res.end(mode.body ?? JSON.stringify({ error: `receiver returned ${mode.status}` }))
      return
    }

    // Recorded only once the receiver has decided to accept it, so
    // `deliveries` means "the frontend acknowledged this", which is the thing
    // the outbox is allowed to treat as done.
    this.deliveries.push({
      at: Date.now(),
      tags: Array.isArray(parsed.tags) ? (parsed.tags as string[]) : [],
      paths: Array.isArray(parsed.paths) ? (parsed.paths as string[]) : [],
      secret,
    })

    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ revalidated: true }))
  }

  /** Every tag the receiver has been asked to invalidate, deduplicated. */
  allTags(): Set<string> {
    return new Set(this.deliveries.flatMap((delivery) => delivery.tags))
  }

  allPaths(): Set<string> {
    return new Set(this.deliveries.flatMap((delivery) => delivery.paths))
  }

  reset(): void {
    this.deliveries.length = 0
    this.mode = { kind: 'ok' }
    this.received = 0
    this.matched = 0
  }

  async close(): Promise<void> {
    const server = this.server
    if (!server) return
    this.server = null
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
}
