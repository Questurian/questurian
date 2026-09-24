import { APIError, getOAuthState } from 'better-auth/api'

import { normalizeEmail } from '@/shared/lib/normalize-email'
import { rejectStaffEmailForVisitorAuth } from './visitor-staff-email-boundary'

export type GoogleProfile = { email?: string; email_verified?: boolean }

/**
 * Send the reader to the flow's own error page with a code the client knows
 * (`AuthErrorPage`), rather than a bare JSON error on the API domain. The
 * error URL comes from the flow's stored state, which the origin check vetted
 * when the flow started.
 */
async function refuse(code: string, message: string): Promise<never> {
  let errorURL: string | undefined
  try {
    errorURL = (await getOAuthState())?.errorURL
  } catch {
    // No OAuth state on this request; fall through to a plain refusal.
  }
  if (errorURL) {
    const url = new URL(errorURL)
    url.searchParams.set('error', code)
    throw new APIError('FOUND', undefined, { location: url.toString() })
  }
  throw new APIError('FORBIDDEN', { message })
}

/**
 * Google's claims, as the visitor account sees them. Runs on every Google
 * sign-in and explicit link, after the code exchange and before Better Auth
 * looks anyone up.
 *
 * An address Google has not verified is refused outright. The readiness run
 * (`pnpm readiness:oauth`) found the hole this closes: someone holding a
 * Google account for an address they never proved could sign up with it; when
 * the address's real owner later tried to join, "reset password" handed them
 * that same account — Better Auth's reset adds a password to it and leaves
 * the Google link in place — and from then on both of them could sign in to
 * it, subscription and billing portal included. Refusing the unverified claim
 * at the door means no such account exists to inherit.
 */
export async function mapGoogleProfileToUser(profile: GoogleProfile): Promise<{ email: string; emailVerified: true }> {
  const email = normalizeEmail(profile.email)

  if (profile.email_verified !== true) {
    await refuse('google_email_unverified', 'Google has not verified this email address.')
  }

  try {
    await rejectStaffEmailForVisitorAuth({ path: '/callback/google', email })
  } catch (error) {
    if (error instanceof APIError && error.status === 'FORBIDDEN') {
      await refuse('admin_oauth_disabled', 'Please use the staff login.')
    }
    throw error
  }

  return { email, emailVerified: true }
}

export function googleProviderOptions(options: { clientId: string; clientSecret: string; backendUrl: string }) {
  return {
    clientId: options.clientId,
    clientSecret: options.clientSecret,
    redirectURI: `${options.backendUrl}/api/visitor-auth/callback/google`,
    // `POST /sign-in/social` also accepts a bare Google id_token and signs its
    // holder in, a path for One Tap and native apps that this site does not
    // use (the client only ever starts the redirect flow). It was open anyway,
    // and the code flow stores every id_token it receives in plain text in
    // `visitor_auth_accounts."idToken"` (`encryptOAuthTokens` covers access
    // and refresh tokens only). The readiness run showed one read from that
    // column signing in as its owner for the hour the token lives: a database
    // read became a session. Closed, since nothing here needs it open.
    disableIdTokenSignIn: true,
    mapProfileToUser: mapGoogleProfileToUser,
  }
}
