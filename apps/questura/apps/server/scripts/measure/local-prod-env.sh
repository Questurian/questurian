# Source this before `next start` on a local production build used for
# measurement. It satisfies `assertProductionConfig` with non-secret local
# placeholders so the server boots in production mode on the Mac.
#
#   source scripts/measure/local-prod-env.sh
#   NEXT_DIST_DIR=.next-capacity pnpm exec next start -p 4100
#
# READ-ONLY USE. The URLs below are placeholders (production refuses
# localhost), so OAuth redirects, emails and Stripe return URLs built by this
# process are wrong on purpose. Measure public reads and the anonymous
# identity check; never sign up, check out or upload against it. Stripe values
# are replaced with placeholders below; Bunny and email still come from .env and
# are real, so uploads and sign-ups would reach them.
#
# Nothing in this file is a secret. BETTER_AUTH_SECRET is random per shell, so
# every session this server issues dies with it.

export NODE_ENV=production
export NEXT_PUBLIC_APP_URL=https://capacity-client.invalid
export BACKEND_URL_LOCAL=https://capacity-server.invalid
export CORS_ALLOWED_ORIGINS=https://capacity-client.invalid
export REDIS_URL=redis://127.0.0.1:6390
export TRUSTED_PROXY=cloudflare
export PAYLOAD_COOKIE_DOMAIN=host-only
export BETTER_AUTH_SECRET="$(openssl rand -hex 32)"
# The local .env secret is shorter than production's minimum. A random one per
# shell satisfies the check; it signs nothing that outlives this process, and
# public reads do not use it. Staff login and service-account keys will not
# work against this server — by design.
export PAYLOAD_SECRET="$(openssl rand -hex 32)"
# Placeholders, not keys. Anything that tries to reach Stripe from this
# process fails, which is the point: checkout is never part of a load run.
export STRIPE_SECRET_KEY=sk_capacity_placeholder_not_a_key
export STRIPE_WEBHOOK_SECRET=whsec_capacity_placeholder
export STRIPE_PRICE_ID=price_capacity_placeholder
export STRIPE_PRICE_ID_MONTHLY=price_capacity_placeholder
# Diagnostics are refused by header in production; the operator switch turns
# them on for this process so Server-Timing reaches the harness.
export PUBLIC_API_DIAGNOSTICS=1
export DB_STATS_SECRET="${DB_STATS_SECRET:-$(openssl rand -hex 16)}"
echo "local-prod-env: production mode for read-only measurement; DB_STATS_SECRET exported for the harness."
