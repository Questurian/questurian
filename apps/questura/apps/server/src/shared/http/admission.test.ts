import { afterEach, describe, expect, it, vi } from 'vitest'

import { AdmissionGate, AdmissionRefused, admissionGate, resetAdmissionGates } from './admission'

function deferred<T = void>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  resetAdmissionGates()
})

describe('AdmissionGate', () => {
  it('runs up to the limit at once and queues the rest', async () => {
    const gate = new AdmissionGate('t', { limit: 2, maxQueue: 5, maxWaitMs: 10_000 })
    const blockers = [deferred(), deferred(), deferred()]
    let running = 0
    let peak = 0

    const runs = blockers.map((blocker) =>
      gate.run(async () => {
        running += 1
        peak = Math.max(peak, running)
        await blocker.promise
        running -= 1
      }),
    )
    await flush()

    expect(gate.stats()).toMatchObject({ active: 2, queued: 1 })
    blockers.forEach((blocker) => blocker.resolve())
    await Promise.all(runs)

    expect(peak).toBe(2)
    expect(gate.stats()).toMatchObject({ active: 0, queued: 0, admitted: 3 })
  })

  // Overload must be refused predictably, not queued without end.
  it('refuses immediately once the queue is full', async () => {
    const gate = new AdmissionGate('t', { limit: 1, maxQueue: 1, maxWaitMs: 10_000 })
    const block = deferred()
    const first = gate.run(() => block.promise)
    const second = gate.run(async () => 'queued')

    await expect(gate.run(async () => 'never')).rejects.toMatchObject({ reason: 'queue-full' })

    block.resolve()
    await first
    await expect(second).resolves.toMatchObject({ value: 'queued' })
    expect(gate.stats().refused['queue-full']).toBe(1)
  })

  it('refuses work that waited longer than the queue allows, and forgets it', async () => {
    vi.useFakeTimers()
    const gate = new AdmissionGate('t', { limit: 1, maxQueue: 5, maxWaitMs: 100 })
    const block = deferred()
    const first = gate.run(() => block.promise)
    const waiting = gate.run(async () => 'late')
    const assertion = expect(waiting).rejects.toMatchObject({ reason: 'queue-timeout' })

    await vi.advanceTimersByTimeAsync(101)
    await assertion
    expect(gate.stats().queued).toBe(0)

    block.resolve()
    await first
    expect(gate.stats().active).toBe(0)
  })

  it('drops a waiter whose request was aborted, so it never holds a place', async () => {
    const gate = new AdmissionGate('t', { limit: 1, maxQueue: 5, maxWaitMs: 10_000 })
    const block = deferred()
    const first = gate.run(() => block.promise)
    const controller = new AbortController()
    const work = vi.fn(async () => 'ran')
    const waiting = gate.run(work, controller.signal)

    controller.abort()
    await expect(waiting).rejects.toMatchObject({ reason: 'aborted' })
    expect(gate.stats().queued).toBe(0)

    block.resolve()
    await first
    expect(work).not.toHaveBeenCalled()
    expect(gate.stats().active).toBe(0)
  })

  it('refuses already-aborted work without running it', async () => {
    const gate = new AdmissionGate('t', { limit: 1, maxQueue: 1, maxWaitMs: 1000 })
    const controller = new AbortController()
    controller.abort()
    await expect(gate.run(async () => 1, controller.signal)).rejects.toBeInstanceOf(AdmissionRefused)
    expect(gate.stats().active).toBe(0)
  })

  it('cannot leak a slot when the work throws', async () => {
    const gate = new AdmissionGate('t', { limit: 1, maxQueue: 0, maxWaitMs: 1000 })

    await expect(gate.run(async () => Promise.reject(new Error('db down')))).rejects.toThrow('db down')
    await expect(gate.run(() => { throw new Error('sync throw') })).rejects.toThrow('sync throw')

    expect(gate.stats().active).toBe(0)
    await expect(gate.run(async () => 'fine')).resolves.toMatchObject({ value: 'fine' })
  })

  it('drains after an overload burst without a restart', async () => {
    const gate = new AdmissionGate('t', { limit: 2, maxQueue: 3, maxWaitMs: 10_000 })
    const block = deferred()
    const burst = Array.from({ length: 20 }, () => gate.run(() => block.promise).catch((error) => error))
    await flush()

    block.resolve()
    const outcomes = await Promise.all(burst)

    expect(outcomes.filter((outcome) => outcome instanceof AdmissionRefused)).toHaveLength(15)
    expect(gate.stats()).toMatchObject({ active: 0, queued: 0, admitted: 5 })
    await expect(gate.run(async () => 'after')).resolves.toMatchObject({ value: 'after' })
  })

  it('reports how long admitted work waited', async () => {
    vi.useFakeTimers()
    const gate = new AdmissionGate('t', { limit: 1, maxQueue: 1, maxWaitMs: 10_000 })
    const block = deferred()
    const first = gate.run(() => block.promise)
    const second = gate.run(async () => 'x')

    await vi.advanceTimersByTimeAsync(250)
    block.resolve()
    await first

    expect((await second).waitedMs).toBeGreaterThanOrEqual(250)
    expect(gate.stats().maxWaitedMs).toBeGreaterThanOrEqual(250)
  })
})

describe('admissionGate', () => {
  it('reads its limits from the environment, falling back on nonsense', () => {
    vi.stubEnv('PUBLIC_ASSEMBLY_CONCURRENCY', '3')
    vi.stubEnv('PUBLIC_ASSEMBLY_QUEUE', 'lots')
    expect(admissionGate('assembly').stats()).toMatchObject({ limit: 3, maxQueue: 8, maxWaitMs: 1500 })
    expect(admissionGate('query').stats()).toMatchObject({ limit: 8, maxQueue: 32 })
  })

  it('is one gate per process per class', () => {
    expect(admissionGate('query')).toBe(admissionGate('query'))
  })
})
