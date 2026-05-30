# Split visitor auth from staff auth

Questura will treat Visitor auth and Staff auth as separate auth surfaces. BetterAuth will own high-volume Visitor account authentication for the public site, including public sessions, OAuth accounts, credentials, verification, and account-linking flows; Payload auth will continue to own Staff identity authentication for Payload/admin/editorial surfaces. Questura-owned Visitor account product data, such as profile fields, membership entitlement, Stripe linkage, saved content, preferences, and affiliate referral data, will live in VisitorProfiles or related Questura collections linked to the BetterAuth user rather than in the staff `Users` collection.

VisitorProfiles remains a Payload collection because Staff identities need admin/support visibility into Visitor account membership and Stripe state. BetterAuth tables remain separate auth infrastructure and are not used as Staff-facing support records.

BetterAuth database tables are managed through committed Questura Server SQL migrations, not Payload `push`. Payload `push` remains scoped to Payload collections; BetterAuth schema changes are deployed deterministically as auth-infrastructure migrations.

This chooses a more explicit boundary over the simpler Payload-only model because public-user scale and OAuth/signup behavior should evolve without widening the CMS admin attack surface. It also avoids making BetterAuth responsible for Payload admin access unless that integration is later proven necessary and maintainable.

Because Questura public auth has not been deployed, the migration will happen as a direct cutover rather than a staged compatibility migration. BetterAuth and VisitorProfiles replace public `/me`, signup, login, OAuth, and Stripe auth flows before launch; Payload `Users` becomes staff-only; legacy custom JWT, token-in-URL, account-check, and public `role: "user"` paths are removed rather than kept as compatibility shims.

Payload `Users` supports only Staff identity roles: `admin`, `editor`, and `writer`. The legacy `user` role is removed rather than kept unused, so role checks for `user` are treated as legacy cleanup targets.

Legacy removal is part of the BetterAuth implementation itself, not follow-up cleanup. The implementation is incomplete until legacy `/api/auth/*`, `/api/user/*`, custom JWT helpers, visitor `payload-token` usage, client calls to old auth routes, and `Users.role = "user"` are removed or replaced.

Existing Payload visitor sessions do not need a compatibility window because there are no deployed public sessions to preserve. Sensitive account and payment actions require a BetterAuth Visitor session.

Visitor auth uses BetterAuth's `questura_visitor` cookie namespace. The `payload-token` cookie is reserved for Staff auth through Payload and is not reused for public Visitor sessions.

The browser calls Questura Server Visitor-auth endpoints directly rather than proxying them through Questura Client. The BetterAuth catch-all route therefore returns credentialed CORS headers and handles preflight requests. Client callback URLs are absolute Questura Client URLs so OAuth, reset-password, and email-change flows return to the public app instead of the backend origin.

Legacy visitor-facing custom auth endpoints are deleted rather than kept as aliases or permanent shims. BetterAuth replaces public signup, login, logout, refresh, OAuth, verification, password reset/change, email-change, password verification, account-check, and token-bearing callback flows. Staff/Payload admin auth remains Payload-owned. Account endpoints may be reintroduced only when they represent Visitor account product operations, not as wrappers over legacy JWT assumptions.

The new Visitor auth UX does not keep the account-check preflight pattern. Visitors choose sign in or sign up explicitly, and auth responses avoid revealing whether an email exists except where the Visitor has explicitly submitted a create/update action.

`GET /api/me` is the canonical current-principal endpoint for the public app. It returns a normalized current-principal view for either Visitor auth or Staff auth, including authenticated Staff identities when Staff auth is present. Client flows that require a Visitor account reject Staff current principals. `/api/user/me` is removed rather than kept as a compatibility alias.

BetterAuth launch parity includes public email/password signup and login, Google OAuth, password reset, email change, account linking, and email verification. Google OAuth accounts may be treated as verified when the provider reports a verified email. Staff emails remain blocked from Visitor auth regardless of verification state.

Staff email blocking uses both a known staff-domain fast path and a Payload `Users` lookup. The domain check handles obvious staff attempts early; the Payload lookup protects staff identities using custom domains, contractor addresses, or future non-`@questurian.com` emails.

Visitor account linking requires matching provider and email/password email addresses. Different-email linking is not allowed because it creates ambiguous ownership and recovery boundaries.

A Visitor must explicitly unlink Google before changing their email address. Email change is blocked while Google remains linked so a provider identity cannot silently diverge from the Visitor account email.

Email/password Visitor accounts must verify their email before checkout or paid-content access. Unverified Visitor accounts may browse public content and manage verification, but payment and membership-gated surfaces require a verified Visitor account; Google OAuth accounts may satisfy this requirement through provider-verified email.

Stripe customer and subscription records belong only to Visitor accounts. Staff identities never create Stripe checkout or customer records; `admin` and `editor` receive paid-content access through a role-derived Staff grant, while `writer` does not. Writers may access Payload/editorial surfaces according to collection permissions, but writer access does not imply paid public-content access.

Payment APIs authenticate through the Current principal. Stripe checkout and customer operations require a Visitor principal; Staff principals may receive paid-content access through Staff grants, but cannot enter Stripe flows.

BetterAuth endpoints own Visitor credential, session, verification, password reset, email change, and provider-linking operations. Questura `/api/account/*` endpoints exist only for product-level Visitor profile, preferences, saved content, affiliate/referral, and membership-view operations.

The OAuth-only Visitor add-password action is the narrow exception: Questura exposes `/api/account/set-password` as a server adapter because BetterAuth intentionally exposes `setPassword` only through its server API, not as a browser-callable BetterAuth endpoint.

BetterAuth owns Visitor auth email token and flow state. Questura renders and sends verification, reset, and auth-change emails through BetterAuth mail hooks using the existing Resend email feature and Questura-branded templates.

Visitor auth rate limiting is Redis-backed rather than process-local or database-backed in production. Database-backed BetterAuth limits are acceptable only for local/spike work. Limits apply by IP, normalized email, session, and user as appropriate; verification-code sends and attempts are limited separately. Suspicious traffic is throttled first, then challenged with Turnstile/CAPTCHA after configured thresholds, and staff-email attempts in Visitor auth are audit logged.

Before migration work starts, Questura Server will run a BetterAuth spike that proves route-handler integration, same-database table placement, cross-app session cookies, staff-email blocking via Payload `Users`, VisitorProfile creation/linking, and `GET /api/me` current-principal output. The spike does not migrate legacy visitor routes.
