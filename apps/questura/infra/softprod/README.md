# Questura soft-production deployment

## What this environment is, and what it is not

This Linux laptop serves the live domains, but it is **not the production
platform**. It exists for one reason: some things cannot be proven anywhere
else. Stripe has to reach a real webhook URL, OAuth has to redirect to a real
origin, and cookies only behave like cookies over real HTTPS on real
subdomains. A localhost stack cannot exercise any of that honestly.

So this is a **live-like test environment that happens to be publicly
reachable**. The only transactions on it are the owner's own tests. It is not
serving customers, and nobody but the owner depends on it being up.

**Catalog vs laptop test charge.** One Stripe product, catalog **$12.99/month**
and **$79.99/year** on the site, **$0.50/month** in Checkout while this machine
is the test runtime. Intentional until serverless. Do not sync the UI to $0.50.
How to switch to a real-price test, and Stripe CLI: `docs/membership-pricing.md`.

**It has an expiry date.** Once the site is proven end to end here, this
machine is switched off and production moves to a serverless deployment. That
is the plan of record, not a vague intention.

Two consequences worth stating plainly, because they have already caused
wasted work:

- **Do not build things whose value dies with this machine.** Uptime alerting
  is the clearest example: a laptop that is deliberately slept, closed and
  eventually retired will page you constantly for events that are not
  incidents. This was proposed and rejected on 2026-08-13, correctly. The same
  reasoning applies to hosting additional services here for convenience.
- **Do build things that travel with the repository.** The production config
  assertions at boot, the `/api/health` endpoints that report an exact release
  SHA, secret hygiene, CI, and the Stripe configuration all keep their value
  in a serverless environment. The machinery in *this folder* — immutable
  release directories, `current-*` symlinks, user systemd units, the passive
  healthcheck timer — does not. It is correct for this host and is not an
  argument for keeping this host.

Nothing here commits the project to systemd-and-symlinks as a production
deployment model. It is the cheapest safe way to run a real environment on
hardware that is already paid for.

## Deploying

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

`~/questura/config/server.env` must carry the staff session cookie decision
before a release built from this commit is deployed, or the server refuses to
boot:

```
PAYLOAD_COOKIE_DOMAIN=questurian.com
PAYLOAD_COOKIE_REQUIRED_HOSTS=cms.questurian.com,www.questurian.com,abw.questurian.com,abw-api.questurian.com
```

`PAYLOAD_COOKIE_DOMAIN=host-only` is the explicit alternative for a deployment
whose callers all share Payload's host; it needs no required-host list. Adding
these keys ahead of the deployment is safe — an older release ignores them.
Operators signed in before the change keep a host-only `payload-token` on
`cms` alongside the new domain-scoped one; the older cookie is sent first and
logging out cannot expire it, so their previous session survives until it
expires on its own (2h). Signing out and back in after the deploy avoids it.

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

## Passive monitoring

`healthcheck.sh` verifies the adopted host every five minutes — and two minutes
after boot, once the app units have had time to answer — without changing it. The check requires aligned, valid `current-server` and `current-client`
release metadata, then verifies that exact commit through all four local and
public `/api/health` endpoints. The server endpoint performs a real Payload
database query. It also requires the server, client, and tunnel user units to be
active; validates canonical Compose config; and checks the stable Postgres and
Redis containers for the `infra` project, expected service labels, running
state, and healthy Docker health checks.

Results go to journald under `questura-healthcheck`. Failures are aggregated and
sanitized: app response bodies, Compose output, and environment values are
never logged. The monitor never restarts a unit, changes a release link, runs a
migration, or writes to Postgres or Redis. If a deploy holds `deploy.lock`, or
the paired release changes while checks run, that pass logs `SKIP` and exits
successfully; the monitor probes but never holds the deployment lock.

`stage-host-config.sh` renders the monitor service and timer alongside the app
units, but does not install or enable them. After immutable-release adoption is
complete and all three app units are healthy:

```bash
mkdir -p ~/.config/systemd/user ~/questura/backups/health-monitor
cp -a ~/.config/systemd/user/questura-healthcheck.service \
  ~/.config/systemd/user/questura-healthcheck.timer \
  ~/questura/backups/health-monitor/ 2>/dev/null || true
install -m 0644 ~/questura/infra/systemd/questura-healthcheck.service \
  ~/.config/systemd/user/questura-healthcheck.service
install -m 0644 ~/questura/infra/systemd/questura-healthcheck.timer \
  ~/.config/systemd/user/questura-healthcheck.timer
systemd-analyze --user verify \
  ~/.config/systemd/user/questura-healthcheck.service \
  ~/.config/systemd/user/questura-healthcheck.timer
systemctl --user daemon-reload
systemctl --user start questura-healthcheck.service
journalctl --user -u questura-healthcheck.service -n 100 --no-pager
systemctl --user enable --now questura-healthcheck.timer
systemctl --user list-timers questura-healthcheck.timer
```

Enable the timer only after the manual service run exits successfully. To undo
adoption, disable the timer, restore or remove only these two user-unit files,
then run `systemctl --user daemon-reload`.

This is diagnostics, not alerting. Journald records failures, but does not
notify anyone, and an on-host monitor cannot report laptop power, sleep, or
total network failure. External uptime/heartbeat alerting remains separate
follow-up work.

## Nightly Stripe reconciliation

Webhooks are the only thing that writes membership state, and until this landed
nothing verified that Stripe and `visitor_profiles` still agreed. A webhook that
is never delivered — or is delivered, returns 2xx, and then fails to write —
leaves a divergence Stripe stops retrying after about three days, after which it
is permanent and silent: paid-but-no-access, refunded-but-still-access,
cancelled-but-still-access.

