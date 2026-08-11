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
 */
export const generateApiKeyHook: CollectionBeforeOperationHook = async ({ args, operation }) => {
  if (operation !== 'create' && operation !== 'update') return args

  const data = args.data as Record<string, unknown> | undefined
  if (!data) return args

  if (data.enableAPIKey === true && !data.apiKey) {
    data.apiKey = crypto.randomBytes(32).toString('hex')
  }

  return args
}
