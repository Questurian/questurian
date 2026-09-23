export type MembershipSource = 'stripe' | null;

export type VisitorPrincipal = {
  kind: 'visitor';
  id: string;
  email: string;
  emailVerified: boolean;
  profileId: string | number | null;
  firstName: string;
  lastName: string;
  membership: {
    active: boolean;
    source: MembershipSource;
    status: string;
    /** End of the last period actually paid for. Not necessarily when access ends. */
    expiresAt: string | null;
    /** Bounded extension while Stripe retries a failed renewal; null otherwise. */
    graceUntil: string | null;
    cancelAtPeriodEnd: boolean;
  };
};

/** How the reader signs in (`/api/account/auth-methods`). Not part of `/api/me`. */
export type AuthMethods = {
  hasLocalPassword: boolean;
  hasGoogleOAuth: boolean;
  authProvider: 'local' | 'google' | 'dual' | 'unknown';
};

/**
 * Per ADR-0004 `/api/me` serves Visitor auth only; Payload Staff auth is ignored there, so a staff
 * principal never reaches this client.
 */
export type CurrentPrincipal = VisitorPrincipal;

export type CurrentPrincipalResponse = {
  authenticated: boolean;
  principal: CurrentPrincipal | null;
};

/**
 * Compatibility alias while client screens move from legacy User to CurrentPrincipal.
 */
type LegacyUserFields = {
  membershipStatusSummary?: string;
  subscriptionStatus?: string;
  subscriptionRenewsAt?: string | null;
  membershipExpiration?: string | null;
  dunningGraceUntil?: string | null;
  cancelAtPeriodEnd?: boolean;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
};

export type User = VisitorPrincipal & LegacyUserFields;
