// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { ArgumentError, parseArgs, type HarnessArgs } from './args'
import { classify, parseServerTiming, takeSample, type FetchLike, type Sample } from './sample'
import { runArrival, runClosed, AbortGuard } from './run'
import { pickIteration, stepHeaders, validateScenario, type Scenario, type Step } from './scenario'
import { summarizeStep, throughput } from './stats'

const step: Step = { name: 'page', target: 'server', path: '/x', expect: { body: 'json' } }

function sample(overrides: Partial<Sample>): Sample {
  return {
    step: 'page',
    phase: 'measure',
    outcome: 'ok',
    status: 200,
    ms: 100,
    bytes: 10,
    lateMs: 0,
    statements: null,
    statementMs: null,
    reads: null,
    poolWaitMs: null,
    coalesced: null,
    cacheControl: null,
    cacheStatus: null,
    error: null,
    ...overrides,
  }
}

function respond(status: number, body = '{}', headers: Record<string, string> = {}): FetchLike {
  return async () => new Response(body, { status, headers })
}

function args(overrides: Partial<HarnessArgs> = {}): HarnessArgs {
  return { ...parseArgs([]), ...overrides }
}

describe('latency summary', () => {
  // The bug that started this: a throttled or failing run reported a better
  // p95 than a healthy one, because the fast refusals were in the distribution.
  it('a fast 429 or 500 cannot lower the successful p95', () => {
    const samples = [
      ...Array.from({ length: 20 }, () => sample({ ms: 400 })),
      ...Array.from({ length: 80 }, () => sample({ ms: 2, outcome: 'throttled', status: 429 })),
      ...Array.from({ length: 20 }, () => sample({ ms: 5, outcome: 'server-error', status: 500 })),
    ]
    const summary = summarizeStep('page', samples)

    expect(summary.okLatency.p95).toBe(400)
    expect(summary.okLatency.n).toBe(20)
    expect(summary.outcomes.throttled).toBe(80)
    expect(summary.outcomes['server-error']).toBe(20)
    expect(summary.failureRate).toBeCloseTo(100 / 120)
  })

  it('excludes every warmup response, however many there were', () => {
    const samples = [
      ...Array.from({ length: 8 }, () => sample({ ms: 5_000, phase: 'warmup' })),
      ...Array.from({ length: 10 }, () => sample({ ms: 50 })),
    ]
    const summary = summarizeStep('page', samples)

    expect(summary.measured).toBe(10)
    expect(summary.okLatency.max).toBe(50)
  })

  it('reports a diagnostic the server never sent as unavailable, not zero', () => {
    const summary = summarizeStep('page', [sample({ statements: null })])
    expect(summary.statements).toEqual({ median: null, max: null, reported: 0 })
  })

  it('takes cost counts from successful responses only', () => {
    const summary = summarizeStep('page', [
      sample({ statements: 40, bytes: 5000 }),
      sample({ statements: 1, bytes: 20, outcome: 'server-error', status: 500 }),
    ])
    expect(summary.statements.max).toBe(40)
    expect(summary.bytes.median).toBe(5000)
  })
})

describe('classify', () => {
  it('separates throttling from other client errors', () => {
    expect(classify(429, '', undefined).outcome).toBe('throttled')
    expect(classify(404, '', undefined).outcome).toBe('client-error')
    expect(classify(503, '', undefined).outcome).toBe('server-error')
  })

  it('treats a 200 that is not the intended content as invalid', () => {
    expect(classify(200, '<html>login</html>', { body: 'json' }).outcome).toBe('invalid-body')
    expect(classify(200, '{}', { body: 'json', minBytes: 100 }).outcome).toBe('invalid-body')
    expect(classify(200, '<html><body>ok</body></html>', { body: 'html', contains: 'Lima' }).outcome).toBe(
      'invalid-body',
    )
  })

  it('accepts a declared non-200 status as the intended outcome', () => {
    expect(classify(401, '{"user":null}', { status: [200, 401], body: 'json' }).outcome).toBe('ok')
  })
})

