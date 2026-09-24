/**
 * An address as it may appear in stdout logs: first character and domain.
 * Logs reach the platform's log store and anyone reading a deploy log; the
 * full address stays in the email-logs collection, where staff look it up.
 */
export function maskEmail(address: string): string {
  const at = address.lastIndexOf('@')
  if (at < 1 || at === address.length - 1) return '***'
  return `${address[0]}***${address.slice(at)}`
}
