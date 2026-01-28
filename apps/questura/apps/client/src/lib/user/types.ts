/**
 * User type definitions
 */

export type User = {
  id: number;
  role: string;
  membershipStatusSummary: string;
  email: string;
  firstName: string;
  lastName: string;
  authProvider: "google" | "local" | string;
  hasLocalPassword: boolean;
  hasGoogleOAuth: boolean;
  oauthId: string | null;
  passwordSetAt: string | null;
  googleLinkedAt: string | null;
  membershipStatusOverview: string;
  subscriptionStatus: "active" | "inactive" | "canceled" | string;
  subscriptionRenewsAt: string | null;
  membershipExpiration: string | null;
  cancelAtPeriodEnd: boolean;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  lastLogin: string | null;
  lastLoginMethod: "google" | "local" | string;

  publicProfile: {
    avatar: string | null;
    isPublic: boolean;
    displayName: string | null;
    bio: string | null;
    expertise: string[];
    socialLinks: {
      instagram: string | null;
      twitter: string | null;
      website: string | null;
    };
  };

  updatedAt: string;
  createdAt: string;
};
