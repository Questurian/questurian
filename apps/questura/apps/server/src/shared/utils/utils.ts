import crypto from 'crypto'

// Shared utility functions
export function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString()
}

export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

/**
 * Generates a cryptographically secure random password for OAuth users
 * Uses Node.js crypto module for true randomness (not Math.random())
 * @param length - Number of random bytes to generate (default: 32 = 256 bits entropy)
 * @returns Secure random password with complexity suffix
 */
export function generateSecurePassword(length: number = 32): string {
  const randomBytes = crypto.randomBytes(length)
  return randomBytes.toString('hex') + 'Aa1!' // Add complexity suffix for validation
}

/**
 * Generates a cryptographically secure random ID
 * @param length - Number of random bytes to generate (default: 16 = 128 bits entropy)
 * @returns Secure random hex string
 */
export function generateSecureId(length: number = 16): string {
  return crypto.randomBytes(length).toString('hex')
}

/**
 * Generates a random ID using cryptographically secure method
 * @returns 24-character hex string with 96 bits of entropy
 */
export function generateId(): string {
  return generateSecureId(12) // 12 bytes = 24 hex characters
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}