import { APIError } from 'better-auth/api'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  rejectStaffEmail: vi.fn(),
  oauthState: vi.fn(),
}))

vi.mock('./visitor-staff-email-boundary', () => ({
  rejectStaffEmailForVisitorAuth: mocks.rejectStaffEmail,
}))

vi.mock('better-auth/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('better-auth/api')>()),
  getOAuthState: mocks.oauthState,
}))

import { googleProviderOptions, mapGoogleProfileToUser } from './google-provider'

async function refusal(profile: { email?: string; email_verified?: boolean }): Promise<APIError> {
  try {
    await mapGoogleProfileToUser(profile)
  } catch (error) {
    return error as APIError
  }
  throw new Error('expected a refusal')
}

describe('Google provider options', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.rejectStaffEmail.mockResolvedValue(undefined)
    mocks.oauthState.mockResolvedValue({ errorURL: 'https://www.questurian.com/auth-error' })
  })

  // The attack: hold a Google account for an address you never proved, sign
  // up with it, and wait. When the address's owner joins through "reset
  // password", Better Auth adds their password to *your* account and keeps
  // your Google link, so both of you sign in to it from then on. Unverified
  // claims used to pass through as `emailVerified: false` and create the
  // account (found by `pnpm readiness:oauth`).
  it.each([false, undefined])('refuses a Google address whose email_verified is %s', async (verified) => {
    const error = await refusal({ email: 'owner@example.com', email_verified: verified })

    expect(error).toBeInstanceOf(APIError)
    expect(error.statusCode).toBe(302)
    expect((error.headers as Record<string, string>).location).toBe(
      'https://www.questurian.com/auth-error?error=google_email_unverified',
    )
    expect(mocks.rejectStaffEmail).not.toHaveBeenCalled()
  })

  it('refuses plainly when the request carries no OAuth state', async () => {
    mocks.oauthState.mockRejectedValue(new Error('no request state'))

    const error = await refusal({ email: 'owner@example.com', email_verified: false })

    expect(error.statusCode).toBe(403)
  })

  it('accepts a verified address, normalised, and says it is verified', async () => {
    await expect(mapGoogleProfileToUser({ email: ' Reader@Example.COM ', email_verified: true })).resolves.toEqual({
      email: 'reader@example.com',
      emailVerified: true,
    })
    expect(mocks.rejectStaffEmail).toHaveBeenCalledWith({ path: '/callback/google', email: 'reader@example.com' })
  })

  it("sends a staff address to the error page's staff message instead of a JSON 403", async () => {
    mocks.rejectStaffEmail.mockRejectedValue(new APIError('FORBIDDEN', { message: 'Please use the staff login.' }))

    const error = await refusal({ email: 'editor@questurian.com', email_verified: true })

    expect(error.statusCode).toBe(302)
    expect((error.headers as Record<string, string>).location).toBe(
      'https://www.questurian.com/auth-error?error=admin_oauth_disabled',
    )
  })

  it('lets any other failure of the staff lookup through unchanged', async () => {
    const outage = new Error('database unavailable')
    mocks.rejectStaffEmail.mockRejectedValue(outage)

    await expect(mapGoogleProfileToUser({ email: 'reader@example.com', email_verified: true })).rejects.toBe(outage)
  })

  // The other hole: `POST /sign-in/social` with `idToken` signed in whoever
  // presented a Google id_token for this client — including one read out of
  // `visitor_auth_accounts."idToken"`, where the code flow stores them in
  // plain text. The site never uses that path.
  it('closes id-token sign-in', () => {
    const options = googleProviderOptions({ clientId: 'id', clientSecret: 'secret', backendUrl: 'https://api.questurian.com' })

    expect(options.disableIdTokenSignIn).toBe(true)
    expect(options.redirectURI).toBe('https://api.questurian.com/api/visitor-auth/callback/google')
    expect(options.mapProfileToUser).toBe(mapGoogleProfileToUser)
  })
})
