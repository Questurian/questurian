/**
 * Delete a reader's account on request (launch fix plan, decision D2: by
 * email at launch, within 30 days). The whole procedure, with the Stripe half
 * that is done in the Dashboard first: docs/procedures/account-deletion.md.
 *
 * Dry run by default: prints what would go and changes nothing. `--apply`
 * does it, in this order:
 *
 *  1. every session of the reader ends, in Redis and Postgres, and the other
 *     devices' cookie copies stop being trusted within a second
 *     (`session-revocations.ts`);
 *  2. bookmarks and outstanding reset / verification tokens are deleted, and
 *     the profile is deleted (or, while it still names a Stripe customer,
 *     emptied of name and address and kept, so a late Stripe event or a
 *     dispute still finds the billing record);
 *  3. the sign-in account itself goes: Google link, password, user row.
 *
 * Refuses while the reader still has a membership Stripe could charge or that
 * still grants access: cancel it in Stripe first. Never calls Stripe.
 * Safe to run again if interrupted. Prints no address beyond the one given.
 *
 *   pnpm --dir apps/questura/apps/server exec tsx scripts/erase-visitor-account.ts --email reader@example.com
 *   pnpm --dir apps/questura/apps/server exec tsx scripts/erase-visitor-account.ts --email reader@example.com --apply
 */

import 'dotenv/config'

import { Pool } from 'pg'

import { visitorAuth } from '../src/features/visitor-auth/lib/better-auth'
import { sessionRevocations } from '../src/features/visitor-auth/lib/session-revocations'

/** `subscription_status` values under which Stripe may still charge the reader. */
const LIVE_STATUSES = new Set(['active', 'past_due'])

type Profile = {
  id: number
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  subscription_status: string | null
  subscription_paused: boolean | null
  paid_through_at: Date | null
}

function argument(name: string): string | null {
  const at = process.argv.indexOf(name)
  return at === -1 ? null : (process.argv[at + 1] ?? null)
}

async function main(): Promise<number> {
  const email = argument('--email')?.trim().toLowerCase()
  const apply = process.argv.includes('--apply')
  if (!email || !email.includes('@')) {
    console.error('Usage: erase-visitor-account.ts --email <address> [--apply]')
    return 2
  }
  const databaseUri = process.env.DATABASE_URI
  if (!databaseUri) throw new Error('DATABASE_URI is required')

  const pool = new Pool({ connectionString: databaseUri, max: 2, application_name: 'questura-erase-account' })
  try {
    const user = (
      await pool.query<{ id: string }>(`SELECT id FROM visitor_auth_users WHERE lower(email) = $1`, [email])
    ).rows[0]
    if (!user) {
      console.log(`ERASE none: no account signs in as ${email} (already erased, or never existed)`)
      return 0
    }

    const profile = (
      await pool.query<Profile>(
        `SELECT id, stripe_customer_id, stripe_subscription_id, subscription_status, subscription_paused, paid_through_at
           FROM visitor_profiles WHERE auth_user_id = $1`,
        [user.id],
      )
    ).rows[0]
    const count = async (sql: string) => Number((await pool.query<{ n: string }>(sql, [user.id])).rows[0]?.n ?? 0)
    const sessions = await count(`SELECT count(*) AS n FROM visitor_auth_sessions WHERE "userId" = $1`)
    const accounts = await count(`SELECT count(*) AS n FROM visitor_auth_accounts WHERE "userId" = $1`)
    const bookmarks = await count(`SELECT count(*) AS n FROM bookmarks WHERE auth_user_id = $1`)

    const live =
      profile &&
      (LIVE_STATUSES.has(profile.subscription_status ?? '') ||
        profile.subscription_paused ||
        (profile.paid_through_at !== null && new Date(profile.paid_through_at).getTime() > Date.now()))
    if (live) {
      console.log(
        `ERASE refused: the membership has not ended (status ${profile.subscription_status}${
          profile.subscription_paused ? ', paused' : ''
        }). Cancel it in Stripe now, not at period end ` +
          `(docs/procedures/account-deletion.md, step 2), wait for the account page to show it ended, then run this again.`,
      )
      return 1
    }

    const keepProfile = Boolean(profile?.stripe_customer_id)
    const plan = [
      `sessions=${sessions}`,
      `sign_in_methods=${accounts}`,
      `bookmarks=${bookmarks}`,
      `profile=${!profile ? 'none' : keepProfile ? 'emptied (still names a Stripe customer)' : 'deleted'}`,
    ].join(' ')

    if (!apply) {
      console.log(`ERASE dry-run ${plan}. Nothing changed; add --apply to erase.`)
      return 0
    }

    const auth = await visitorAuth.$context

    // 1. No device stays signed in, and a cached copy is not trusted.
    await sessionRevocations.record(user.id)
    await auth.internalAdapter.deleteUserSessions(user.id)

    // 2. What the reader kept here.
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(`DELETE FROM bookmarks WHERE auth_user_id = $1`, [user.id])
      await client.query(`DELETE FROM visitor_auth_verifications WHERE value = $1`, [user.id])
      if (profile && keepProfile) {
        await client.query(
          // `auth_user_id` stays: Stripe events find the profile by customer and
          // prove it through `metadata.visitorAuthUserId`. The user it names is
          // deleted below, and a new sign-up never gets the same id.
          `UPDATE visitor_profiles
              SET email = $2, first_name = NULL, last_name = NULL, billing_email = NULL, updated_at = now()
            WHERE id = $1`,
          [profile.id, `erased-${profile.id}@erased.invalid`],
        )
      } else if (profile) {
        await client.query(`DELETE FROM visitor_profiles WHERE id = $1`, [profile.id])
      }
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }

    // 3. The sign-in account: sessions again (anything signed in meanwhile), Google link, password, user.
    await auth.internalAdapter.deleteUser(user.id)

    console.log(`ERASE done ${plan}`)
    return 0
  } finally {
    await pool.end()
  }
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(`ERASE failed: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  })
