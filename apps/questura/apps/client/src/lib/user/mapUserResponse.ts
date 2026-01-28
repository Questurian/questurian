/**
 * Maps user response from API to typed User object
 * Single source of truth for user object transformation
 */

import type { User } from "@/lib/user/types";

interface UserMeResponse {
  authenticated: boolean;
  user: User | null;
}

/**
 * Maps the /api/user/me response to a User object
 * Handles null/undefined values and provides defaults
 */
export function mapUserResponse(data: UserMeResponse): User | null {
  if (!data.authenticated || !data.user) {
    return null;
  }

  const user: User = {
    id: data.user.id,
    role: data.user.role,
    membershipStatusSummary: data.user.membershipStatusSummary,
    email: data.user.email,
    firstName: data.user.firstName,
    lastName: data.user.lastName,
    authProvider: data.user.authProvider,
    hasLocalPassword: data.user.hasLocalPassword,
    hasGoogleOAuth: data.user.hasGoogleOAuth,
    oauthId: data.user.oauthId,
    passwordSetAt: data.user.passwordSetAt,
    googleLinkedAt: data.user.googleLinkedAt,
    membershipStatusOverview: data.user.membershipStatusOverview,
    subscriptionStatus: data.user.subscriptionStatus,
    subscriptionRenewsAt: data.user.subscriptionRenewsAt,
    membershipExpiration: data.user.membershipExpiration,
    cancelAtPeriodEnd: data.user.cancelAtPeriodEnd,
    stripeCustomerId: data.user.stripeCustomerId,
    stripeSubscriptionId: data.user.stripeSubscriptionId,
    lastLogin: data.user.lastLogin,
    lastLoginMethod: data.user.lastLoginMethod,
    publicProfile: {
      avatar: data.user.publicProfile?.avatar ?? null,
      isPublic: data.user.publicProfile?.isPublic ?? false,
      displayName: data.user.publicProfile?.displayName ?? null,
      bio: data.user.publicProfile?.bio ?? null,
      expertise: data.user.publicProfile?.expertise ?? [],
      socialLinks: {
        instagram: data.user.publicProfile?.socialLinks?.instagram ?? null,
        twitter: data.user.publicProfile?.socialLinks?.twitter ?? null,
        website: data.user.publicProfile?.socialLinks?.website ?? null,
      },
    },
    updatedAt: data.user.updatedAt,
    createdAt: data.user.createdAt,
  };

  return user;
}
