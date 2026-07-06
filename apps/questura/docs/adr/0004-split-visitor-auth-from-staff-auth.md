# Split visitor auth from staff auth

Questura will treat Visitor auth and Staff auth as separate auth surfaces. BetterAuth will own high-volume Visitor account authentication for the public site, including public sessions, OAuth accounts, credentials, verification, and account-linking flows; Payload auth will continue to own Staff identity authentication for Payload/admin/editorial surfaces. Questura-owned Visitor account product data, such as profile fields, membership entitlement, Stripe linkage, saved content, preferences, and affiliate referral data, will live in VisitorProfiles or related Questura collections linked to the BetterAuth user rather than in the staff `Users` collection.

VisitorProfiles remains a Payload collection because Staff identities need admin/support visibility into Visitor account membership and Stripe state. BetterAuth tables remain separate auth infrastructure and are not used as Staff-facing support records.

BetterAuth database tables are managed through committed Questura Server SQL migrations, not Payload `push`. Payload `push` remains scoped to Payload collections; BetterAuth schema changes are deployed deterministically as auth-infrastructure migrations.

This chooses a more explicit boundary over the simpler Payload-only model because public-user scale and OAuth/signup behavior should evolve without widening the CMS admin attack surface. It also avoids making BetterAuth responsible for Payload admin access unless that integration is later proven necessary and maintainable.

Because Questura public auth has not been deployed, the migration will happen as a direct data-model cutover rather than a staged public-session migration. BetterAuth and VisitorProfiles replace public `/me`, signup, login, OAuth, and Stripe auth flows before launch; Payload `Users` becomes staff-only; legacy custom JWT, token-in-URL, and public `role: "user"` paths are removed. Legacy route names may remain only as adapters over BetterAuth Visitor auth while client flows are migrated.

Payload `Users` supports only Staff identity roles: `admin`, `editor`, and `writer`. The legacy `user` role is removed rather than kept unused, so role checks for `user` are treated as legacy cleanup targets.

Legacy removal is part of the BetterAuth implementation itself, not follow-up cleanup. The implementation is incomplete until custom JWT helpers, visitor `payload-token` usage, and `Users.role = "user"` are removed or replaced. Any retained `/api/auth/*` or `/api/user/*` public routes are compatibility adapters over BetterAuth Visitor auth, not aliases to Payload `Users`.

Existing Payload visitor sessions do not need a compatibility window because there are no deployed public sessions to preserve. Sensitive account and payment actions require a BetterAuth Visitor session.

Visitor auth uses BetterAuth's `questura_visitor` cookie namespace. The `payload-token` cookie is reserved for Staff auth through Payload and is not reused for public Visitor sessions.

The browser calls Questura Server Visitor-auth endpoints directly rather than proxying them through Questura Client. The BetterAuth catch-all route therefore returns credentialed CORS headers and handles preflight requests. Client callback URLs are absolute Questura Client URLs so OAuth, reset-password, and email-change flows return to the public app instead of the backend origin.

Legacy visitor-facing custom auth implementation is deleted rather than kept as a permanent parallel system. BetterAuth replaces public signup, login, logout, refresh, OAuth, verification, password reset/change, email-change, password verification, account-check, and token-bearing callback flows. Staff/Payload admin auth remains Payload-owned. Compatibility route names may delegate to BetterAuth where needed so existing client surfaces can migrate without restoring legacy JWT assumptions.

Visitor auth keeps one email-first entry flow. Account-state decisions are backed by BetterAuth Visitor records and may be exposed through compatibility adapters only where needed for that flow; the UI does not ask visitors to choose separate sign-in and sign-up paths.

`GET /api/me` is the canonical current-principal endpoint for the public app. It returns a normalized current-principal view for Visitor auth only. Payload Staff auth is ignored on this public endpoint so a browser logged into Payload admin does not become logged into the public client. `/api/user/me` is removed rather than kept as a compatibility alias.

BetterAuth launch parity includes public email/password signup and login, Google OAuth, password reset, email change, account linking, and email verification. Google OAuth accounts may be treated as verified when the provider reports a verified email. Staff emails remain blocked from Visitor auth regardless of verification state.

Staff email blocking uses both a known staff-domain fast path and a Payload `Users` lookup. The domain check handles obvious staff attempts early; the Payload lookup protects staff identities using custom domains, contractor addresses, or future non-`@questurian.com` emails.

Visitor account linking requires matching provider and email/password email addresses. Different-email linking is not allowed because it creates ambiguous ownership and recovery boundaries.

A Visitor must explicitly unlink Google before changing their email address. Email change is blocked while Google remains linked so a provider identity cannot silently diverge from the Visitor account email.

Email/password Visitor accounts must verify their email before checkout or paid-content access. Unverified Visitor accounts may browse public content and manage verification, but payment and membership-gated surfaces require a verified Visitor account; Google OAuth accounts may satisfy this requirement through provider-verified email.

Stripe customer and subscription records belong only to Visitor accounts. Staff identities never create Stripe checkout or customer records. Staff grants, if exposed, must use explicit staff-only surfaces rather than the public client session.

Payment APIs authenticate through the Current principal. Stripe checkout and customer operations require a Visitor principal. Staff principals cannot enter Stripe flows.

BetterAuth endpoints own Visitor credential, session, verification, password reset, email change, and provider-linking operations. Questura `/api/account/*` endpoints exist only for product-level Visitor profile, preferences, saved content, affiliate/referral, and membership-view operations.

The OAuth-only Visitor add-password action is the narrow exception: Questura exposes `/api/account/set-password` as a server adapter because BetterAuth intentionally exposes `setPassword` only through its server API, not as a browser-callable BetterAuth endpoint.

BetterAuth owns Visitor auth email token and flow state. Questura renders and sends verification, reset, and auth-change emails through BetterAuth mail hooks using the existing Resend email feature and Questura-branded templates.

Visitor auth rate limiting is Redis-backed rather than process-local or database-backed in production. Database-backed BetterAuth limits are acceptable only for local/spike work. Limits apply by IP, normalized email, session, and user as appropriate; verification-code sends and attempts are limited separately. Suspicious traffic is throttled first, then challenged with Turnstile/CAPTCHA after configured thresholds, and staff-email attempts in Visitor auth are audit logged.

Before migration work starts, Questura Server will run a BetterAuth spike that proves route-handler integration, same-database table placement, cross-app session cookies, staff-email blocking via Payload `Users`, VisitorProfile creation/linking, and `GET /api/me` current-principal output. The spike does not migrate legacy visitor routes.
