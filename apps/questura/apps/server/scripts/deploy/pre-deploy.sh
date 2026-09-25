#!/usr/bin/env bash
# Railway's pre-deploy step for Questura Server (infra/railway/railway.json).
#
# The same database sequence the laptop's deploy.sh runs, in the same order,
# so the serverless platform cannot quietly skip the migration guard:
#
#   1. refuse if any pending migration is risky (DROP, TRUNCATE, DELETE,
#      column rewrites, visitor-auth tables, SQL the guard cannot read);
#   2. apply the pending migrations;
#   3. refuse if anything is still pending afterwards;
#   4. backfill the public search index if it is empty.
#
# Railway runs this in the new release's container, after the build and
# before the new instances take traffic. A non-zero exit fails the deploy and
# the previous release keeps serving. There is no override: a risky migration
# is applied by hand, after a restore point is recorded, following
# docs/procedures/backup-restore-rollback.md, and then this step finds
# nothing risky left to do.
set -Eeuo pipefail

SERVER_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$SERVER_DIR"

# Migrations take locks and run DDL: they want a real session, not a pooled
# transaction. Neon's direct endpoint is DATABASE_URI_UNPOOLED
# (docs/capacity/h01-provisioning-checklist.md step 4).
if [[ -n ${DATABASE_URI_UNPOOLED:-} ]]; then
  export DATABASE_URI="$DATABASE_URI_UNPOOLED"
fi
if [[ -z ${DATABASE_URI:-} ]]; then
  echo "pre-deploy: DATABASE_URI is not set" >&2
  exit 1
fi

echo "==> Checking pending database migrations"
node scripts/deploy/check-pending-migrations.mjs

echo "==> Running database migrations"
pnpm db:migrate
node scripts/deploy/check-pending-migrations.mjs --require-clean

echo "==> Backfilling the public search index if it is empty"
pnpm rebuild:search-index -- --if-empty

echo "==> Pre-deploy complete"
