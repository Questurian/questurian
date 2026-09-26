/**
 * Compile-time contract (launch harness D3): the client's response types
 * have exactly the keys the built server sends, at every level.
 *
 * The samples in `apps/questura/contracts/` are captured from the production
 * build by `pnpm readiness:contracts`. A key the server sends that this type
 * lacks, or one this type expects that the server never sends, fails
 * `pnpm typecheck` here. Nothing imports this file; it only has to compile.
 */
import type { MembershipPlansResponse } from '@/features/Payments/lib/planPresentation';
import type { AuthMethods, CurrentPrincipalResponse } from '@/lib/user/types';

import type authMethods from '../../../../../contracts/api-account-auth-methods.json';
import type plans from '../../../../../contracts/api-payments-plans.json';
import type signedIn from '../../../../../contracts/api-me.signed-in.json';
import type signedOut from '../../../../../contracts/api-me.signed-out.json';

/** Keys at every level; leaf types and nullability are left to the samples' owners. */
type Keys<T> = [T] extends [null] ? 'leaf'
  : T extends (infer U)[] ? Keys<U>[]
  : T extends object ? { [K in keyof T]-?: Keys<NonNullable<T[K]>> }
  : 'leaf';
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

export const signedInMatches: Same<Keys<typeof signedIn>, Keys<CurrentPrincipalResponse>> = true;
export const signedOutMatches: Same<Keys<typeof signedOut>['authenticated'], Keys<CurrentPrincipalResponse>['authenticated']> = true;
export const authMethodsMatch: Same<Keys<typeof authMethods>, Keys<AuthMethods>> = true;
export const plansMatch: Same<Keys<typeof plans>, Keys<MembershipPlansResponse>> = true;
