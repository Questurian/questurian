/**
 * Places Access Control
 * Access control utilities for places collections
 */

import { staffUser } from '@/features/auth/lib/staff-user'
import type { Access } from 'payload'

/**
 * Standard read access for places
 * Anonymous users see published only, authenticated users see all
 */
export const placesReadAccess: Access = ({ req }) => {
  if (!req.user) return { status: { equals: 'published' } }
  return Boolean(staffUser(req.user))
}

/**
 * Editor/Admin access for create and update
 */
export const placesWriteAccess: Access = ({ req }) => {
  const role = staffUser(req.user)?.role
  return role === 'editor' || role === 'admin'
}

/**
 * Admin-only access for delete
 */
export const placesDeleteAccess: Access = ({ req }) => {
  return staffUser(req.user)?.role === 'admin'
}
