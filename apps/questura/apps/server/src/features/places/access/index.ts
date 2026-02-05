/**
 * Places Access Control
 * Access control utilities for places collections
 */

import type { Access } from 'payload'

/**
 * Standard read access for places
 * Anonymous users see published only, authenticated users see all
 */
export const placesReadAccess: Access = ({ req }) => {
  if (!req.user) return { status: { equals: 'published' } }
  return true
}

/**
 * Editor/Admin access for create and update
 */
export const placesWriteAccess: Access = ({ req }) => {
  return req.user?.role === 'editor' || req.user?.role === 'admin'
}

/**
 * Admin-only access for delete
 */
export const placesDeleteAccess: Access = ({ req }) => {
  return req.user?.role === 'admin'
}
