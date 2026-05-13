import crypto from 'crypto'

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
