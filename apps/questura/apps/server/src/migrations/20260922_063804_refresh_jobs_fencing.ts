import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Fencing columns for the refresh outbox (features/refresh-outbox/worker.ts).
 *
 * Additive and forward-compatible: `generation` defaults to 1, the claim
 * columns are nullable, and a process running the previous release keeps
 * working against this schema. A row that release left `running` has a null
 * claim token, so the new completion (`claim_token = $2 AND generation =
 * claimed_generation`) cannot match it — the job is left alone and reclaimed
 * when its lease expires. Nothing is lost.
 *
 * **The rollout order matters in the other direction.** A process running the
 * *previous* release completes with `id + status = 'running'` and no token,
 * so while old and new workers overlap, an old worker can still finish a new
 * worker's claim — the exact bug this migration exists to close, live for the
 * length of the overlap. It is not worse than before the migration, but it is
 * not fixed either.
 *
 * So: stop the drains for the transition. Set `REFRESH_WORKER_INTERVAL_MS=0`
 * on the old generation (or stop calling `POST /api/internal/refresh-jobs`),
 * let in-flight claims finish or their leases expire, migrate, deploy, then
 * turn drains back on. Obligations are durable rows; they wait.
 */

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "refresh_jobs" ADD COLUMN "generation" numeric DEFAULT 1 NOT NULL;
  ALTER TABLE "refresh_jobs" ADD COLUMN "claim_token" varchar;
  ALTER TABLE "refresh_jobs" ADD COLUMN "claimed_generation" numeric;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "refresh_jobs" DROP COLUMN "generation";
  ALTER TABLE "refresh_jobs" DROP COLUMN "claim_token";
  ALTER TABLE "refresh_jobs" DROP COLUMN "claimed_generation";`)
}
