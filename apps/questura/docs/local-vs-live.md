# Local vs live

Default for UI and ordinary feature work is **Mac localhost**. The Linux laptop
is parked until a live window (Stripe, OAuth, cross-subdomain cookies, or
pre-launch proof).

## What each one is for

| Need | Where |
|---|---|
| Layout, CSS, copy, most feature clicks | `localhost:3000` / `localhost:4000` |
| Merge work in groups without a deploy per tweak | Local, then PR when the group is ready |
| Stripe Checkout, webhooks, membership truth | Live laptop |
| Google OAuth redirects | Live laptop |
| Staff/visitor cookies across `www` / `cms` / `abw` | Live laptop |

Local Postgres (`google-login` @5432) is scratch. Live DB stays on the laptop
(`questura` @5433). Local never answers “what does live Stripe do?”

## Local loop

```bash
cd apps/questura
pnpm dev
```

Client: `http://localhost:3000`. Server / Payload admin: `http://localhost:4000`.

Env files already point here (`apps/server/.env`, `apps/client/.env.local`).
Stripe keys on the Mac are empty on purpose — do not paste live keys into them.

## Park live (public domains go down)

Stripe webhooks to the live URL will fail until you resume. That is expected
while parked. Releases, config, Postgres, and Redis stay.

```bash
ssh linux-laptop 'bash -s' < apps/questura/infra/softprod/pause-live.sh
```

After this file is on `origin/main` and deployed once:

```bash
ssh linux-laptop '~/questura/app/apps/questura/infra/softprod/pause-live.sh'
```

## Resume live (Stripe / OAuth / cookie window)

```bash
ssh linux-laptop 'bash -s' < apps/questura/infra/softprod/resume-live.sh
```

Then, if `main` moved while parked:

```bash
ssh linux-laptop '~/questura/deploy.sh'
```

Check the real domains, not localhost. Checkout on live is a real charge.

## Git

Local preview is not “skip GitHub.” Still branch / PR / CI. Difference: do not
`deploy.sh` for every CSS tweak. Batch, merge, and only resume+deploy when you
need a live window or a grouped release.
