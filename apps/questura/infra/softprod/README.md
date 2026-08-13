# Questura soft-production deployment

`host-deploy-wrapper.sh` is installed as `~/questura/deploy.sh` on the Linux
laptop. It serializes deploys, resets the dedicated deployment checkout to
`origin/main`, then executes the freshly fetched `deploy.sh` from this folder.

Normal deploy:

```bash
ssh linux-laptop '~/questura/deploy.sh'
```

Deployment publishes an immutable snapshot at `~/questura/releases/<full-sha>`.
Only tracked files from that exact commit enter the snapshot; host secrets stay
in `~/questura/config/{server,client}.env` and are linked into the release.
Deployment order is intentional:

1. Require aligned `current-server` and `current-client` release pointers.
2. Extract the exact Git commit into private staging; link explicit config.
3. Install locked dependencies; build, test, and lint the server off-line.
4. Atomically publish the server-ready release.
5. Inspect migration `up()` bodies, migrate forward, and prove none remain.
6. Activate server; require its exact commit locally and through Cloudflare.
7. Build client against that server, activate it, then require the same exact
   commit from both client endpoints.

Failure before publication removes staging without touching live links. Any
failure after server activation but before client activation restores original
client/server links and their paired rollback history. `SIGINT` and `SIGTERM`
use the same cleanup path. Published partial releases remain for safe retry.
Config and artifact fingerprints reject drift, corruption, or build-time config
races when a commit is reused; runtime dependencies are certified too. Next ISR
disk writes are disabled so regenerated pages cannot mutate certified release
artifacts; image/fetch caches under `.next/cache` remain runtime-owned. Make a
new commit for intentional config changes. Database schema is never migrated
backward.

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

## Wrapper reinstall

After initial release adoption, reinstall the stable wrapper if needed. Installer
preserves any existing copy under `~/questura/backups/deploy/`:

```bash
~/questura/app/apps/questura/infra/softprod/install-deploy-wrapper.sh
```

Normal deploy requires release-based host units and aligned `current-*`
pointers. Fresh legacy-host migration uses the staged adoption flow below;
adoption backs up and replaces the wrapper transactionally.

## Versioned host configuration

`host/` is canonical source for soft-production Compose, Cloudflare Tunnel,
and user-systemd configuration. Unit templates deliberately use
`current-server`/`current-client`, exact release metadata, and journald; they do
not append unbounded files under `~/questura/logs`. Both Next services bind
only to `127.0.0.1`; Cloudflare Tunnel remains their sole public path.

Compose must be installed at `~/questura/infra/compose.yml` with a mode-0600
adjacent `.env`. Its project name and explicit volumes preserve existing
`infra_questura-pgdata` and `infra_questura-redisdata`; do not run a renamed
copy with a different project name. Tunnel credentials remain outside Git at
`~/.cloudflared/c8f86728-8dcd-4d3e-9d2e-e84d06661416.json`.

Files in this PR are inert templates. Host-bootstrap tooling renders binary
paths, validates release/config prerequisites, backs up live files, then
installs them in a later reviewed change.

Stage host config before release adoption:

```bash
~/questura/app/apps/questura/infra/softprod/stage-host-config.sh
```

This migrates existing app env files into mode-0600 canonical config, extracts
the existing Compose password into a mode-0600 `.env` without printing it,
installs sanitized Compose/Tunnel config, and renders validated units under
`~/questura/infra/systemd`. It backs up prior files and never changes active
unit files or service state. Any differing canonical app config fails closed.

Prepare first immutable release after config staging:

```bash
~/questura/app/apps/questura/infra/softprod/prepare-host-release.sh
```

Preparation builds, tests, and certifies server/client artifacts from exact Git
SHA; checks and applies forward-only migrations; leaves services, units, and
`current-*` links untouched. A failed migration never builds client. Partial
published releases remain safe to inspect/retry.

Adopt the prepared release only after preparation succeeds at the checkout's
current `HEAD`:

```bash
~/questura/app/apps/questura/infra/softprod/adopt-host-release.sh
```

Adoption is initial-only: all `current-*` and `previous-*` paths must be absent.
It takes the shared deploy lock, re-certifies the paired release for exact
`HEAD`, validates staged/live user units and service state, then backs up live
units and the legacy wrapper under `~/questura/backups/host-adoption/`. It
atomically installs both release pointers, versioned units, and the stable
wrapper. Server and client must report the exact release locally and publicly;
the same checks run again after restarting Cloudflare Tunnel. Installed units
switch app and tunnel logging to journald.

The deployment being adopted predates release-aware health, so its baseline is
captured leniently. An endpoint reporting a healthy 40-hex `releaseSha` is
recorded exactly; anything else is recorded as `legacy`, and only after proving
the service still answers. The server proves it through its own health body,
which still reports `status` and answers 503 when the database is down; the
client has no `/api/health` route yet, so its own root is used and any 2xx or
3xx counts. A service that is genuinely down fails the preflight instead.
Verification of the adopted release is unaffected and still demands the exact
SHA on all four endpoints.

Any install, restart, health, interrupt, or termination failure restores exact
legacy unit/wrapper bytes and modes, reloads and restarts those services,
rechecks whichever baseline it captured — the exact release, or for a legacy
baseline that the service answers again and is not reporting the release the
adoption was trying to install — and removes only adoption's unchanged
initial links. An incomplete rollback prints `CRITICAL` with its retained backup
path. Adoption never builds artifacts, installs dependencies, runs Compose, or
migrates the database.

The prepared release must match the commit containing the adoption script. If
preparation ran before that commit was checked out, rerun preparation first; it
will safely reuse completed work where certification still matches.

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
