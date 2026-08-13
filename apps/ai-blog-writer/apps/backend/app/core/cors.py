"""The pinned browser-origin allowlist.

Extracted from `app.main` so that request-authentication code can consult the
same list without importing the application module (which builds the FastAPI
app and loads `.env` at import time). `app.main` re-exports these names, so the
historical import paths keep working.

This one list now decides two things: which origins CORS answers, and which
origins may authenticate with the `payload-token` cookie (see
`app.core.staff_token`). Widening it widens both.
"""

import os

CORS_DENY_ALL = "none"


def resolve_cors_origins(api_key: str, raw_origins: str) -> list[str]:
    """Resolve the CORS allow-list, refusing a wildcard on deployed instances.

    A configured ABW_API_KEY is the signal that this instance is reachable
    beyond localhost. Wildcard CORS there is incoherent: it forces
    `allow_credentials=False`, and the X-API-Key header makes every request
    preflighted, so any page could probe the API. Refuse to start instead of
    serving an open origin policy.

    An instance with no browser client at all (server-to-server, or a frontend
    served same-origin behind a proxy) sets ABW_ALLOWED_ORIGINS=none to say so
    explicitly. That is a deny-all list, not an oversight.

    With no key configured (local development) the historical behavior is
    kept exactly: wildcard when the variable is unset, otherwise whatever
    parses out of it. Note that a wildcard also disables cookie authentication,
    so local development that exercises the session cookie has to pin its
    origins — see `app.core.staff_token`.
    """
    raw = raw_origins.strip()

    if raw.lower() == CORS_DENY_ALL:
        return []

    origins = [origin.strip() for origin in raw.split(",") if origin.strip()]

    if not api_key.strip():
        # Emptiness is judged on the raw string, not the parsed list, so a
        # malformed value like "," keeps denying all origins rather than
        # silently widening to a wildcard.
        return ["*"] if not raw else origins

    if not origins or "*" in origins:
        raise ValueError(
            "ABW_ALLOWED_ORIGINS must list explicit origins when ABW_API_KEY "
            "is set; wildcard CORS is not allowed on a deployed instance. "
            f"Set ABW_ALLOWED_ORIGINS={CORS_DENY_ALL} if this instance has no "
            "browser client."
        )

    return origins


def resolve_cors_config(
    api_key: str, raw_origins: str
) -> tuple[list[str], "ValueError | None"]:
    """Pair the resolved origins with any rejection, without raising.

    A rejected policy yields a deny-all list so the middleware fails closed,
    plus the error for `lifespan` to refuse the boot with. Import stays safe
    either way.
    """
    try:
        return resolve_cors_origins(api_key, raw_origins), None
    except ValueError as exc:
        return [], exc


def allowed_origins() -> list[str]:
    """Read the CORS policy from the environment. See resolve_cors_origins.

    Read per call rather than cached, so a test that stubs the environment
    sees its own policy without reimporting the application module.
    """
    return resolve_cors_origins(
        api_key=os.getenv("ABW_API_KEY", ""),
        raw_origins=os.getenv("ABW_ALLOWED_ORIGINS", ""),
    )
