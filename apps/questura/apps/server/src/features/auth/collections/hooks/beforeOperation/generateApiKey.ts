import crypto from 'crypto'
import type { CollectionBeforeOperationHook } from 'payload'

/**
 * Issues an API key whenever one is enabled without a value.
 *
 * Payload does not generate keys itself -- the admin panel has a button, and
 * everything else is expected to supply one. Left alone, creating a service
 * account programmatically produces a row with `enableAPIKey: true` and no
 * key: an account that looks provisioned and authenticates nothing.
 *
 * This runs in `beforeOperation` rather than `beforeValidate` because the
 * `apiKeyIndex` field hook derives the HMAC that lookups actually query from
 * `data.apiKey`, and field-level `beforeValidate` runs before the
 * collection-level one. A key written any later would never be findable.
 *
 * Since Payload 3.90 `apiKey` is write-only (no read access, no `reveal`
 * configured), so a key this hook generates cannot be read back by anyone.
 * A caller that needs to use the key supplies it, as the admin panel does;
 * this hook still keeps an enabled row from being keyless.
 *
 * Only on create. Since 3.90 the admin's Generate button PATCHes the key by
 * itself, and a later Save of the same form sends `enableAPIKey: true` with
 * no `apiKey`. Issuing a key on that update silently replaced the one the
 * operator had just copied with one nobody can read (moving day, 2026-09-26).
 * An update that wants a key supplies it.
 */
export const generateApiKeyHook: CollectionBeforeOperationHook = async ({ args, operation }) => {
  if (operation !== 'create') return args

  const data = args.data as Record<string, unknown> | undefined
  if (!data) return args

  if (data.enableAPIKey === true && !data.apiKey) {
    data.apiKey = crypto.randomBytes(32).toString('hex')
  }

  return args
}
