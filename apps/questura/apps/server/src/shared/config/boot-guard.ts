import { collectProductionConfigProblems } from './assert-production-config'

type Exit = (code: number) => never
type Log = (message: string, meta: Record<string, unknown>) => void

/**
 * Stop a production process whose configuration is invalid, before it serves.
 *
 * `assertProductionConfig` runs in Payload's `onInit` and throws — but the
 * instrumentation hook that first initialises Payload caught that throw,
 * logged "Database connection failed" and carried on, and the process served
 * traffic regardless. Observed on a local production build (2026-09-21): the
 * log said "Refusing to boot" and `/api/public/locations/menu` answered 200.
 * Every boot-required setting — `TRUSTED_PROXY`, the cookie domain, the
 * connection budget — was advisory.
 *
 * This runs first in `register()`, outside that catch, and exits. A platform
 * then sees a failed start instead of a healthy-looking instance with a
 * wrong configuration. Returns normally when there is nothing to refuse
 * (always, outside production).
 */
export function refuseBootOnInvalidConfig(
  exit: Exit = (code) => process.exit(code),
  log: Log = (message, meta) => console.error(JSON.stringify({ level: 'error', message, ...meta })),
): void {
  const problems = collectProductionConfigProblems()
  if (problems.length === 0) return

  log('Refusing to boot with an invalid production configuration', { problems })
  exit(1)
}
