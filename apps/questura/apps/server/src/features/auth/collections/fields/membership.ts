import type { Field } from 'payload'
import { isAdminFieldLevel } from '../access/fieldLevel'
import { getAuthenticatedUser } from '../../lib/get-authenticated-user'
import { visibilityRules } from './fieldVisibility'

export const membershipFields: Field[] = [
  {
    name: 'subscriptionStatus',
    type: 'select',
    options: [
      { label: 'No Subscription', value: 'none' },
      { label: 'Active', value: 'active' },
      { label: 'Cancelled', value: 'cancelled' },
      { label: 'Past Due', value: 'past_due' },
    ],
    defaultValue: 'none',
    admin: {
      readOnly: true, // Default read-only, hooks allow edit when appropriate
      description: 'Current subscription status from Stripe. For users: shows subscription status. For editors: shows "active" (permanent staff)',
      condition: visibilityRules.subscriptionStatus,
    },
    hooks: {
      beforeChange: [
        ({ data, originalDoc }) => {
          // For staff members, always lock the value
          if (originalDoc?.role === 'admin' || originalDoc?.role === 'editor') {
            console.log('Preventing subscriptionStatus change for staff member:', {
              userId: originalDoc.id,
              email: originalDoc.email,
              role: originalDoc.role,
              attemptedValue: data?.subscriptionStatus
            })
            return originalDoc.subscriptionStatus || 'active'
          }

          // For regular users, allow edit only if:
          // 1. Creating new record (no ID) AND
          // 2. Current value is 'none' (unset) AND
          // 3. User is changing it
          const isNewRecord = !originalDoc?.id
          const isUnset = originalDoc?.subscriptionStatus === 'none'

          // If trying to create with specific status, allow (one-time setup)
          if (isNewRecord && isUnset) {
            return data?.subscriptionStatus
          }

          // Once set, only allow webhooks to update (from system context)
          // Return original value to prevent manual edits
          if (originalDoc?.subscriptionStatus && originalDoc.subscriptionStatus !== 'none') {
            return originalDoc.subscriptionStatus
          }

          return data?.subscriptionStatus
        }
      ]
    }
  },
  {
    type: 'collapsible',
    label: 'Subscription Timing',
    admin: {
      initCollapsed: false,
      condition: (data) => data?.role === 'user',
    },
    fields: [
      {
        type: 'row',
        fields: [
          {
            name: 'subscriptionRenewsAt',
            type: 'date',
            admin: {
              readOnly: true,
              description: 'Next billing date for active subscriptions (when customer will be charged next)',
              condition: (data) => data?.subscriptionStatus === 'active' && !data?.cancelAtPeriodEnd,
            },
          },
          {
            name: 'membershipExpiration',
            type: 'date',
            saveToJWT: true,
            access: {
              create: isAdminFieldLevel,
              update: ({ req }) => {
                const user = getAuthenticatedUser(req)
                if (user?.role === 'admin') return true
                if (!user) return true
                return false
              },
            },
            admin: {
              description: 'When membership access actually ends (for cancelled subscriptions with remaining paid time)',
              condition: (data) => {
                // Hide for admins/editors
                if (data?.role === 'admin' || data?.role === 'editor') return false

                // Show for users when relevant
                return data?.role === 'user' && (
                  data?.cancelAtPeriodEnd ||
                  data?.subscriptionStatus === 'cancelled' ||
                  data?.subscriptionStatus === 'none' ||
                  data?.membershipExpiration
                )
              },
            },
            hooks: {
              beforeChange: [
                ({ value, originalDoc }) => {
                  if (originalDoc?.role === 'admin' || originalDoc?.role === 'editor') {
                    console.log('Preventing membershipExpiration change for staff member:', {
                      userId: originalDoc.id,
                      email: originalDoc.email,
                      role: originalDoc.role,
                      attemptedValue: value
                    })
                    return null
                  }

                  if (value) {
                    const now = new Date()
                    const expiration = new Date(value)
                    if (expiration <= now) {
                      throw new Error('Membership expiration date must be in the future')
                    }
                  }
                  return value
                },
              ],
            },
          },
        ],
      },
      {
        name: 'cancelAtPeriodEnd',
        type: 'checkbox',
        admin: {
          readOnly: true,
          description: 'Subscription is cancelled but active until period end. Always false for staff (permanent access)',
          condition: (data) => data?.subscriptionStatus === 'active',
        },
        hooks: {
          beforeChange: [
            ({ value, originalDoc }) => {
              if (originalDoc?.role === 'admin' || originalDoc?.role === 'editor') {
                if (value === true) {
                  console.log('Preventing cancelAtPeriodEnd change for staff member:', {
                    userId: originalDoc.id,
                    email: originalDoc.email,
                    role: originalDoc.role
                  })
                }
                return false
              }
              return value
            }
          ]
        }
      },
    ],
  },
  {
    type: 'collapsible',
    label: 'Stripe Integration',
    admin: {
      initCollapsed: true,
      condition: (data) => data?.role === 'user' && data?.stripeCustomerId,
    },
    fields: [
      {
        type: 'row',
        fields: [
          {
            name: 'stripeCustomerId',
            type: 'text',
            admin: {
              readOnly: true,
              description: 'Stripe customer ID',
            },
          },
          {
            name: 'stripeSubscriptionId',
            type: 'text',
            admin: {
              readOnly: true,
              description: 'Active subscription ID',
            },
          },
        ],
      },
    ],
  },
  {
    type: 'collapsible',
    label: 'Affiliate Tracking (Referred User)',
    admin: {
      initCollapsed: true,
      condition: (data) => data?.role === 'user' && data?.affiliateReferralId,
    },
    fields: [
      {
        type: 'row',
        fields: [
          {
            name: 'affiliateReferralId',
            type: 'text',
            admin: {
              readOnly: true,
              description: 'Endorsely referral ID if user came via affiliate link',
            },
          },
          {
            name: 'affiliateReferredAt',
            type: 'date',
            admin: {
              readOnly: true,
              description: 'When user was referred (subscription created via affiliate)',
            },
          },
        ],
      },
    ],
  },
]
