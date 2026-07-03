export const REVALIDATION_TIMEOUT_MS = 5000

export function clientBaseUrl(): string | null {
  const value =
    process.env.QUESTURA_CLIENT_URL ||
    process.env.NEXT_PUBLIC_FRONTEND_URL ||
    process.env.FRONTEND_URL ||
    null

  return value ? value.replace(/\/+$/, '') : null
}

export function revalidationSecret(): string | null {
  return process.env.QUESTURA_REVALIDATION_SECRET || process.env.REVALIDATION_SECRET || null
}
