/**
 * Compile-time contract (launch harness D3): the server's declared response
 * types have exactly the keys the built server sends, at every level.
 *
 * Samples in `apps/questura/contracts/` come from the production build
 * (`pnpm readiness:contracts`); the client checks the same samples. This is
 * what would have caught `membership.graceUntil`: sent and read by the
 * client, never declared here. Nothing imports this file.
 */
import type authMethods from '../../../../../../contracts/api-account-auth-methods.json'
import type signedIn from '../../../../../../contracts/api-me.signed-in.json'
import type signedOut from '../../../../../../contracts/api-me.signed-out.json'
import type { VisitorAuthMethods } from './account-query'
import type { CurrentPrincipalResult } from './current-principal'

type Keys<T> = [T] extends [null]
  ? 'leaf'
  : T extends (infer U)[]
    ? Keys<U>[]
    : T extends object
      ? { [K in keyof T]-?: Keys<NonNullable<T[K]>> }
      : 'leaf'
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false

type SignedIn = Extract<CurrentPrincipalResult, { authenticated: true }>

export const signedInMatches: Same<Keys<typeof signedIn>, Keys<SignedIn>> = true
export const signedOutMatches: Same<Keys<typeof signedOut>, Keys<Extract<CurrentPrincipalResult, { authenticated: false }>>> = true
export const authMethodsMatch: Same<Keys<typeof authMethods>, Keys<VisitorAuthMethods>> = true
