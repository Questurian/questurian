import { isAdminFieldLevel } from '@/features/auth/collections/access'
import { staffUser } from '@/features/auth/lib/staff-user'
import type { CollectionConfig } from 'payload'
import { logMembershipFieldEdits } from './hooks/logMembershipFieldEdits'
import { preventVisitorProfileDelete } from './hooks/preventDelete'

/**
 * Membership and billing linkage are admin-only, field by field.
 *
 * Collection `update` is deliberately wider than that: editors work profiles
 * for support (a mistyped address, a name), and losing that would push every
 * correction onto an admin. But entitlement is nothing more than a future
 * `paidThroughAt`, so a plain date field on this collection *is* the paywall —
 * an editor who can write it can hand themselves, or anyone, a free
 * membership, and one who can clear `stripeCustomerId` can strand a paying
 * visitor's subscription with no way back to their profile.
 *
 * Field access is the right seam rather than narrowing the collection: it
 * refuses the write at the API as well as greying the input out in the admin
 * panel, and it is bypassed by trusted Local API calls — so Stripe resync,
 * checkout and the nightly reconciler, which all write through the Local API
 * with `overrideAccess`, are unaffected. Stripe stays the only thing that
 * grants access; an admin doing it by hand stays possible and is logged.
 */
const membershipFieldAccess = { update: isAdminFieldLevel } as const

export const VisitorProfiles: CollectionConfig = {
  slug: 'visitor-profiles',
  labels: {
    singular: 'Visitor Profile',
    plural: 'Visitor Profiles',
  },
  admin: {
    useAsTitle: 'email',
    defaultColumns: ['email', 'subscriptionStatus', 'stripeCustomerId', 'updatedAt'],
    group: 'Core',
    description: 'Public-site profile, membership, and Stripe linkage for BetterAuth visitors.',
  },
  access: {
    read: ({ req }) => {
      const role = staffUser(req.user)?.role
      return Boolean(req.user && (role === 'admin' || role === 'editor'))
    },
    create: ({ req }) => Boolean(req.user && staffUser(req.user)?.role === 'admin'),
    update: ({ req }) => {
      const role = staffUser(req.user)?.role
      return Boolean(req.user && (role === 'admin' || role === 'editor'))
    },
    // A profile carries membership and Stripe linkage. It cannot be deleted
    // independently from its BetterAuth Visitor account without silently
    // losing that state on the next session-driven profile recreation.
    delete: () => false,
  },
  hooks: {
    // Access control is bypassable by trusted Local API calls. Preserve the
    // invariant there too; future erasure must be one coordinated workflow.
    beforeDelete: [preventVisitorProfileDelete],
    // The collection keeps no history, so a hand-granted membership would
    // otherwise be indistinguishable from one Stripe paid for.
    afterChange: [logMembershipFieldEdits],
  },
  fields: [
    {
      name: 'authUserId',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      // The key every membership lookup runs through. `readOnly` only greys
      // the input out; without field access an editor could repoint a profile
      // at another visitor's auth user over the API.
      access: membershipFieldAccess,
      admin: {
        readOnly: true,
        description: 'BetterAuth user ID for this Visitor account.',
      },
    },
    {
      name: 'email',
      type: 'email',
      required: true,
      index: true,
      admin: {
        description: 'Mirrored from BetterAuth for admin search and support workflows.',
      },
    },
    {
      name: 'billingEmail',
      type: 'email',
      index: true,
      access: membershipFieldAccess,
      admin: {
        readOnly: true,
        description:
          'Email Stripe collected at checkout, recorded only when it differs from the account email. Checkout does not require a verified address, so this is the fallback contact when the signup address was mistyped.',
      },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'firstName',
          type: 'text',
        },
        {
          name: 'lastName',
          type: 'text',
        },
      ],
    },
    {
      name: 'subscriptionStatus',
      type: 'select',
      required: true,
      defaultValue: 'none',
      options: [
        { label: 'No Subscription', value: 'none' },
        { label: 'Active', value: 'active' },
        { label: 'Cancelled', value: 'cancelled' },
        { label: 'Past Due', value: 'past_due' },
      ],
      access: membershipFieldAccess,
      admin: {
        description: 'Visitor membership status from Stripe.',
      },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'paidThroughAt',
          type: 'date',
          // The paywall itself: access is `isFuture(paidThroughAt)` and
          // nothing else.
          access: membershipFieldAccess,
          admin: {
            description:
              'End of the last billing period actually paid for. Never advances on an unpaid period, so it is not the same as Stripe current_period_end, which moves at renewal before the charge clears.',
          },
        },
        {
          name: 'dunningGraceUntil',
          type: 'date',
          access: membershipFieldAccess,
          admin: {
            description:
              'Bounded extension of access while Stripe retries a failed renewal. Set when the subscription enters past_due, cleared on recovery.',
          },
        },
      ],
    },
    {
      name: 'cancelAtPeriodEnd',
      type: 'checkbox',
      defaultValue: false,
      access: membershipFieldAccess,
      admin: {
        description: 'Whether the subscription stops at the paid-through date instead of renewing.',
      },
    },
    {
      type: 'collapsible',
      label: 'Stripe Linkage',
      admin: {
        initCollapsed: true,
      },
      fields: [
        {
          type: 'row',
          fields: [
            {
              // One customer, one profile. Subscription webhooks resolve a
              // profile from the customer id alone, so a second profile holding
              // the same id makes that lookup a coin toss: someone else's
              // payment could grant, or revoke, this visitor's membership.
              // The database is the only place that can refuse the second row.
              name: 'stripeCustomerId',
              type: 'text',
              index: true,
              unique: true,
              access: membershipFieldAccess,
            },
            {
              name: 'stripeSubscriptionId',
              type: 'text',
              access: membershipFieldAccess,
            },
          ],
        },
      ],
    },
    {
      type: 'collapsible',
      label: 'Affiliate Referral',
      admin: {
        initCollapsed: true,
      },
      fields: [
        {
          type: 'row',
          fields: [
            {
              // Referral attribution decides who gets paid for this member,
              // so it is money the same way the fields above are.
              name: 'affiliateReferralId',
              type: 'text',
              access: membershipFieldAccess,
            },
            {
              name: 'affiliateReferredAt',
              type: 'date',
              access: membershipFieldAccess,
            },
          ],
        },
      ],
    },
  ],
}
