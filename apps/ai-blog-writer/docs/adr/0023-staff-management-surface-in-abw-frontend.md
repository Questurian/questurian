# Staff management surface in ABW frontend over direct Payload Users CRUD

Editorial staffing (creating writers/editors, promoting a writer to editor, self-service Author profile editing) gets a curated surface in the ABW frontend, even though the Payload admin panel already offers user management. ABW is where Staff identities already work and log in (Payload staff JWT), so day-to-day staffing lives there; the Payload admin panel remains the deliberate, rarely used surface for high-stakes acts. The ABW surface calls Payload's `/api/users` REST API directly with the operator's staff JWT, extending ADR-0001's split (AI work → ABW backend; CRUD → Payload direct) — Payload's existing access rules stay the single enforcement point, and ABW adds no backend proxy and no second user store.

## Consequences

- The ABW surface is deliberately narrower than what Payload permits: it creates only `writer` and `editor` roles (never `admin`), offers exactly one role change (admin promotes writer → editor, mirroring the server's only legal transition), and has no delete/offboarding controls in v1. These omissions are on purpose; do not "complete" them without revisiting this ADR.
- New Staff identities are onboarded invite-style: created with a random password that is never displayed, followed by Payload's `forgot-password` email (Resend) so the hire sets their own credentials. No temporary passwords are shared out-of-band.
- Role gating in the ABW UI derives from Payload's `/api/access` response (as `usePermissions` already does for publishing), not from client-side role checks alone.

## Amended 2026-08-21: the surface splits in two, and editors get one half

This ADR said the omissions above were on purpose and should not be "completed" without revisiting it.
This is that revisit, and it changes exactly one of them.

Staff management stays admin-only and stays as narrow as described above. What is added beside it is a
second surface — the **Author Directory** — that operates on `authors` and never on `users`. Editors
reach it; admins reach both. See Questura ADR-0011 for the access rule it sits on.

The split is what makes the widening safe, and it falls out of a constraint rather than taste: an editor
can read no Staff identity but their own (`collectionLevel.ts` `read`), so an editor-facing *staff* list
is not buildable without widening `Users.read` — which was rejected. An editor-facing *author* list needs
nothing new, because `Authors.read` is already open to all active staff. The surface that could be built
without widening a credential store is the surface that should exist.

- The Author Directory lists only what the caller may edit, by sending the same filter the server's
  access rule applies. That is a UI convenience and duplicated logic; Payload stays the enforcement point,
  and the duplication is accepted because the alternative is showing editors rows that 403 on save.
- `ProfileEditor` stops taking `variant: 'self' | 'admin'` and takes explicit capability flags instead.
  `variant` conflated who-am-I with what-may-I-do and was already carrying four privileges in one enum
  member; a third tier is where that stops scaling.
- `ProfileEditor` addresses its subject as a union — by Staff identity id, or by Author id — because both
  ADR-0007 null-sides are real: a hire who has never published has no Author (the form creates one on
  first save), and an orphan byline has no Staff identity to name it by. Neither key alone spans the domain.
- Still not added, still on purpose: no delete, no offboarding, and no `admin` creation from this app.

### The `/api/access` signal for "editor or admin"

`authors.update` cannot carry this gate: an editor and a writer both come back as
`{ permission: true, where: {...} }` and only an admin as strict `true`, so the response the Author
Directory most obviously wants is the one response that cannot distinguish its two audiences.

The gate is taken from `articles.update === true` instead, which is strict `true` for editor and admin
and a `where` for a writer — the same distinction `canManagePublished` already computes and caches. So
this ADR's "derive from `/api/access`, not from client-side role" rule holds without a new request and
without a role check. The coupling is real and worth stating: the Author Directory becomes visible to
whoever may update any article. If those two ever need to diverge, this gate needs its own signal, not
a role literal.
