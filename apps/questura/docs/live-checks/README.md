# Live checks

Things localhost cannot prove. Each file here is one piece of work that has
been merged and tested locally, plus the checks only the real site can answer:
cookies across `www` / `cms`, Safari, Google sign-in, real email, live Stripe.

Collect them here and run them **together in one live window**, rather than
resuming the laptop for each one (`docs/local-vs-live.md`).

Not the same as `docs/serverless-launch-checklist.md`. That file is
configuration to redo on the future platform. This folder is "we changed
code; confirm it on the live domain".

## Open

| File | What | PRs | Added |
|---|---|---|---|
| [visitor-auth.html](visitor-auth.html) | Sign-in cookies, Safari, navbar, Google, password email, sessions in the DB | #646–#650 | 2026-09-23 |

## How to run a live window

1. Resume and deploy `main` (steps are at the top of each file).
2. Work through every open file. Tick boxes as you go (saved in your browser only).
3. Post each file's results on its PRs.
4. Move the file's row to **Done** below with the date and the release SHA.
   Anything that failed becomes an issue or a PR, not a note here.

Standing rules for every window: live Stripe is real money, so trigger no
checkout without saying so first. Never flush the live Redis.
`infra/softprod/rollback.sh` reverts a bad release.

## Done

| File | Checked | Release |
|---|---|---|
| — | | |

## Adding a file

One file per merged piece of work. Keep the same three parts: how to go live,
the checks (each saying why only live can answer it and which PR it covers),
and what localhost already proved so nobody redoes it.
