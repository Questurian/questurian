import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  isStaffEmail: vi.fn(),
  audit: vi.fn(),
}))

vi.mock('./staff-email-guard', () => ({
  isStaffEmail: mocks.isStaffEmail,
}))

vi.mock('./security-audit', () => ({
  auditVisitorAuthSecurityEvent: mocks.audit,
}))

import { rejectStaffEmailForVisitorAuth } from './visitor-staff-email-boundary'

describe('Visitor auth Staff-email boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.isStaffEmail.mockResolvedValue(false)
  })

  it.each([
    '/sign-up/email',
    '/sign-in/social',
    '/link-social',
  ])('refuses a Staff email on %s', async (path) => {
    mocks.isStaffEmail.mockResolvedValue(true)

    await expect(
      rejectStaffEmailForVisitorAuth({
        path,
        body: { email: ' Staff@Example.com ' },
      }),
    ).rejects.toThrow('Please use the staff login.')

    expect(mocks.isStaffEmail).toHaveBeenCalledWith('staff@example.com')
    expect(mocks.audit).toHaveBeenCalledWith({
      type: 'visitor_auth_staff_email_blocked',
      email: 'staff@example.com',
      path,
    })
  })

  it('leaves email/password sign-in to BetterAuth credential verification', async () => {
    await expect(
      rejectStaffEmailForVisitorAuth({
        path: '/sign-in/email',
        body: { email: ' Staff@Example.com ' },
      }),
    ).resolves.toBeUndefined()

    expect(mocks.isStaffEmail).not.toHaveBeenCalled()
    expect(mocks.audit).not.toHaveBeenCalled()
  })

  it('guards the verified email returned by Google', async () => {
    mocks.isStaffEmail.mockResolvedValue(true)

    await expect(
      rejectStaffEmailForVisitorAuth({
        path: '/callback/google',
        email: ' Staff@Example.com ',
      }),
    ).rejects.toThrow('Please use the staff login.')

    expect(mocks.isStaffEmail).toHaveBeenCalledWith('staff@example.com')
  })

  it('checks the new email on Visitor email changes', async () => {
    mocks.isStaffEmail.mockResolvedValue(true)

    await expect(
      rejectStaffEmailForVisitorAuth({
        path: '/change-email',
        body: { newEmail: ' Staff@Example.com ' },
      }),
    ).rejects.toThrow('Please use the staff login.')

    expect(mocks.isStaffEmail).toHaveBeenCalledWith('staff@example.com')
  })

  it('leaves unrelated Visitor auth paths alone', async () => {
    await expect(
      rejectStaffEmailForVisitorAuth({
        path: '/request-password-reset',
        body: { email: 'staff@example.com' },
      }),
    ).resolves.toBeUndefined()

    expect(mocks.isStaffEmail).not.toHaveBeenCalled()
  })
})
