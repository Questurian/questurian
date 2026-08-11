import { timingSafeEqual } from 'crypto'

import { APP_CONFIG } from '@/shared/config'

/**
 * Guards the one unauthenticated write path into the Users collection: creating
 * the very first staff account on an empty database.
 *
 * Without this, `create` access resolves to `true` for *anyone* while
 * `count() === 0`, and `firstUserPromotionHook` then forces `role: 'admin'`. On
 * a fresh deployment that leaves a window — between the database coming up and
 * the operator registering — in which the first request to reach the server
 * becomes the administrator.
 *
 * The token is presented as the `x-bootstrap-token` request header. A
 * `bootstrapToken` property on the create payload is accepted as a fallback for
 * callers that cannot set headers; it is never a stored field, so it is
 * discarded with the rest of the unknown payload keys.
 *
 * Environment behaviour, chosen to leave local development exactly as it was:
 *
 * - **Token set** (any environment): enforced. Setting it in development is the
 *   supported way to rehearse the real production bootstrap.
 * - **Token unset, production**: bootstrap is refused outright. Failing closed
 *   is the only safe default — an open window is precisely what this guards.
 * - **Token unset, development**: allowed, unchanged. A localhost database is
 *   not the asset being protected, and requiring a token here would add
 *   friction to every fresh checkout.
 *
 * Deliberately *not* wired into `assertProductionConfig`: the token is needed
 * only for the single bootstrap request, and demanding it on every production
 * boot would leave a standing admin-creation credential in the environment long
 * after it stopped being useful.
 */

export const BOOTSTRAP_TOKEN_HEADER = 'x-bootstrap-token'

const BOOTSTRAP_TOKEN_ENV_VAR = 'BOOTSTRAP_ADMIN_TOKEN'

type HeaderReader = { get?: (name: string) => string | null | undefined }

export type BootstrapAccessArgs = {
  req?: { headers?: HeaderReader | null } | null
  data?: Record<string, unknown> | null
}

function readConfiguredToken(): string {
  return process.env[BOOTSTRAP_TOKEN_ENV_VAR]?.trim() ?? ''
}

function readPresentedToken({ req, data }: BootstrapAccessArgs): string {
  const fromHeader = req?.headers?.get?.(BOOTSTRAP_TOKEN_HEADER)
  if (typeof fromHeader === 'string' && fromHeader.trim()) return fromHeader.trim()

  const fromData = data?.bootstrapToken
  if (typeof fromData === 'string' && fromData.trim()) return fromData.trim()

  return ''
}

/**
 * Constant-time comparison. Length is compared first and leaks, which is
 * standard and harmless here: knowing the token's length does not meaningfully
 * narrow the search for its value.
 */
function tokensMatch(presented: string, expected: string): boolean {
  const presentedBytes = Buffer.from(presented, 'utf8')
  const expectedBytes = Buffer.from(expected, 'utf8')

  if (presentedBytes.length !== expectedBytes.length) return false

  return timingSafeEqual(presentedBytes, expectedBytes)
}

/**
 * Whether an unauthenticated first-user create may proceed. Callers must have
 * already established that the collection is empty; this answers only the
 * "is the caller allowed to claim it" half.
 */
export function isBootstrapRequestAuthorized(args: BootstrapAccessArgs): boolean {
  const expected = readConfiguredToken()

  if (!expected) {
    if (!APP_CONFIG.isProduction) return true

    console.error(
      `Refusing unauthenticated first-user bootstrap: ${BOOTSTRAP_TOKEN_ENV_VAR} is not set. ` +
        `Set it to a random secret, create the first admin with an ` +
        `\`${BOOTSTRAP_TOKEN_HEADER}\` header carrying that value, then unset it.`
    )
    return false
  }

  const presented = readPresentedToken(args)
  if (!presented) return false

  return tokensMatch(presented, expected)
}
