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

/**
 * Development with no frontend running.
 *
 * Unconfigured delivery used to be treated as success: `deliverClientRevalidation`
 * returned without doing anything and the worker marked the job done. On a
 * laptop that is convenient. In a deployment that has simply lost its
 * `QUESTURA_CLIENT_URL` it means every publication is recorded as delivered
 * to a frontend that was never told, and the queue drains itself clean while
 * the public site goes stale — the one failure mode the outbox exists to
 * prevent, reached by a missing environment variable.
 *
 * So an unconfigured destination is now a failure, and the convenience needs
 * saying out loud. Set `REFRESH_DISCONNECTED=1` and the delivery is *skipped*,
 * not delivered: the caller is told, and production refuses to boot with it
 * set (`shared/config/assert-production-config.ts`).
 */
export function revalidationDisconnected(): boolean {
  return process.env.REFRESH_DISCONNECTED === '1' || process.env.REFRESH_DISCONNECTED === 'true'
}
