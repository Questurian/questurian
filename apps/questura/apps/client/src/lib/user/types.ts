export type MembershipSource = 'stripe' | null;

export type VisitorPrincipal = {
  kind: 'visitor';
  id: string;
  email: string;
  emailVerified: boolean;
  authProvider: 'local' | 'google' | 'dual' | 'unknown';
  hasLocalPassword: boolean;
  hasGoogleOAuth: boolean;
  profileId: string | number | null;
  firstName: string;
  lastName: string;
  membership: {
    active: boolean;
    source: MembershipSource;
    status: string;
    expiresAt: string | null;
    cancelAtPeriodEnd: boolean;
  };
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
  authProvider?: string;
  hasLocalPassword?: boolean;
  hasGoogleOAuth?: boolean;
  subscriptionStatus?: string;
  subscriptionRenewsAt?: string | null;
  membershipExpiration?: string | null;
  cancelAtPeriodEnd?: boolean;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
};

export type User = VisitorPrincipal & LegacyUserFields;