describe('takeSample', () => {
  it('times out a hung fetch and counts it', async () => {
    const hang: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      })

    const result = await takeSample('http://x/y', step, { phase: 'measure', timeoutMs: 20, fetchImpl: hang })

    expect(result.outcome).toBe('timeout')
    expect(result.status).toBeNull()
  })

  it('times out a response whose body never finishes', async () => {
    const stall: FetchLike = async (_url, init) => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{'))
          init.signal?.addEventListener('abort', () => controller.error(new DOMException('aborted', 'AbortError')))
        },
      })
      return new Response(stream, { status: 200 })
    }

    const result = await takeSample('http://x/y', step, { phase: 'measure', timeoutMs: 20, fetchImpl: stall })
    expect(result.outcome).toBe('timeout')
  })

  it('reports a refused connection as transport, not as a timeout', async () => {
    const refuse: FetchLike = async () => {
      throw new TypeError('fetch failed', { cause: new Error('connect ECONNREFUSED') })
    }
    const result = await takeSample('http://x/y', step, { phase: 'measure', timeoutMs: 1000, fetchImpl: refuse })

    expect(result.outcome).toBe('transport')
    expect(result.error).toContain('ECONNREFUSED')
  })

  it('reads counts from Server-Timing, including pool wait', async () => {
    const result = await takeSample('http://x/y', step, {
      phase: 'measure',
      timeoutMs: 1000,
      fetchImpl: respond(200, '{"a":1}', {
        'server-timing': 'total;dur=9, sql;dur=30;desc="12 statements (cumulative)", reads;desc="4", pool;dur=7;desc="3 acquires"',
      }),
    })

    expect(result).toMatchObject({ outcome: 'ok', statements: 12, statementMs: 30, reads: 4, poolWaitMs: 7 })
  })
})

describe('parseServerTiming', () => {
  it('keeps an entry whose quoted description contains a comma', () => {
    const parsed = parseServerTiming('a;desc="x, y", b;dur=3')
    expect(parsed.a?.desc).toBe('x, y')
    expect(parsed.b?.dur).toBe(3)
  })
})

describe('parseArgs', () => {
  it('rejects runs and concurrency that are not bounded whole numbers', () => {
    expect(() => parseArgs(['--runs', 'abc'])).toThrow(ArgumentError)
    expect(() => parseArgs(['--runs', '0'])).toThrow(/between 1 and/)
    expect(() => parseArgs(['--concurrent', '-3'])).toThrow(ArgumentError)
    expect(() => parseArgs(['--concurrent', '2.5'])).toThrow(ArgumentError)
    expect(() => parseArgs(['--concurrent', '100000'])).toThrow(/between 1 and 500/)
  })

  it('rejects unknown flags and missing values', () => {
    expect(() => parseArgs(['--rusn', '10'])).toThrow(/Unknown flag --rusn/)
    expect(() => parseArgs(['--runs'])).toThrow(/needs a value/)
  })

  it('refuses a cold run that also asks for warmup', () => {
    expect(() => parseArgs(['--cache', 'cold', '--warmup', '3'])).toThrow(ArgumentError)
    expect(parseArgs(['--cache', 'cold']).warmup).toBe(0)
  })

  it('accepts the documented pnpm form with a leading --', () => {
    expect(parseArgs(['--', '--runs', '20', '--concurrent', '4'])).toMatchObject({ runs: 20, concurrent: 4 })
  })

  it('refuses a non-http base', () => {
    expect(() => parseArgs(['--base', 'localhost:4000'])).toThrow(ArgumentError)
  })
})

