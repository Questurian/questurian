import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useSerialTaskQueue } from './useSerialTaskQueue'

function createDeferred() {
  let resolvePromise!: () => void

  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve
  })

  return {
    promise,
    resolve: resolvePromise,
  }
}

describe('useSerialTaskQueue', () => {
  it('runs queued tasks in FIFO order', async () => {
    const firstTask = createDeferred()
    const secondTask = createDeferred()
    const events: string[] = []
    const { result } = renderHook(() => useSerialTaskQueue<string>())

    act(() => {
      result.current.enqueueTask({
        id: 'first',
        run: async () => {
          events.push('first:start')
          await firstTask.promise
          events.push('first:end')
        },
      })

      result.current.enqueueTask({
        id: 'second',
        run: async () => {
          events.push('second:start')
          await secondTask.promise
          events.push('second:end')
        },
      })
    })

    await waitFor(() => expect(result.current.activeTaskId).toBe('first'))
    expect(result.current.queuedTaskIds).toEqual(['second'])
    expect(events).toEqual(['first:start'])

    await act(async () => {
      firstTask.resolve()
      await Promise.resolve()
    })

    await waitFor(() => expect(events).toEqual(['first:start', 'first:end', 'second:start']))
    expect(result.current.activeTaskId).toBe('second')
    expect(result.current.queuedTaskIds).toEqual([])

    await act(async () => {
      secondTask.resolve()
      await Promise.resolve()
    })

    await waitFor(() => expect(result.current.activeTaskId).toBeNull())
    expect(result.current.queuedTaskIds).toEqual([])
    expect(events).toEqual(['first:start', 'first:end', 'second:start', 'second:end'])
  })
})
