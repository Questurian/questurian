import { beforeEach, describe, expect, it, vi } from 'vitest'

import { coalesce, inFlightCount, resetCoalescedWork } from './coalesce'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  resetCoalescedWork()
})

describe('coalesce', () => {
  // Four simultaneous requests for one city page each assembled it from
  // scratch: four times 43 document reads for one answer.
  it('runs identical work once while it is in flight', async () => {
    const gate = deferred<string>()
    const work = vi.fn(() => gate.promise)

    const callers = [coalesce('city:peru|lima', work), coalesce('city:peru|lima', work)]
    gate.resolve('page')

    const results = await Promise.all(callers)

    expect(work).toHaveBeenCalledTimes(1)
    expect(results.map((result) => result.value)).toEqual(['page', 'page'])
    expect(results.map((result) => result.joined)).toEqual([false, true])
  })

  it('keeps different keys separate', async () => {
    const work = vi.fn(async (value: string) => value)

    await Promise.all([
      coalesce('a', () => work('a')),
      coalesce('b', () => work('b')),
    ])

    expect(work).toHaveBeenCalledTimes(2)
  })

  // Not a cache: nothing survives the work settling, so a later caller can
  // never be handed something computed before the last publish.
  it('retains nothing once the work settles', async () => {
    const work = vi.fn(async () => 'page')

    await coalesce('city:peru|lima', work)
    expect(inFlightCount()).toBe(0)

    await coalesce('city:peru|lima', work)
    expect(work).toHaveBeenCalledTimes(2)
  })

  it('shares a failure with everyone waiting and then forgets it', async () => {
    const gate = deferred<string>()
    const work = vi.fn(() => gate.promise)

    const first = coalesce('k', work)
    const second = coalesce('k', work)
    gate.reject(new Error('db down'))

    await expect(first).rejects.toThrow('db down')
    await expect(second).rejects.toThrow('db down')
    expect(work).toHaveBeenCalledTimes(1)
    expect(inFlightCount()).toBe(0)
  })
})
