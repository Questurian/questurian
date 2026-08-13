"""Where the Payload staff token comes from, and what makes it trustworthy.

Historically this backend only read `Authorization: Bearer <token>`, which
forced the frontend to hold a readable copy of a privileged Staff credential in
JavaScript. Payload already sets the same JWT as the `httpOnly` `payload-token`
cookie, and once Payload and this backend are siblings under one registrable
domain that cookie reaches us on its own (ADR-0028).

Reading it changes the threat model. A header has to be attached deliberately
by script, so a cross-site page cannot forge one. A cookie is attached by the
browser on *any* request to this origin, including one triggered by a page the
operator did not intend to visit. Accepting the cookie therefore opens a CSRF
surface that has to be closed here, explicitly.

It is **not** closed by `X-API-Key`. That key is inlined into the Vite bundle
and is public; forcing a preflight with a header any attacker can also send is
not an authorization check. The check is the `Origin` header, validated against
the same pinned allowlist that CORS uses.
"""

from typing import Iterable, Optional

from fastapi import Cookie, Header, HTTPException, Request

from app.core.cors import allowed_origins

PAYLOAD_TOKEN_COOKIE = "payload-token"

# Methods that cannot change state. A cross-site page can cause these to be
# sent, but CORS stops it reading the response.
SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})


class StaffTokenRejected(Exception):
    """A token was present but the request was not allowed to use it."""

    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.message = message


def extract_bearer_token(authorization: Optional[str]) -> Optional[str]:
    """Pull the token out of an `Authorization: Bearer <token>` header."""
    if not authorization:
        return None

    scheme, _, token = authorization.partition(" ")
    if scheme.strip().lower() != "bearer":
        return None

    return token.strip() or None


def _origin_is_trusted(origin: Optional[str], allowed_origins: Iterable[str]) -> bool:
    allowed = list(allowed_origins)

    # A wildcard cannot authorize a credentialed request: it would mean
    # trusting every site on the internet with the operator's session. It is
    # also the local-development default, so refusing here is what tells an
    # operator to pin ABW_ALLOWED_ORIGINS rather than leaving cookie auth
    # quietly unprotected. CORSMiddleware already drops
    # `Access-Control-Allow-Credentials` under a wildcard for the same reason.
    if "*" in allowed:
        return False

    if not origin:
        return False

    return origin.rstrip("/") in {candidate.rstrip("/") for candidate in allowed}


def resolve_staff_token(
    *,
    authorization: Optional[str],
    cookie_token: Optional[str],
    method: str,
    origin: Optional[str],
    allowed_origins: Iterable[str],
) -> Optional[str]:
    """Resolve the caller's staff token from the header or the session cookie.

    The header wins when both are present. It is the older contract, it is
    unambiguous, and — unlike the cookie — it cannot have been attached by a
    page the operator did not mean to load, so it needs no origin check.

    A cookie-borne token on a state-changing request must come from an
    allowlisted origin. Raises `StaffTokenRejected` when it does not, rather
    than falling through to "no token": the difference between "you are not
    signed in" and "this request was not allowed to use your session" is worth
    keeping, and silently treating a blocked CSRF attempt as anonymous would
    hide it from the logs.
    """
    header_token = extract_bearer_token(authorization)
    if header_token:
        return header_token

    if not cookie_token:
        return None

    normalized_method = method.upper()

    # Safe methods are checked only when the browser tells us where the request
    # came from. Same-origin GETs legitimately omit `Origin` in some browsers,
    # so requiring it would break a same-origin proxy deployment for no gain:
    # CORS already stops a cross-site page reading the response.
    if normalized_method in SAFE_METHODS and origin is None:
        return cookie_token

    if not _origin_is_trusted(origin, allowed_origins):
        raise StaffTokenRejected(
            status_code=403,
            message=(
                "Cookie-authenticated requests must come from an allowlisted "
                "origin. Set ABW_ALLOWED_ORIGINS to the exact origins that serve "
                "the writer UI; a wildcard cannot authorize a credentialed "
                "request."
            ),
        )

    return cookie_token


async def staff_token(
    request: Request,
    authorization: Optional[str] = Header(default=None),
    payload_token: Optional[str] = Cookie(default=None, alias=PAYLOAD_TOKEN_COOKIE),
) -> Optional[str]:
    """FastAPI dependency yielding the caller's staff token, or None.

    Kept optional so each caller keeps its own "missing credential" behavior:
    the image routes answer with a structured error carrying a `step`, while
    `require_staff` answers with a plain detail string, and a route running with
    staff enforcement off needs no token at all.
    """
    try:
        return resolve_staff_token(
            authorization=authorization,
            cookie_token=payload_token,
            method=request.method,
            origin=request.headers.get("origin"),
            allowed_origins=allowed_origins(),
        )
    except StaffTokenRejected as rejected:
        # A refused origin is reported the same way whichever route asked, so a
        # blocked cross-site attempt reads identically in every log line. The
        # per-route error shapes cover a *missing* credential, which is a
        # different answer.
        raise HTTPException(
            status_code=rejected.status_code, detail=rejected.message
        ) from rejected
