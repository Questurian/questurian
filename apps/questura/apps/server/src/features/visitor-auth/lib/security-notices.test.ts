import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  sendPasswordChangedEmail: vi.fn(),
  sendEmailChangedNotificationEmail: vi.fn(),
  sendGoogleAccountLinkedEmail: vi.fn(),
}))

vi.mock('@/features/emails', () => mocks)
vi.mock('payload', () => ({ getPayload: vi.fn() }))
vi.mock('@/payload.config', () => ({ default: {} }))

import { isGoogleLink, noticeEmailChanged, noticeGoogleLinked, noticePasswordChanged } from './security-notices'

const payload = { tag: 'payload' }
const loadPayload = vi.fn(async () => payload as never)

beforeEach(() => {
  vi.clearAllMocks()
  for (const send of Object.values(mocks)) send.mockResolvedValue({ success: true })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

/** Launch fix plan decision D4: the three security notices are sent. */
describe('email changed', () => {
  it('writes to the OLD address, naming both', async () => {
    await noticeEmailChanged(
      { previousEmail: 'Old@Example.com', user: { email: 'new@example.com', name: 'Ada Lovelace' } },
      loadPayload
    )

    expect(mocks.sendEmailChangedNotificationEmail).toHaveBeenCalledWith(payload, {
      oldEmail: 'old@example.com',
      newEmail: 'new@example.com',
      firstName: 'Ada',
      lastName: 'Lovelace',
    })
  })

  // afterEmailVerification also runs for the first verification after sign-up.
  it.each([
    ['the same address', 'reader@example.com'],
    ['the same address in another case', ' Reader@Example.com '],
    ['no previous address on record', null],
  ])('sends nothing for %s', async (_, previousEmail) => {
    await noticeEmailChanged({ previousEmail, user: { email: 'reader@example.com' } }, loadPayload)

    expect(mocks.sendEmailChangedNotificationEmail).not.toHaveBeenCalled()
  })

  it('never throws when the mail fails: the change already happened', async () => {
    mocks.sendEmailChangedNotificationEmail.mockRejectedValue(new Error('resend down'))

    await expect(
      noticeEmailChanged({ previousEmail: 'old@example.com', user: { email: 'new@example.com' } }, loadPayload)
    ).resolves.toBeUndefined()
    expect(console.error).toHaveBeenCalled()
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('old@example.com')
  })
})

describe('password changed', () => {
  it('writes to the account address', async () => {
    await noticePasswordChanged({ email: 'reader@example.com', name: 'Ada' }, loadPayload)

    expect(mocks.sendPasswordChangedEmail).toHaveBeenCalledWith(payload, {
      email: 'reader@example.com',
      firstName: 'Ada',
      lastName: '',
    })
  })

  it('swallows a failed send', async () => {
    mocks.sendPasswordChangedEmail.mockResolvedValue({ success: false, error: 'rejected' })

    await expect(noticePasswordChanged({ email: 'reader@example.com' }, loadPayload)).resolves.toBeUndefined()
  })
})

describe('google linked', () => {
  it('writes to the account address', async () => {
    await noticeGoogleLinked({ email: 'reader@example.com', name: null }, loadPayload)

    expect(mocks.sendGoogleAccountLinkedEmail).toHaveBeenCalledWith(payload, {
      email: 'reader@example.com',
      firstName: '',
      lastName: '',
    })
  })

  it.each([
    ['a Google row added to a password account', { id: 'g', providerId: 'google' }, [{ id: 'c', providerId: 'credential' }, { id: 'g', providerId: 'google' }], true],
    ['a Google sign-up (the only way in)', { id: 'g', providerId: 'google' }, [{ id: 'g', providerId: 'google' }], false],
    ['a Google sign-up read before the row is visible', { id: 'g', providerId: 'google' }, [], false],
    ['a password account being created', { id: 'c', providerId: 'credential' }, [{ id: 'c', providerId: 'credential' }], false],
  ])('%s: link = %s', (_, account, accounts, expected) => {
    expect(isGoogleLink(account, accounts)).toBe(expected)
  })
})
