import type { CollectionBeforeChangeHook } from 'payload'

/**
 * Auto-promote the first user created to admin role
 * Ensures there's always at least one admin in the system
 *
 * Also handles subscription status for staff roles:
 * - Admins: subscription_status = 'none' (no membership, backend-only)
 * - Editors: subscription_status = 'active' (permanent member, no Stripe)
 */
export const firstUserPromotionHook: CollectionBeforeChangeHook = async ({ data, req, originalDoc }) => {
  const userCount = await req.payload.count({
    collection: 'users',
    where: {}
  })

  if (userCount.totalDocs === 0) {
    data.role = 'admin'
    console.log('First user created - auto-promoted to admin')
  }

  // Auto-set subscription status for staff roles
  // If becoming an editor, set subscription to active
  if (data?.role === 'editor' && data.subscriptionStatus === 'none') {
    data.subscriptionStatus = 'active'
    console.log('Editor role assigned - auto-setting subscriptionStatus to active', {
      userId: originalDoc?.id,
      previousRole: originalDoc?.role,
      newRole: data.role
    })
  }

  return data
}
