import { describe, expect, it } from 'vitest'

import { getVisitorPasswordError } from './visitor-password-guard'

describe('visitor password guard', () => {
  it('accepts a strong password on sign-up', () => {
    expect(getVisitorPasswordError('/sign-up/email', { password: 'Str0ng!pass' })).toBeNull()
  })

  it('rejects a weak password on sign-up', () => {
    expect(getVisitorPasswordError('/sign-up/email', { password: 'password' })).toContain(
      'Password must contain'
    )
  })

  it.each(['/reset-password', '/change-password', '/set-password'])(
    'reads newPassword on %s',
    (path) => {
      expect(getVisitorPasswordError(path, { newPassword: 'weak' })).toContain(
        'Password must contain'
      )
      expect(getVisitorPasswordError(path, { newPassword: 'Str0ng!pass' })).toBeNull()
    }
  )

  it('never validates sign-in, so legacy weak passwords still work', () => {
    expect(getVisitorPasswordError('/sign-in/email', { password: 'weak' })).toBeNull()
  })

  it('ignores unrelated paths', () => {
    expect(getVisitorPasswordError('/change-email', { newEmail: 'a@b.com' } as never)).toBeNull()
    expect(getVisitorPasswordError('/sign-out', null)).toBeNull()
  })

  it('passes through requests that carry no password field', () => {
    expect(getVisitorPasswordError('/reset-password', { token: 'abc' } as never)).toBeNull()
    expect(getVisitorPasswordError('/sign-up/email', undefined)).toBeNull()
  })

  it('rejects a non-string password rather than accepting it', () => {
    expect(getVisitorPasswordError('/sign-up/email', { password: 12345678 })).toBe(
      'Password is required.'
    )
  })

  // Better Auth builds `setPassword` with `createAuthEndpoint({...})` and no
  // path string, so `endpoint.path` is undefined. The `hooks.before` middleware
  // does not then see `undefined`: better-call creates every middleware context
  // with `path: "/"` (`middleware.mjs:13`) and resolves
  // `context.path || path || "virtual:"` (`context.mjs:20`), so the guard is
  // asked about `"/"` — which matches nothing.
  //
  // `app/api/account/set-password/route.ts` runs the same strength rule itself
  // for exactly this reason. The `/set-password` entry below stays only in case
  // Better Auth ever gives the endpoint a real path.
  it('is asked about "/" for a pathless endpoint, which is why set-password is checked at its route', () => {
    expect(getVisitorPasswordError('/', { newPassword: 'weak' })).toBeNull()
  })
})

describe('visitor password guard reads the field each path sets', () => {
  // Reset, change and set send `newPassword`. The guard used to check
  // `password ?? newPassword`, so a strong decoy `password` hid a weak
  // `newPassword` (found by `pnpm readiness:auth`).
  it.each(['/reset-password', '/change-password', '/set-password'])('%s checks newPassword even beside a strong decoy', (path) => {
    expect(getVisitorPasswordError(path, { newPassword: 'weakpass', password: 'Decoy-Strong-2026!' })).not.toBeNull()
  })

  it('sign-up checks password even beside a strong decoy newPassword', () => {
    expect(getVisitorPasswordError('/sign-up/email', { password: 'weakpass', newPassword: 'Decoy-Strong-2026!' })).not.toBeNull()
  })

  it('a missing new password is left to Better Auth, as before', () => {
    expect(getVisitorPasswordError('/change-password', { currentPassword: 'x' } as never)).toBeNull()
  })
})
