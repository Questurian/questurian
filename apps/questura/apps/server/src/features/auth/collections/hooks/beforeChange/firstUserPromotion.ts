import type { CollectionBeforeChangeHook } from 'payload'

/**
 * Auto-promote the first user created to admin role
 * Ensures there's always at least one admin in the system
 */
export const firstUserPromotionHook: CollectionBeforeChangeHook = async ({ data, req }) => {
  const userCount = await req.payload.count({
    collection: 'users',
    where: {}
  })

  if (userCount.totalDocs === 0) {
    data.role = 'admin'
    console.log('First user created - auto-promoted to admin')
  }

  return data
}
