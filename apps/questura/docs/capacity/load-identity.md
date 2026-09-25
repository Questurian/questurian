# The load identity (decision D3)

How a load test through Cloudflare stays many readers instead of one, and the
guard rails that keep that bypass inside one approved test window. Launch fix
plan item 9; code in `apps/server/src/shared/http/load-identity.ts`.

## The problem it solves

k6 sends a synthetic `CF-Connecting-IP` per virtual user
(`load/k6/lib/requests.js`). Cloudflare overwrites that header with the
generator's real address, so a whole load test is one caller. The per-address
limits then refuse it long before the platform is busy (public reads 60–240 a
minute per scope, member bodies 30, plans 30). The run measures the limits,
not capacity, and invites someone to raise the limits for everyone.

The sandbox reproduces this: its edge (`front-door-edge.ts`) can overwrite
`CF-Connecting-IP` with the real peer address, as Cloudflare does
(`POST /__edge/client-address {"overwrite": true}`). The scenarios
`one-ip-through-edge` and `load-identity-through-edge` in
`load/k6/runs/local-matrix.mjs` show the problem and the fix side by side
(numbers in `runs/2026-09-25-post-upgrade-baseline.md`).

## How it works

With `LOAD_TEST_KEY` set on the API, a request carrying

```
X-Questura-Load-Identity: <address>;<hex HMAC-SHA256(LOAD_TEST_KEY, address)>
```

is counted by every limiter as `<address>` (`getClientIp`). Admission gates,
pools, and the per-session and per-account limits are unchanged. k6 adds the
header itself when `LOAD_TEST_KEY` is in its environment.

## Guard rails, and what enforces each

| Guard rail | Enforced by | Proved by |
|---|---|---|
| Off by default | no key → the header is ignored, and writes no log line | `load-identity.test.ts`, `proxy.test.ts` |
| Key is 32+ characters | production refuses to boot (`assertProductionConfig`); k6 refuses too | `load-identity.test.ts`, `assert-production-config.test.ts` |
| Only during the test window | `LOAD_TEST_UNTIL` is required, at most 12 hours after boot, and the key stops working when it passes | `load-identity.test.ts` |
| Every use is logged | `proxy.ts`: one line per request carrying the header while a key is set, `Load identity used` (with the address) or `Load identity refused` (with the reason) | `proxy.test.ts`; sandbox backend log |
| `launch:verify` fails while it is set | `/api/health/ready` reports `loadIdentity` (`off`, `on`, `expired`, `invalid`); launch:verify fails on anything but `off`, and fails if `LOAD_TEST_KEY` is in its own shell | `checks.test.ts`, `options.test.ts`; sandbox run in the baseline |
| It can never stand for a real reader | only `198.18.0.0/15` (RFC 2544 benchmarking) can be claimed; a signed header naming any other address is refused | `load-identity.test.ts` |
| A caller who skips Cloudflare cannot use it | in `unidentified` origin-auth mode the header is removed with the other address headers; in `refuse` mode the request never gets that far | `proxy.test.ts` |

An expired window still boots: a restart after the test must not become an
outage. `launch:verify` reports the forgotten key instead.

## Running a window (go-live stage PL3, owner present)

1. Generate a key where it will not be logged: `openssl rand -hex 32`.
2. On the API (Railway): `LOAD_TEST_KEY=<key>` and
   `LOAD_TEST_UNTIL=<end of the window, ISO, e.g. 2026-10-01T18:00:00Z>`
   (at most 12 hours after the deploy). Deploy.
3. `curl -s https://api.questurian.com/api/health/ready` shows
   `"loadIdentity":"on"`.
4. Export `LOAD_TEST_KEY` in the generator's shell only (never on the command
   line) and run the stages through `load/k6/supervise.mjs`.
5. Afterwards: remove both variables from the API and redeploy, `unset
   LOAD_TEST_KEY` in the shell, then run `launch:verify`. It must pass,
   including "the API has no load-test key set".

The Cloudflare side (a WAF skip rule for the generator's IP, for the same
window) is a platform step in PL3, not code.

## In the sandbox

```bash
pnpm --dir apps/questura/apps/server readiness:stack -- up --load-test-window 120
MATRIX_RUN=<folder> node apps/questura/load/k6/runs/local-matrix.mjs one-ip-through-edge load-identity-through-edge
```

The key is generated per run and lives only in the stack's 0700 state file.
Without `--load-test-window` the sandbox backend runs with the load identity
off, like the platform.
