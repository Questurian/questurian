import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  payloadFind: vi.fn(),
}))

vi.mock('payload', () => ({
  getPayload: vi.fn().mockResolvedValue({
    find: mocks.payloadFind,
  }),
}))

vi.mock('@/payload.config', () => ({
  default: {},
}))

import { normalizeEmail } from '@/shared/lib/normalize-email'
import { isStaffEmail } from './staff-email-guard'

describe('staff email guard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.payloadFind.mockResolvedValue({ docs: [] })
  })

  it('normalizes email casing and whitespace', () => {
    expect(normalizeEmail('  Editor@Questurian.com  ')).toBe('editor@questurian.com')
    expect(normalizeEmail(null)).toBe('')
  })

  it('blocks the known staff domain without Payload lookup', async () => {
    await expect(isStaffEmail('Admin@Questurian.com')).resolves.toBe(true)
    expect(mocks.payloadFind).not.toHaveBeenCalled()
  })

  it('blocks custom-domain Staff identities via Payload Users lookup', async () => {
    mocks.payloadFind.mockResolvedValue({ docs: [{ id: 1, role: 'writer' }] })

    await expect(isStaffEmail('contractor@example.com')).resolves.toBe(true)

    expect(mocks.payloadFind).toHaveBeenCalledWith({
      collection: 'users',
      depth: 0,
      limit: 1,
      where: {
        and: [
          { email: { equals: 'contractor@example.com' } },
          { role: { in: ['admin', 'editor', 'writer'] } },
        ],
      },
    })
  })

  it('allows non-staff email addresses', async () => {
    await expect(isStaffEmail('visitor@example.com')).resolves.toBe(false)
  })
})
