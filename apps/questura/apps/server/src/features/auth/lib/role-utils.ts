import { User } from '@/payload-types'

/**
 * Centralized role checking utilities
 * Provides consistent role validation across the application
 */

export const hasRole = (user: User | undefined, role: string): boolean => {
  return user?.role === role
}

export const isAdmin = (user: User | undefined): boolean => {
  return hasRole(user, 'admin')
}

export const isAdminOrEditor = (user: User | undefined): boolean => {
  return isAdmin(user) || hasRole(user, 'editor')
}