# Questura soft-production deployment

`host-deploy-wrapper.sh` is installed as `~/questura/deploy.sh` on the Linux
laptop. It serializes deploys, resets the dedicated deployment checkout to
`origin/main`, then executes the freshly fetched `deploy.sh` from this folder.

Normal deploy:

```bash
ssh linux-laptop '~/questura/deploy.sh'
```

Deployment order is intentional:

1. Install dependencies from the committed lockfile.
2. Build, test, and lint the server.
3. Inspect pending migration `up()` bodies and block risky SQL by default.
4. Run migrations and prove none remain pending.
5. Restart the server and verify its DB-backed health endpoint locally and
   through Cloudflare.
6. Build the client while the server is publicly reachable, restart it, and
   verify the public site.

## Reviewed migrations

The preflight blocks destructive SQL, data rewrites, column/table rewrites,
and visitor-auth schema changes. It deliberately ignores `down()` rollback SQL.

Before manually running blocked migrations:

1. Back up the soft-production Postgres database.
2. Record row counts for `locations`, `articles`, `media_assets`, `media_sets`,
   `users`, `visitor_profiles`, and every `visitor_auth_*` table.
3. Review every pending migration's `up()` body for destructive or unrelated
   SQL and unexpected BetterAuth/visitor-auth changes. `pnpm db:migrate` applies
   the entire pending batch, not one named file.
4. Stop for explicit approval of that complete pending batch.
5. Run the batch manually during the approved maintenance window.
6. Rerun deployment; preflight will see the migrations already recorded.

```bash
cd ~/questura/app/apps/questura/apps/server
source ~/.nvm/nvm.sh
nvm use 22
pnpm db:migrate
~/questura/deploy.sh
```

There is no bypass or `--force` switch in automated deployment.

## First install

Install the wrapper. Installer preserves any existing copy under
`~/questura/backups/deploy/`:

```bash
~/questura/app/apps/questura/infra/softprod/install-deploy-wrapper.sh
```

This baseline still builds inside deployment checkout. Do not install it alone
on soft production; adopt it together with atomic-release units from follow-up
PR so a failed build cannot damage live `.next` files.

## Validation

Migration-preflight and deploy-runner regression tests are part of the server
test command. Run the shell suite alone with:

```bash
pnpm --dir apps/questura/apps/server test:softprod
```

## Code rollback

`release-lib.sh` activates server and client releases by atomically replacing
their `current-*` symlinks. A component restart must report both `healthy` and
the exact target commit from its local and public `/api/health` endpoints. On
failure, activation restores the prior symlink, restarts it, and checks it too.

After release-based host units are installed, swap current and previous code:

```bash
~/questura/app/apps/questura/infra/softprod/rollback.sh all
```

`all` rolls back client first, then server. If client rollback fails, server
stays untouched while restoration of the original client is attempted. If
server rollback fails, client is reconciled with whichever release the server
actually retained. Rollback first requires both current pointers and both
`previous-*` pointers to identify matching commits, and never runs a Payload
`down()` migration; database schema stays forward-only.
