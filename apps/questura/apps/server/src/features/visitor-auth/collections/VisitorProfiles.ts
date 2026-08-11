import { staffUser } from '@/features/auth/lib/staff-user'
import type { CollectionConfig } from 'payload'

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
    delete: ({ req }) => Boolean(req.user && staffUser(req.user)?.role === 'admin'),
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
