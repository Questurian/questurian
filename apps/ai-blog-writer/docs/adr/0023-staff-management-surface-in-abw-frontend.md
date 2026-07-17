# Staff management surface in ABW frontend over direct Payload Users CRUD

Editorial staffing (creating writers/editors, promoting a writer to editor, self-service Author profile editing) gets a curated surface in the ABW frontend, even though the Payload admin panel already offers user management. ABW is where Staff identities already work and log in (Payload staff JWT), so day-to-day staffing lives there; the Payload admin panel remains the deliberate, rarely used surface for high-stakes acts. The ABW surface calls Payload's `/api/users` REST API directly with the operator's staff JWT, extending ADR-0001's split (AI work → ABW backend; CRUD → Payload direct) — Payload's existing access rules stay the single enforcement point, and ABW adds no backend proxy and no second user store.

## Consequences

- The ABW surface is deliberately narrower than what Payload permits: it creates only `writer` and `editor` roles (never `admin`), offers exactly one role change (admin promotes writer → editor, mirroring the server's only legal transition), and has no delete/offboarding controls in v1. These omissions are on purpose; do not "complete" them without revisiting this ADR.
- New Staff identities are onboarded invite-style: created with a random password that is never displayed, followed by Payload's `forgot-password` email (Resend) so the hire sets their own credentials. No temporary passwords are shared out-of-band.
- Role gating in the ABW UI derives from Payload's `/api/access` response (as `usePermissions` already does for publishing), not from client-side role checks alone.
