export type MembershipSource = 'stripe' | 'staff_grant' | null;

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

export type StaffPrincipal = {
  kind: 'staff';
  id: string | number;
  email: string;
  role: 'admin' | 'editor' | 'writer';
  membership: {
    active: boolean;
    source: MembershipSource;
  };
};

export type CurrentPrincipal = VisitorPrincipal | StaffPrincipal;

export type CurrentPrincipalResponse = {
  authenticated: boolean;
  principal: CurrentPrincipal | null;
};

/**
 * Compatibility alias while client screens move from legacy User to CurrentPrincipal.
 */
type LegacyUserFields = {
  role?: 'admin' | 'editor' | 'writer';
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

export type User = (VisitorPrincipal | StaffPrincipal) & LegacyUserFields;
