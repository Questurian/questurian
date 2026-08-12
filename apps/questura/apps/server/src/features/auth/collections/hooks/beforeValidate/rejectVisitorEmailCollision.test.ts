import { beforeEach, describe, expect, it, vi } from 'vitest'

import { rejectVisitorEmailCollisionHook } from './rejectVisitorEmailCollision'

const query = vi.fn()

function run({
  data,
  operation = 'create',
  originalDoc,
}: {
  data: Record<string, unknown>
  operation?: 'create' | 'update'
  originalDoc?: Record<string, unknown>
}) {
  return rejectVisitorEmailCollisionHook({
    data,
    operation,
    originalDoc,
    req: {
      payload: {
        db: {
          pool: { query },
        },
      },
    },
  } as never)
}

describe('Staff and Visitor email boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    query.mockResolvedValue({ rows: [{ exists: false }] })
  })

  it('rejects Staff creation when normalized email belongs to a Visitor account', async () => {
    query.mockResolvedValue({ rows: [{ exists: true }] })

    await expect(
      run({ data: { email: '  Visitor@Example.com  ' } }),
    ).rejects.toThrow('This email already belongs to a Visitor account.')

    expect(query).toHaveBeenCalledWith(expect.stringContaining('visitor_auth_users'), [
      'visitor@example.com',
    ])
  })

  it('rejects Staff email changes that claim a Visitor email', async () => {
    query.mockResolvedValue({ rows: [{ exists: true }] })

    await expect(
      run({
        operation: 'update',
        originalDoc: { email: 'writer@questurian.com' },
        data: { email: 'visitor@example.com' },
      }),
    ).rejects.toThrow('This email already belongs to a Visitor account.')
  })

  it('allows a Staff email with no matching Visitor account', async () => {
    const data = { email: 'writer@questurian.com' }

    await expect(run({ data })).resolves.toBe(data)
  })

  it('skips an update whose normalized email did not change', async () => {
    const data = { email: ' Writer@Questurian.com ' }

    await expect(
      run({
        operation: 'update',
        originalDoc: { email: 'writer@questurian.com' },
        data,
      }),
    ).resolves.toBe(data)
    expect(query).not.toHaveBeenCalled()
  })

  it('skips updates that do not carry an email', async () => {
    const data = { firstName: 'Ada' }

    await expect(
      run({ operation: 'update', originalDoc: { email: 'ada@questurian.com' }, data }),
    ).resolves.toBe(data)
    expect(query).not.toHaveBeenCalled()
  })

  it('fails closed when Visitor ownership cannot be checked', async () => {
    query.mockRejectedValue(new Error('database unavailable'))

    await expect(run({ data: { email: 'writer@questurian.com' } })).rejects.toThrow(
      'Unable to verify Staff email ownership.',
    )
  })
})
