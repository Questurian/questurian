import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Payload 3.79.1 -> 3.90.2. Both columns are Payload's own, both nullable and
 * additive:
 *  - `users.reset_password_requested_at`: 3.90 throttles forgot-password per
 *    auth collection (release notes, "Password reset now clears lockouts").
 *  - `media_assets._objectkey`: plugin-cloud-storage's hidden per-upload key.
 *    Only client (signed-URL) uploads fill it; Questura's server-side uploads
 *    leave it null, so existing and new storage paths are unchanged.
 */

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "users" ADD COLUMN "reset_password_requested_at" timestamp(3) with time zone;
  ALTER TABLE "media_assets" ADD COLUMN "_objectkey" varchar;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "users" DROP COLUMN "reset_password_requested_at";
  ALTER TABLE "media_assets" DROP COLUMN "_objectkey";`)
}
