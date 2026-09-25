# Backup, restore and rollback

How Questura's data is kept, how it comes back, and how to undo a release
without making things worse. Production is the Worker on Cloudflare, the API
on Railway, and Postgres 17 on Neon (`docs/capacity/cap07-platform-readiness.md`).

## Targets (decision D7, 2026-09-24)

| | Target | Where it comes from |
|---|---|---|
| Data you can lose (RPO) | **at most 5 minutes** | Neon point-in-time restore |
| How far back you can go | **7 days** | Neon history retention |
| Time to be serving again (RTO) | **within 1 hour** | the drill below, timed |
| If Neon itself is gone | **at most 1 day lost**, kept 30 days | the daily copy in Cloudflare R2 |

Stripe is the record of who paid. Any restore, of either kind, ends with the
Stripe reconcile (step 6 of each procedure), which brings membership back in
line for everything that happened after the restore point.

What a restore **cannot** bring back: accounts created, bookmarks made and
admin edits saved after the restore point. Plan for that when choosing the
point.

## What protects what

| Layer | Covers | Kept | Who runs it |
|---|---|---|---|
| Neon history (PITR) | a bad migration, a bad deploy, a bad admin edit, rows deleted by mistake | 7 days, to any second | Neon, continuously |
| Daily copy, `infra/backup/daily-dump.sh` | losing the Neon project, account or branch history | 30 days (bucket rule) | GitHub Actions, 03:17 UTC daily (`.github/workflows/questura-daily-backup.yml`) |
| A named restore point before a risky migration | the migration you are about to run by hand | until you delete the branch | you, [Risky migrations](#risky-migrations) |

The daily job **proves every copy restores** before storing it: `pg_dump -Fc`
with a Postgres 17 client, then `pg_restore --exit-on-error --single-transaction`
into an empty Postgres 17, then a check that `locations`, `articles` and
`payload_migrations` came back with rows. A copy that fails any step is not
uploaded and the run fails, which emails the owner.

## One-time setup (owner)

Done during provisioning (`docs/capacity/h01-provisioning-checklist.md`).
Nothing below exists yet.

**Neon.**
1. Project settings → history retention (called *instant restore* in the
   console) → **7 days**. This needs a paid plan; the free tier keeps much
   less. Check that the setting really reads 7 days afterwards.
2. A read-only role for the backup, from the Neon SQL editor:
   ```sql
   CREATE ROLE questura_backup LOGIN PASSWORD '<generate one>';
   GRANT pg_read_all_data TO questura_backup;
   ```
   Take its **direct** (not `-pooler`) connection string, with
   `sslmode=require`.

**Cloudflare R2** (the account the Worker already uses; not Neon, not Railway).
3. R2 → create bucket `questura-db-backups`. Leave public access **off**.
4. Bucket → Settings → Object lifecycle rules → delete objects with prefix
   `daily/` after **30 days**.
5. R2 → Manage API tokens → create a token with **Object Read & Write** on
   that one bucket only. Note the access key id, the secret, and the S3
   endpoint `https://<account id>.r2.cloudflarestorage.com`.

**GitHub** (repository → Settings → Secrets and variables → Actions).
6. Secrets: `QUESTURA_BACKUP_DATABASE_URL` (step 2),
   `R2_BACKUP_ACCESS_KEY_ID`, `R2_BACKUP_SECRET_ACCESS_KEY` (step 5).
   Variables: `QUESTURA_BACKUP_S3_URI=s3://questura-db-backups/daily`,
   `QUESTURA_BACKUP_S3_ENDPOINT=<endpoint from step 5>`, and last
   `QUESTURA_BACKUP_ENABLED=true`.
7. Actions → *Questura daily backup* → *Run workflow*. It must end with
   `Stored questura-<stamp>.dump in the off-Neon bucket`, and the bucket must
   show that file and its `.sha256`.

The repository is public, and so are workflow logs. The script never prints
a connection string, and the dump is never a workflow artifact. GitHub
switches off scheduled workflows after 60 days without a commit to the
repository. If the site goes quiet for that long, re-enable the workflow.

## Restore from Neon history (the usual case)

Use this for anything inside the last 7 days. Write down the wall-clock time
at each step: the total is what the RTO is measured against.

1. **Pick the restore point.** The last moment before the damage, from the
   deploy log, the Sentry event or the admin action. Record it in UTC.
2. **Stop the damage.** If a release caused it, roll it back first
   ([Rolling back a release](#rolling-back-a-release)), so the restored
   database is not damaged again.
3. **Look before you restore.** Neon → Branches → create a branch from the
   production branch *at a point in time*, at that timestamp. Point a scratch
   backend at the branch's direct URL (a local `pnpm dev` with
   `DATABASE_URI` and `DATABASE_URI_UNPOOLED` set to it) and check
   `pnpm db:migrate:status`, then read one city page and one article that
   the incident touched. The data should look like it did before the
   incident.
4. **Restore.** Neon → production branch → *Restore* to the same timestamp.
   Neon keeps the pre-restore state as a backup branch, so this step can be
   undone too. The connection strings don't change, so Railway needs no new
   variables. Restart the API service so its pools reconnect.
5. **Rebuild what is derived:**
   ```bash
   DATABASE_URI=<direct URL> pnpm --dir apps/questura/apps/server rebuild:search-index
   ```
   Refresh jobs that were owed at the restore point are still in
   `refresh_jobs` and drain on the next scheduler tick
   (`POST /api/internal/refresh-jobs`).
6. **Reconcile with Stripe.** Webhooks delivered after the restore point
   wrote to the history you just discarded. Dry run first, then apply:
   ```bash
   QUESTURA_RECONCILE_APPLY=0 pnpm --dir apps/questura/apps/server reconcile:nightly
   pnpm --dir apps/questura/apps/server reconcile:nightly
   ```
   Anything it lists for a human (exit 1) is a real person's access.
   Resolve each one before calling the restore done.
7. **Check it's serving.** Run `launch:verify` against the real domains
   (`docs/launch-day.md` step 3).

## Restore from the daily copy (Neon is gone)

1. Download the newest `questura-<stamp>.dump` and its `.sha256` from the R2
   bucket, then run `sha256sum -c questura-<stamp>.dump.sha256`.
2. Create a Postgres **17** database: a new Neon project if Neon is usable,
   anything else if it isn't. The client must be 17 too: `pg_dump` and
   `pg_restore` refuse, or quietly get things wrong, when they are older
   than the server. This laptop has 16. Use `docker run postgres:17`, as
   below.
3. Restore, stopping on the first error, as one transaction:
   ```bash
   docker run --rm -i postgres:17 pg_restore --no-owner --no-privileges \
     --exit-on-error --single-transaction -d '<new direct URL>' < questura-<stamp>.dump
   ```
4. Point Railway's `DATABASE_URI` and `DATABASE_URI_UNPOOLED` at the new
   database, and redeploy. The pre-deploy step then finds nothing pending.
   `db:migrate:status` must be clean.
5. Steps 5–7 of the Neon restore: search index, Stripe reconcile,
   `launch:verify`. Here the reconcile covers up to a day of memberships.
6. If the new database is not Neon, update `DATABASE_MAX_CONNECTIONS` and the
   pool variables for it (`docs/serverless-launch-checklist.md` §4a).

## The restore drill

Run once on the real platform before announcing (PL4), then every quarter.
Follow **Restore from Neon history** on a *branch* only (steps 1, 3 and 5,
with a scratch backend), because nothing in production needs restoring.
Record:

| Date | Restore point (UTC) | Branch ready | Scratch backend serving | Search rebuilt | Total | RPO met (≤ 5 min)? | RTO met (≤ 1 h)? |
|---|---|---|---|---|---|---|---|
| | | | | | | | |

Also restore the newest daily copy into a throwaway Postgres 17
(`docker run --rm -p 127.0.0.1:<spare port>:5432 -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17`)
and time it.

### Measured so far (local, 2026-09-24)

On the laptop, against throwaway containers, with the launch corpus
(50 published pieces, 114 tables). This proves the procedure works and the
Postgres versions are compatible. It says nothing about how long Neon takes.

| What | Result |
|---|---|
| `readiness:restore -- --db-only` on Postgres 17.11 (pg_dump/psql 17.11) | 29/29 checks, 7 service gates skipped (need the sandbox stack). Dump 365 ms, restore 658 ms, 1.7 s end to end. `docs/capacity/runs/2026-09-24-surge-L09-restore-db-only-pg17.json` |
| Cutover path: Postgres 16 source, host `pg_dump` 16.15, plain SQL → Postgres 17 with `psql -v ON_ERROR_STOP=1 --single-transaction` | restores cleanly. Dump 135 ms (1.8 MB), restore 641 ms, row counts identical |
| Daily-copy format: `pg_dump -Fc` 17 → `pg_restore --exit-on-error --single-transaction` 17 | Dump 336 ms (636 KB), restore 601 ms, row counts identical |
| `infra/backup/daily-dump.sh` end to end (local directory destination) | 1.8 s. It refuses a non-empty verification database and pg_dump 16 against Postgres 17 |
| Host `pg_dump` 16.15 against Postgres 17 | **refused** ("server version mismatch"). Backups of Neon need a 17 client |

The full `readiness:restore`, which also boots the server on the restored
database, signs member A in, and serves search and a member body, runs
against the sandbox stack. To run it on 17, point the stack at a Postgres 17
container:
`READINESS_DATABASE_URI=postgres://postgres@127.0.0.1:<port>/questura_readiness`
plus `READINESS_PG_BINDIR` with 17 clients and `READINESS_RESTORE_EXPECT_MAJOR=17`.

## Migrations and the deploy guard

The API's schema moves only through committed Payload migrations, and every
deploy runs them through one guard,
`apps/server/scripts/deploy/check-pending-migrations.mjs`. It blocks any
pending migration whose `up()` contains `DROP`, `TRUNCATE`, `DELETE FROM`, an
`UPDATE`, `ALTER COLUMN`/`DROP COLUMN`/`RENAME`, `ALTER TYPE`, touches the
visitor-auth tables, or builds SQL the guard can't read.

**Railway.** `infra/railway/railway.json` sets the pre-deploy command to
`bash scripts/deploy/pre-deploy.sh`, run from the service root
`apps/questura/apps/server`. It is the same sequence as the laptop's
`deploy.sh`: guard → `pnpm db:migrate` → guard `--require-clean` → search
index backfill if empty. The migrations use `DATABASE_URI_UNPOOLED` when it is
set. If it fails, the deploy fails and the previous release keeps serving.
Railway reads the file only if it is told where it is: service → Settings →
*Config-as-code* → `/apps/questura/infra/railway/railway.json` (an absolute
path; it does not follow the root directory). It also sets `pnpm start`, the
healthcheck `/api/health/ready`, and restart-on-failure.

On the first real deploy, check that the pre-deploy log shows
`Checking pending database migrations`. The guard needs `typescript` and the
search backfill needs `tsx`, both devDependencies. If the build prunes
devDependencies, the step fails loudly rather than skipping. Keep them.
Item 10's origin lock must leave `/api/health/ready` reachable by Railway's
healthcheck.

**CI.** `.github/workflows/questura-migration-safety.yml` runs the same
inspection on every migration a pull request adds or changes. A risky one
turns the PR red until the description has, on its own line:

```
Acknowledge-risky-migration: <migration name>
```

That only turns CI green. The deploy guard still refuses the migration,
because there is deliberately no switch that lets a deploy apply it.

### Risky migrations

1. **Expand, then contract.** Ship code that no longer reads or writes what
   the migration removes or rewrites, and let it serve for at least one
   release. Only then merge the migration. Otherwise the release still
   serving breaks the moment the migration runs.
2. Acknowledge it in the PR (above), and check `payload_migrations` row counts
   plus the tables it touches (`AGENTS.md` migration rules).
3. **Record a restore point:** Neon → create a branch from production *now*,
   named `pre-<migration name>`. It is instant and costs nothing until it
   diverges.
4. Apply it by hand from a trusted machine, with the code from the merge:
   ```bash
   DATABASE_URI='<direct URL>' pnpm --dir apps/questura/apps/server db:migrate
   DATABASE_URI='<direct URL>' node apps/questura/apps/server/scripts/deploy/check-pending-migrations.mjs --require-clean
   ```
5. Deploy. The pre-deploy guard finds nothing risky pending.
6. If it went wrong, restore to the `pre-<migration name>` point with
   **Restore from Neon history**. `migrate:down` is not a production
   rollback: a dropped column's data is not in the `down()`.

## Rolling back a release

**A code rollback never reverses a migration.** That is why migrations stay
additive, and why the rule below exists.

**The rule: API changes stay additive for one release.** A field, route or
value the Worker uses is added in one release and removed at the earliest one
release after the Worker has stopped using it. New request fields are
optional. The Worker never depends on a new API field in the same release
that adds it. That way either side can roll back on its own, and the other
still works.

**Which side, and in what order.**
- Only the API is broken: roll back the API.
- Only the website is broken: roll back the Worker.
- Both are broken, or you can't tell: roll back the Worker first, then the
  API. The older Worker works against either API. A newer Worker may need
  the newer API.

**API (Railway).** Service → Deployments → the last good deployment → ⋯ →
*Rollback*. The old image comes back with its variables. Whether or not
Railway re-runs the pre-deploy step, it has nothing to do: the migrations are
already applied, and the old code's list is a subset of them. For a fix that
lasts, revert the commit on `main` and let it deploy normally.

**Worker (Cloudflare).**
```bash
pnpm --dir apps/questura/apps/client exec wrangler deployments list
pnpm --dir apps/questura/apps/client exec wrangler rollback <version id> --message "<why>"
```
Wrangler refuses a rollback across a Durable Object migration or a binding
change. In that case, redeploy the older commit instead. Pages cached while
the bad version served stay until they are revalidated. Republishing, or the
next scheduled refresh, replaces them.

**Softprod laptop** (while it still serves): `infra/softprod/rollback.sh`.

## Switches that need no code change

Each is a Railway variable. Changing one restarts the service; it doesn't
ship new code.

| Switch | Effect | Undo |
|---|---|---|
| `REFRESH_OUTBOX=off` plus `REFRESH_OUTBOX_DEGRADED_ACK=<reason, date>` | publishing refreshes run inline, best-effort. **An emergency mode with known loss, not a rollback**: a failed refresh is gone. Afterwards rebuild the search index and purge the CDN | unset both |
| `PUBLIC_QUERY_*`, `PUBLIC_ASSEMBLY_*`, `PUBLIC_INGRESS_*`, `PRIVATE_READ_*`, `VISITOR_AUTH_*` `_CONCURRENCY` / `_QUEUE` / `_QUEUE_MS` | admission gate sizes (`apps/server/src/shared/http/admission.ts`). Smaller sheds load onto the queue and 503s sooner; larger lets more work reach Postgres | unset for the defaults |
| `VISITOR_AUTH_SCHEMA_GUARD=create` | for a restore that came back without the Better Auth tables: the server creates them at boot | unset once they exist |
