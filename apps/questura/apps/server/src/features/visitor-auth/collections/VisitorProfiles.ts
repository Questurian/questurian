import { staffUser } from '@/features/auth/lib/staff-user'
import type { CollectionConfig } from 'payload'
import { preventVisitorProfileDelete } from './hooks/preventDelete'

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
  },
  fields: [
    {
      name: 'authUserId',
      type: 'text',
      required: true,
      unique: true,
      index: true,
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
      admin: {
        description: 'Visitor membership status from Stripe.',
      },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'subscriptionRenewsAt',
          type: 'date',
        },
        {
          name: 'membershipExpiration',
          type: 'date',
          admin: {
            description: 'When paid access ends for a cancelled subscription with remaining paid time.',
          },
        },
        {
          name: 'cancelAtPeriodEnd',
          type: 'checkbox',
          defaultValue: false,
        },
      ],
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
              name: 'stripeCustomerId',
              type: 'text',
              index: true,
            },
            {
              name: 'stripeSubscriptionId',
              type: 'text',
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
              name: 'affiliateReferralId',
              type: 'text',
            },
            {
              name: 'affiliateReferredAt',
              type: 'date',
            },
          ],
        },
      ],
    },
  ],
}
