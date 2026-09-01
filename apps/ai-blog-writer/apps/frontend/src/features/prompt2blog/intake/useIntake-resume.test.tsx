import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Whether a remembered run survives a failed read.
 *
 * On 2026-08-31 the operator left the page during a live research pass,
 * exactly as the screen invites -- "You can leave this page. The work carries
 * on." -- and came back to nothing. The run was fine and completed normally.
 * The resume read had timed out behind the blocking-routes bug, and the hook
 * treated any failure at all as proof the run no longer existed.
 *
 * Only a definitive 404 means gone.
 */

const readIntake = vi.fn()
vi.mock('./intake.api', () => ({
  readIntake: (...args: unknown[]) => readIntake(...args),
  openIntake: vi.fn(),
  answerQuestion: vi.fn(),
  reopenGrill: vi.fn(),
  approveBrief: vi.fn(),
  planResearch: vi.fn(),
  doResearch: vi.fn(),
  cutWorkOrder: vi.fn(),
  startWriting: vi.fn(),
  readArticle: vi.fn(),
  listRuns: vi.fn(),
}))

const { useIntake } = await import('./useIntake')

const RESUME_KEY = 'p2b.intake.runId'

function failWith(status: number | undefined): void {
  readIntake.mockRejectedValueOnce(
    status === undefined
      ? new TypeError('Failed to fetch')
      : Object.assign(new Error('nope'), { status }),
  )
}

beforeEach(() => {
  readIntake.mockReset()
  window.localStorage.clear()
  window.localStorage.setItem(RESUME_KEY, 'run-1')
})

async function mountAndSettle(): Promise<void> {
  renderHook(() => useIntake())
  await waitFor(() => expect(readIntake).toHaveBeenCalled())
}

describe('resuming a remembered run', () => {
  it('keeps the run when the read times out', async () => {
    failWith(504)

    await mountAndSettle()

    await waitFor(() =>
      expect(window.localStorage.getItem(RESUME_KEY)).toBe('run-1'),
    )
  })

  it('keeps the run when the request never reached the server', async () => {
    // A dev server restarting mid-read. `fetch` throws with no status at all,
    // which must not read as "the run is gone".
    failWith(undefined)

    await mountAndSettle()

    await waitFor(() =>
      expect(window.localStorage.getItem(RESUME_KEY)).toBe('run-1'),
    )
  })

  it('keeps the run when the server errors', async () => {
    failWith(500)

    await mountAndSettle()

    await waitFor(() =>
      expect(window.localStorage.getItem(RESUME_KEY)).toBe('run-1'),
    )
  })

  it('forgets the run only when the server says it does not exist', async () => {
    failWith(404)

    await mountAndSettle()

    await waitFor(() => expect(window.localStorage.getItem(RESUME_KEY)).toBeNull())
  })

  it('restores the run when the read succeeds', async () => {
    readIntake.mockResolvedValueOnce({ run_id: 'run-1', step: 'grill' })

    const { result } = renderHook(() => useIntake())

    await waitFor(() => expect(result.current.state?.run_id).toBe('run-1'))
    expect(window.localStorage.getItem(RESUME_KEY)).toBe('run-1')
  })
})

describe('opening an earlier run from the list', () => {
  it('remembers the run it opened', async () => {
    window.localStorage.removeItem(RESUME_KEY)
    const { result } = renderHook(() => useIntake())
    readIntake.mockResolvedValueOnce({ run_id: 'run-7', step: 'brief' })

    await act(async () => {
      await result.current.resume('run-7')
    })

    await waitFor(() => expect(result.current.state?.run_id).toBe('run-7'))
    expect(window.localStorage.getItem(RESUME_KEY)).toBe('run-7')
  })
})
