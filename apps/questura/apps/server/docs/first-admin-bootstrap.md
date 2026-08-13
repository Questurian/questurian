# Creating the first admin on a new deployment

A fresh environment has an empty `users` table and therefore no administrator.
Payload allows exactly one unauthenticated write to close that gap — the
first-user create — and `firstUserPromotionHook` forces that account to `admin`.

That window is guarded by a bootstrap token. Without it, the first request to
reach a newly deployed server becomes the administrator.

## Procedure

**1. Generate a secret and set it in the server's environment before first boot.**

```bash
openssl rand -hex 32
```

```
BOOTSTRAP_ADMIN_TOKEN=<the generated value>
```

**2. Create the admin, presenting the token as a header.**

```bash
curl -X POST https://<your-backend-host>/api/users \
  -H 'Content-Type: application/json' \
  -H 'x-bootstrap-token: <the generated value>' \
  -d '{
    "email": "you@questurian.com",
    "password": "<a strong password>",
    "firstName": "…",
    "lastName": "…"
  }'
```

`role` is ignored here — the first account is promoted to `admin` regardless.
The password must satisfy `shared/lib/password-strength`.

**3. Unset `BOOTSTRAP_ADMIN_TOKEN` and restart.**

Leaving it set leaves a standing admin-creation credential in the environment.
It is useless once a user exists — the empty-collection precondition no longer
holds — but there is no reason to keep it.

## Why a header rather than the admin panel

Payload's built-in *create first user* screen cannot attach a custom header, so
the bootstrap request has to be made with `curl` (or any HTTP client). A
`bootstrapToken` property on the JSON body is accepted as a fallback for clients
that cannot set headers; it is not a stored field.

## Behaviour by environment

| Environment | `BOOTSTRAP_ADMIN_TOKEN` | First-user create |
|---|---|---|
| Production | set | Allowed only with a matching token |
| Production | unset | **Refused**, with one explanatory log per server process |
| Development | set | Enforced, exactly as production — use this to rehearse |
| Development | unset | Allowed, unchanged from before this guard existed |

Local development is deliberately untouched: a localhost database is not the
asset being protected, and requiring a token on every fresh checkout would add
friction with no security benefit.

## Related first-deploy requirements

This is one of three things a first production boot needs. The other two come
from the URL fail-fast in `shared/config/assert-production-config.ts`, which
refuses to boot unless `NEXT_PUBLIC_APP_URL` and `BACKEND_URL_LOCAL` are set to
non-localhost values and at least one CORS origin is configured.
