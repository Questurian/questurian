import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * What the operator is told when a step fails.
 *
 * The server answers a failure with an object -- a message written for a
 * person, plus the raw model reply. The shared error parser only reads a
 * string, so every one of those messages was replaced with a generic
 * fallback: the operator saw "That step could not be completed" while the
 * server was explaining exactly what went wrong.
 */

const apiFetch = vi.fn()
vi.mock('../../../shared/api/client/apiFetch', () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}))

const { answerQuestion, readIntake, listRuns } = await import('./intake.api')

function failWith(body: unknown, status = 502): void {
  apiFetch.mockResolvedValueOnce({
    ok: false,
    status,
    json: async () => body,
  })
}

beforeEach(() => apiFetch.mockReset())

describe('a failed intake step', () => {
  it('shows the message the server actually wrote', async () => {
    failWith({
      detail: {
        error: 'brief_incomplete',
        message: 'The brief came back missing who it is for.',
        raw: '{"primary_reader":""}',
      },
    })

    await expect(answerQuestion('run-1', 'hello')).rejects.toThrow(
      'The brief came back missing who it is for.',
    )
  })

  it('keeps the raw reply on the error without putting it in the message', async () => {
    failWith({
      detail: { error: 'grill_unusable_response', message: 'Try again.', raw: '{"done":false}' },
    })

    const error = await answerQuestion('run-1', 'hello').catch(caught => caught)

    expect(error.raw).toBe('{"done":false}')
    expect(error.message).not.toContain('done')
  })

  it('still reads a plain string detail', async () => {
    // Most of the app answers this way, and intake must not stop understanding it.
    failWith({ detail: 'No grill in progress for run r.' }, 404)

    await expect(answerQuestion('run-1', 'hello')).rejects.toThrow(
      'No grill in progress for run r.',
    )
  })

  it('falls back only when there is genuinely nothing to say', async () => {
    failWith({}, 500)

    await expect(answerQuestion('run-1', 'hello')).rejects.toThrow(
      'That step could not be completed.',
    )
  })
})

describe('telling "the run is gone" from "the read failed"', () => {
  /**
   * The resume read wiped the remembered run on *any* failure. On 2026-08-31
   * the operator left the page during a live research pass, exactly as the
   * screen invites, and came back to nothing -- the run had completed
   * normally and the read had merely timed out.
   *
   * The status is what tells those apart, so it has to survive on the error.
   */
  it('puts the status on the error so a 404 is distinguishable', async () => {
    failWith({ detail: 'No such run.' }, 404)

    await expect(readIntake('run-1')).rejects.toMatchObject({ status: 404 })
  })

  it('puts the status on a failure that says nothing useful', async () => {
    failWith(null, 504)

    await expect(readIntake('run-1')).rejects.toMatchObject({ status: 504 })
  })

  it('puts the status on an object-shaped failure too', async () => {
    failWith({ detail: { error: 'boom', message: 'It broke.' } }, 502)

    await expect(readIntake('run-1')).rejects.toMatchObject({ status: 502 })
  })
})

describe('listing the runs to go back to', () => {
  it('returns the runs the server sent', async () => {
    apiFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        runs: [{ run_id: 'run-1', seed: 'Lima is no longer a stopover' }],
      }),
    })

    await expect(listRuns()).resolves.toMatchObject([{ run_id: 'run-1' }])
  })

  it('answers with an empty list rather than undefined when there are none', async () => {
    apiFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) })

    await expect(listRuns()).resolves.toEqual([])
  })
})
