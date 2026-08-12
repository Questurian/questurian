export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4003'

/**
 * Shared key sent to the backend as `X-API-Key`, matching its `ABW_API_KEY`.
 *
 * This is NOT a secret. Vite inlines it into the bundle, so anyone who loads
 * the app can read it. It is a coarse gate that keeps non-browser callers out
 * of an otherwise fully open API — it does not identify a user and grants no
 * per-user authority. Anything that depends on *who* is calling must be
 * checked server-side against the Payload staff session instead.
 *
 * Read at call time rather than captured at module load so the value can be
 * stubbed in tests.
 */
export function abwApiKey(): string {
  return import.meta.env.VITE_ABW_API_KEY?.trim() || ''
}
export const CONVERTER_URL = import.meta.env.VITE_CONVERTER_URL || 'http://localhost:4010'
export const PAYLOAD_API_URL = import.meta.env.VITE_PAYLOAD_API_URL || 'http://localhost:4000'
