# Collection API Report: `users`

- Source: `references/payload_api_report.md`
- Collection: `users`

### `users`

#### REST Endpoints

| Operation | Method | Endpoint |
| --- | --- | --- |
| `find` | `GET` | `https://example.com/api/users` |
| `findByID` | `GET` | `https://example.com/api/users/:id` |
| `count` | `GET` | `https://example.com/api/users/count` |
| `create` | `POST` | `https://example.com/api/users` |
| `update` | `PATCH` | `https://example.com/api/users/:id` |
| `delete` | `DELETE` | `https://example.com/api/users/:id` |

#### Fields

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `role` | `select` | Yes | - |
| `tab:Basic Info.email` | `email` | Yes | - |
| `tab:Basic Info.[row]` | `row` | No | - |
| `tab:Basic Info.firstName` | `text` | No | - |
| `tab:Basic Info.lastName` | `text` | No | - |
| `tab:Authentication.authProvider` | `select` | No | - |
| `tab:Authentication.[row]` | `row` | No | - |
| `tab:Authentication.hasLocalPassword` | `checkbox` | No | - |
| `tab:Authentication.hasGoogleOAuth` | `checkbox` | No | - |
| `tab:Authentication.oauthId` | `text` | No | - |
| `tab:Authentication.[row]` | `row` | No | - |
| `tab:Authentication.passwordSetAt` | `date` | No | - |
| `tab:Authentication.googleLinkedAt` | `date` | No | - |
| `tab:Authentication.tokenVersion` | `number` | Yes | - |
| `tab:Authentication.Password Change` | `collapsible` | No | - |
| `tab:Authentication.passwordChangeCode` | `text` | No | - |
| `tab:Authentication.passwordChangeExpires` | `date` | No | - |
| `tab:Authentication.Email Change` | `collapsible` | No | - |
| `tab:Authentication.emailChangeCode` | `text` | No | - |
| `tab:Authentication.emailChangeExpires` | `date` | No | - |
| `tab:Authentication.pendingEmail` | `email` | No | - |
| `tab:Authentication.Email Verification` | `collapsible` | No | - |
| `tab:Authentication.emailVerified` | `checkbox` | No | - |
| `tab:Authentication.emailVerificationCode` | `text` | No | - |
| `tab:Authentication.emailVerificationExpires` | `date` | No | - |
| `tab:Authentication.Password Reset` | `collapsible` | No | - |
| `tab:Authentication.passwordResetCode` | `text` | No | - |
| `tab:Authentication.passwordResetExpires` | `date` | No | - |
| `tab:Membership.subscriptionStatus` | `select` | No | - |
| `tab:Membership.Subscription Timing` | `collapsible` | No | - |
| `tab:Membership.[row]` | `row` | No | - |
| `tab:Membership.subscriptionRenewsAt` | `date` | No | - |
| `tab:Membership.membershipExpiration` | `date` | No | - |
| `tab:Membership.cancelAtPeriodEnd` | `checkbox` | No | - |
| `tab:Membership.Stripe Integration` | `collapsible` | No | - |
| `tab:Membership.[row]` | `row` | No | - |
| `tab:Membership.stripeCustomerId` | `text` | No | - |
| `tab:Membership.stripeSubscriptionId` | `text` | No | - |
| `tab:Membership.Affiliate Tracking (Referred User)` | `collapsible` | No | - |
| `tab:Membership.[row]` | `row` | No | - |
| `tab:Membership.affiliateReferralId` | `text` | No | - |
| `tab:Membership.affiliateReferredAt` | `date` | No | - |
| `tab:Activity.createdAt` | `date` | No | - |
| `tab:Activity.updatedAt` | `date` | No | - |
| `tab:Public Profile.publicProfile` | `group` | No | - |
| `tab:Public Profile.publicProfile.avatar` | `upload` | No | - |
| `tab:Public Profile.publicProfile.isPublic` | `checkbox` | No | - |
| `tab:Public Profile.publicProfile.displayName` | `text` | No | - |
| `tab:Public Profile.publicProfile.bio` | `textarea` | No | - |
| `tab:Public Profile.publicProfile.expertise` | `array` | No | - |
| `tab:Public Profile.publicProfile.expertise.area` | `text` | Yes | - |
| `tab:Public Profile.publicProfile.socialLinks` | `group` | No | - |
| `tab:Public Profile.publicProfile.socialLinks.instagram` | `text` | No | - |
| `tab:Public Profile.publicProfile.socialLinks.twitter` | `text` | No | - |
| `tab:Public Profile.publicProfile.socialLinks.website` | `text` | No | - |

#### Required Fields

- `role`
- `tab:Basic Info.email`
- `tab:Authentication.tokenVersion`
- `tab:Public Profile.publicProfile.expertise.area`

#### Relationship Fields

| Field | Type | hasMany | Targets |
| --- | --- | --- | --- |
| `tab:Public Profile.publicProfile.avatar` | `upload` | No | `media-assets` |

#### Block Definitions

- None