describe('scenarios', () => {
  it('rejects a step with no leading slash', () => {
    expect(() =>
      validateScenario({ name: 's', iterations: [{ name: 'i', steps: [{ name: 'x', target: 'server', path: 'api' }] }] }, 't'),
    ).toThrow(/starting with/)
  })

  it('substitutes the browser origin into scenario headers', () => {
    const withOrigin: Step = { ...step, headers: { origin: '{origin}', cookie: 'a=b' } }
    expect(stepHeaders(withOrigin, { origin: 'https://client.example' })).toEqual({
      origin: 'https://client.example',
      cookie: 'a=b',
    })
    expect(parseArgs(['--client', 'http://localhost:3100']).origin).toBe('http://localhost:3100')
    expect(parseArgs(['--origin', 'https://x.example']).origin).toBe('https://x.example')
  })

  it('picks iterations by weight', () => {
    const scenario = {
      name: 's',
      description: '',
      iterations: [
        { name: 'a', weight: 1, steps: [step] },
        { name: 'b', weight: 3, steps: [step] },
      ],
    } satisfies Scenario
    expect(pickIteration(scenario, () => 0.1).name).toBe('a')
    expect(pickIteration(scenario, () => 0.5).name).toBe('b')
  })
})

const scenario: Scenario = { name: 's', description: '', iterations: [{ name: 'i', steps: [step] }] }

describe('runClosed', () => {
  it('labels warmup separately and measures runs × concurrent', async () => {
    const result = await runClosed(scenario, args({ warmup: 2, runs: 3, concurrent: 4 }), {
      fetchImpl: respond(200),
    })

    expect(result.samples.filter((entry) => entry.phase === 'warmup')).toHaveLength(2)
    expect(result.samples.filter((entry) => entry.phase === 'measure')).toHaveLength(12)
  })

  it('stops once failures pass the abort threshold', async () => {
    const result = await runClosed(scenario, args({ warmup: 0, runs: 100, abortErrorRate: 0.5, abortMinSamples: 5 }), {
      fetchImpl: respond(500),
    })

    expect(result.aborted).toMatch(/failure rate/)
    expect(result.samples.length).toBeLessThan(100)
  })
})

describe('runArrival', () => {
  it('counts arrivals it had to drop instead of delaying them', async () => {
    const slow: FetchLike = () => new Promise((resolve) => setTimeout(() => resolve(new Response('{}')), 300))

    const result = await runArrival(scenario, args({ warmup: 0, rate: 100, durationS: 1, maxInFlight: 5 }), {
      fetchImpl: slow,
    })

    expect(result.offered).toBe(100)
    expect(result.started + result.dropped).toBe(100)
    expect(result.dropped).toBeGreaterThan(50)

    const t = throughput({ ...result, samples: result.samples })
    expect(t.offeredPerS).toBeGreaterThan(t.okPerS)
  })

  it('runs every step of an iteration in order', async () => {
    const seen: string[] = []
    const record: FetchLike = async (url) => {
      seen.push(url)
      return new Response('{}')
    }
    const twoStep: Scenario = {
      name: 's',
      description: '',
      iterations: [
        {
          name: 'visit',
          steps: [
            { ...step, name: 'first', path: '/first', thinkMs: 5 },
            { ...step, name: 'second', path: '/second' },
          ],
        },
      ],
    }

    await runArrival(twoStep, args({ warmup: 0, rate: 2, durationS: 1 }), { fetchImpl: record })
    expect(seen).toEqual([
      'http://localhost:4000/first',
      'http://localhost:4000/second',
      'http://localhost:4000/first',
      'http://localhost:4000/second',
    ])
  })
})

describe('AbortGuard', () => {
  it('judges the trailing window, so a late collapse is caught', () => {
    let now = 0
    const guard = new AbortGuard(0.1, 10, 1000, () => now)

    for (let index = 0; index < 100; index += 1) {
      now += 10
      expect(guard.record(sample({}))).toBeNull()
    }
    now += 2000 // the healthy history ages out of the window
    let verdict: string | null = null
    for (let index = 0; index < 10; index += 1) {
      now += 10
      verdict ??= guard.record(sample({ outcome: 'server-error', status: 500 }))
    }
    expect(verdict).toMatch(/failure rate/)
  })
})
