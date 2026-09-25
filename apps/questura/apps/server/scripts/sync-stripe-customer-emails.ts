/**
 * Stripe customer addresses ← account addresses (nightly reconcile, step
 * `emails`; the rule is in `src/features/payments/lib/reconcile-emails.ts`).
 *
 * Dry-run by default: prints what would change and writes nothing. `--apply`
 * writes, capped by `--max-apply N`. Never prints an email address.
 *
 * Usage:
 *   pnpm exec tsx scripts/sync-stripe-customer-emails.ts
 *   pnpm exec tsx scripts/sync-stripe-customer-emails.ts --apply --max-apply 25
 *
 * Also callable as `run(options)` by `scripts/nightly-stripe-reconcile.ts`.
 * In the readiness sandbox (`READINESS_SANDBOX=1`) it talks to the Stripe
 * stub, like the app (`getStripe`).
 */

import 'dotenv/config'
import { fileURLToPath } from 'node:url'

import { Pool } from 'pg'

import { getStripe } from '../src/features/payments/lib/stripe'
import { reconcileCustomerEmails, type EmailSyncDeps } from '../src/features/payments/lib/reconcile-emails'
import type { ReconcileStepResult } from '../src/features/payments/lib/reconcile-report'

export type SyncCustomerEmailsOptions = {
  apply?: boolean
  maxApply?: number | null
  onLine?: (line: string) => void
}

export async function run(options: SyncCustomerEmailsOptions = {}): Promise<ReconcileStepResult> {
  const databaseUri = process.env.DATABASE_URI
  if (!databaseUri) throw new Error('DATABASE_URI is required to read linked readers')
  const pool = new Pool({ connectionString: databaseUri, max: 2, application_name: 'questura-reconcile-emails' })
  const stripe = getStripe()

  const deps: EmailSyncDeps = {
    async linkedReaders() {
      const result = await pool.query<{ auth_user_id: string; stripe_customer_id: string; email: string }>(
        `SELECT p.auth_user_id, p.stripe_customer_id, u.email
           FROM visitor_profiles p
           JOIN visitor_auth_users u ON u.id::text = p.auth_user_id
          WHERE p.stripe_customer_id IS NOT NULL AND p.stripe_customer_id <> ''
          ORDER BY p.id`,
      )
      return result.rows.map((row) => ({
        authUserId: row.auth_user_id,
        stripeCustomerId: row.stripe_customer_id,
        email: row.email,
      }))
    },
    async customer(id) {
      try {
        const customer = await stripe.customers.retrieve(id)
        if ('deleted' in customer && customer.deleted) return { id, email: null, owner: null, deleted: true }
        return {
          id,
          email: customer.email ?? null,
          owner: customer.metadata?.visitorAuthUserId ?? null,
          deleted: false,
        }
      } catch (error) {
        if ((error as { code?: string }).code === 'resource_missing') return null
        throw error
      }
    },
    async currentEmail(authUserId) {
      const result = await pool.query<{ email: string }>(`SELECT email FROM visitor_auth_users WHERE id::text = $1`, [
        authUserId,
      ])
      return result.rows[0]?.email ?? null
    },
    async updateCustomerEmail(id, email) {
      await stripe.customers.update(id, { email })
    },
  }

  try {
    const result = await reconcileCustomerEmails(deps, {
      apply: options.apply ?? false,
      maxApply: options.maxApply ?? null,
    })
    for (const line of result.lines) options.onLine?.(line)
    return result
  } finally {
    await pool.end()
  }
}

function flag(name: string): number | null {
  const at = process.argv.indexOf(name)
  if (at === -1) return null
  const value = Number(process.argv[at + 1])
  return Number.isInteger(value) && value > 0 ? value : null
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run({
    apply: process.argv.includes('--apply'),
    maxApply: flag('--max-apply'),
    onLine: (line) => console.log(line),
  })
    .then((result) => {
      const counts = Object.entries(result.counts)
        .map(([key, value]) => `${key}=${value}`)
        .join(' ')
      console.log(`EMAILS ${result.reason ?? (result.ok ? 'ok' : 'failed')} ${counts}`)
      process.exit(result.ok ? 0 : 1)
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exit(1)
    })
}