`questura-reconcile.timer` runs `reconcile.sh` at 04:20 local, which runs the
orchestrator in `apps/questura/apps/server/scripts/nightly-stripe-reconcile.ts`.
That composes the three scripts that already detect and repair this, in the order
that catches the cheapest and broadest class first:

1. `verify:stripe-webhook-events` — reads the live endpoint's enabled-event list
   and diffs it against the code. This is the failure that has already happened
   once: `charge.refunded` and `charge.dispute.*` were handled and deployed for
   months while the Dashboard had never enabled them. Read-only.
2. `reconcile:stripe-profiles` — with `--apply` and a blast-radius cap. Fills in
   or corrects linkage on existing profiles; never creates, deletes, or reassigns
   a profile, and never writes to Stripe.
3. `audit:access-revocations` — read-only, no apply mode. Each row it finds is a
   decision about somebody's money and is cleared by hand in the Dashboard.

All three run even if an earlier one fails. The exit code is aggregated: **0**
means all clear *or* drift found and successfully applied — healed drift is the
job working, so it is logged and not escalated — and **1** means a human is
needed: `MISSING` events on an enabled endpoint, a `DISABLED` endpoint,
`ORPHANED`, `DUPLICATE`, `STUCK`, `UNKNOWN`, the cap exceeded, or a step that
threw. That rule lives in `src/features/payments/lib/reconcile-report.ts` and is
unit-tested there.

Two env knobs, honoured by both the wrapper and the orchestrator:

| Variable | Default | Effect |
| --- | --- | --- |
| `QUESTURA_RECONCILE_APPLY` | `1` | `0` makes the whole run read-only. |
| `QUESTURA_RECONCILE_MAX_APPLY` | `25` | Plans larger than this print and write nothing. |

The cap exists because mass drift means something systemic — wrong Stripe key,
wrong account, a bad deploy — rather than that many genuine divergences. A run
that hits it is a finding, not a number to raise.

`reconcile.sh` **holds** `deploy.lock` for the whole run, with a 15-minute wait,
because it writes to Postgres while `deploy.sh` may be running migrations. This
is the opposite of `healthcheck.sh`, which is passive and deliberately never
holds the lock. If a deploy has it, the run logs `SKIP` and exits 0.

Output goes to journald under `questura-reconcile`, and to
`~/questura/reports/reconcile-<UTC-date>.log` with `reconcile-latest.log`
pointing at the newest. `~/questura/reports/` is separate from
`~/questura/logs/`, which holds the append-only service logs and has a different
lifecycle; reports are pruned after 30 days.

**These report files contain visitor email addresses and Stripe customer IDs.**
That is the same data the manual scripts already print to a terminal, so it is
not a new exposure, but it now persists: the directory is mode 0700 and the files
0600, and they should be treated as such.

There is no alerting, deliberately — see the rejection of uptime alerting above.
Instead `healthcheck.sh` folds in a freshness probe on the timer it already has:
`reconcile-status` missing, older than `QUESTURA_RECONCILE_MAX_AGE_SECONDS`
(default 36h, so one missed night is tolerated and two are not), or recording
`status=fail` fails the healthcheck. If `~/questura/reports/` does not exist at
all the probe reports `state=not-adopted` and stays green.

Adoption is manual, same as the healthcheck, and `stage-host-config.sh` must have
run first to render the units from their `.in` templates. Dry-run by hand before
letting it write anything:

```bash
cd ~/questura/current-server
set -a; . ~/questura/config/server.env; set +a
QUESTURA_RECONCILE_APPLY=0 pnpm exec tsx scripts/nightly-stripe-reconcile.ts
QUESTURA_RECONCILE_APPLY=0 bash ~/questura/app/apps/questura/infra/softprod/reconcile.sh
```

Confirm the drift count is well under the cap before enabling the timer. Then:

```bash
mkdir -p ~/.config/systemd/user
install -m 0644 ~/questura/infra/systemd/questura-reconcile.service \
  ~/.config/systemd/user/questura-reconcile.service
install -m 0644 ~/questura/infra/systemd/questura-reconcile.timer \
  ~/.config/systemd/user/questura-reconcile.timer
systemd-analyze --user verify \
  ~/.config/systemd/user/questura-reconcile.service \
  ~/.config/systemd/user/questura-reconcile.timer
systemctl --user daemon-reload
systemctl --user start questura-reconcile.service
journalctl --user -u questura-reconcile.service -n 200 --no-pager
systemctl --user enable --now questura-reconcile.timer
systemctl --user list-timers questura-reconcile.timer
```

`Persistent=true` on the timer is not optional on this host: a laptop asleep at
04:20 runs the missed job on wake, which is precisely why this machine needs it.
To undo, disable the timer and remove the two user-unit files:

```bash
systemctl --user disable --now questura-reconcile.timer
rm ~/.config/systemd/user/questura-reconcile.{service,timer}
systemctl --user daemon-reload
```

**What survives this machine, and what does not.** The timer, the service, and
`reconcile.sh` are laptop glue and are deleted at migration; they are worth
nothing to a serverless deployment. `pnpm reconcile:nightly` is the part that
travels — it runs anywhere Node runs, and it is the command a Vercel Cron,
EventBridge rule, or scheduled GitHub Action points at. Serverless removes the
"host was asleep for three days" failure mode and none of the others: enabled-
event-list drift, signing-secret drift, and a handler that returns 2xx before its
write fails are all transport-independent, which is why Stripe's own guidance is
to reconcile on a schedule regardless of transport.

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
