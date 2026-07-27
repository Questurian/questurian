/* @vitest-environment jsdom */

import { StrictMode } from 'react'
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useTerminalPipelineRun } from './useTerminalPipelineRun'

type TestStatus = { state: string; stage?: string }

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(res => { resolve = res })
  return { promise, resolve }
}

describe('useTerminalPipelineRun', () => {
  it('runs the terminal handler once when the run reaches a terminal state', async () => {
    const onTerminal = vi.fn().mockResolvedValue(undefined)
    const status: TestStatus = { state: 'completed' }

    renderHook(() => useTerminalPipelineRun({ runId: 'run-1', status, onTerminal }))

    expect(onTerminal).toHaveBeenCalledTimes(1)
    expect(onTerminal.mock.calls[0][0].state).toBe('completed')
  })

  it('does not cancel an in-flight handler when the component re-renders', async () => {
    const gate = deferred<void>()
    const cancelledAfterAwait = vi.fn()

    const onTerminal = vi.fn(async ({ isCancelled }: { isCancelled: () => boolean }) => {
      await gate.promise
      cancelledAfterAwait(isCancelled())
    })

    const status: TestStatus = { state: 'completed' }
    const { rerender } = renderHook(
      () => useTerminalPipelineRun({ runId: 'run-1', status, onTerminal }),
    )

    // A sibling state update (log append, status label) re-renders while the
    // handler is still awaiting its artifact fetch.
    rerender()
    rerender()

    await act(async () => {
      gate.resolve()
      await gate.promise
    })

    expect(onTerminal).toHaveBeenCalledTimes(1)
    expect(cancelledAfterAwait).toHaveBeenCalledWith(false)
  })

  it('cancels the in-flight handler when the run id changes', async () => {
    const gate = deferred<void>()
    const cancelledAfterAwait = vi.fn()

    const onTerminal = vi.fn(async ({ isCancelled }: { isCancelled: () => boolean }) => {
      await gate.promise
      cancelledAfterAwait(isCancelled())
    })

    const status: TestStatus = { state: 'completed' }
    const { rerender } = renderHook(
      ({ runId }: { runId: string }) =>
        useTerminalPipelineRun({ runId, status, onTerminal }),
      { initialProps: { runId: 'run-1' } },
    )

    rerender({ runId: 'run-2' })

    await act(async () => {
      gate.resolve()
      await gate.promise
    })

    expect(cancelledAfterAwait).toHaveBeenCalledWith(true)
  })

  it('cancels the in-flight handler on unmount', async () => {
    const gate = deferred<void>()
    const cancelledAfterAwait = vi.fn()

    const onTerminal = vi.fn(async ({ isCancelled }: { isCancelled: () => boolean }) => {
      await gate.promise
      cancelledAfterAwait(isCancelled())
    })

    const status: TestStatus = { state: 'completed' }
    const { unmount } = renderHook(
      () => useTerminalPipelineRun({ runId: 'run-1', status, onTerminal }),
    )

    unmount()

    await act(async () => {
      gate.resolve()
      await gate.promise
    })

    expect(cancelledAfterAwait).toHaveBeenCalledWith(true)
  })

  it('completes a handler under StrictMode double-invoked effects', async () => {
    const gate = deferred<void>()
    const cancelledAfterAwait = vi.fn()

    const onTerminal = vi.fn(async ({ isCancelled }: { isCancelled: () => boolean }) => {
      await gate.promise
      cancelledAfterAwait(isCancelled())
    })

    const status: TestStatus = { state: 'completed' }
    renderHook(
      () => useTerminalPipelineRun({ runId: 'run-1', status, onTerminal }),
      { wrapper: StrictMode },
    )

    await act(async () => {
      gate.resolve()
      await gate.promise
    })

    // The remount cancels the first attempt, but a live attempt must survive.
    expect(cancelledAfterAwait).toHaveBeenCalledWith(false)
  })

  it('re-runs the handler after resetKey changes', async () => {
    const onTerminal = vi.fn().mockResolvedValue(undefined)
    const status: TestStatus = { state: 'completed' }

    const { rerender } = renderHook(
      ({ resetKey }: { resetKey: number }) =>
        useTerminalPipelineRun({ runId: 'run-1', status, resetKey, onTerminal }),
      { initialProps: { resetKey: 0 } },
    )

    expect(onTerminal).toHaveBeenCalledTimes(1)
    rerender({ resetKey: 1 })
    expect(onTerminal).toHaveBeenCalledTimes(2)
  })
})
