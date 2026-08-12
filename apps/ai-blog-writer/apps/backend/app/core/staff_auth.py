"""Caller identity for routes that spend money or destroy data.

The shared ABW_API_KEY is a coarse gate: it is inlined into the frontend
bundle, so it proves only that a request came from something that read the
bundle. It cannot say *who* is calling. Routes that start Vertex AI pipeline
runs or wipe run history need an actual identity, which is the Payload staff
session the frontend already holds.

Verification delegates to Payload rather than validating the JWT locally.
This backend has no JWT library and no access to Payload's signing secret,
and Payload is authoritative for whether a session is still valid — a locally
verified signature would still accept a token from a disabled account.
"""

import logging
import os
from typing import Any, Optional

import httpx
from fastapi import Header, HTTPException

logger = logging.getLogger(__name__)

STAFF_AUTH_FLAG = "ABW_REQUIRE_STAFF_AUTH"
PAYLOAD_ME_TIMEOUT_SECONDS = 10.0


def staff_auth_required() -> bool:
    """Whether staff verification is enforced.

    Defaults to off so that enabling it is a deliberate deployment step taken
    once the frontend is sending the session. With it off, these routes behave
    exactly as before.
    """
    raw = os.getenv(STAFF_AUTH_FLAG, "")
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def extract_bearer_token(authorization: Optional[str]) -> Optional[str]:
    """Pull the token out of an `Authorization: Bearer <token>` header."""
    if not authorization:
        return None

    scheme, _, token = authorization.partition(" ")
    if scheme.strip().lower() != "bearer":
        return None

    return token.strip() or None


async def fetch_payload_user(token: str, payload_api_url: str) -> Optional[dict[str, Any]]:
    """Resolve a session token to a Payload user, or None if it is not valid."""
    try:
        async with httpx.AsyncClient(timeout=PAYLOAD_ME_TIMEOUT_SECONDS) as client:
            response = await client.get(
                f"{payload_api_url.rstrip('/')}/api/users/me",
                # Payload's own scheme, matching what this backend already
                # sends elsewhere (see features/images/payload_client.py).
                headers={"Authorization": f"JWT {token}"},
            )
    except httpx.HTTPError:
        logger.exception("Could not reach Payload to verify a staff session")
        raise HTTPException(
            status_code=503,
            detail="Could not verify the session; identity provider unreachable",
        )

    if response.status_code != 200:
        return None

    try:
        body = response.json()
    except ValueError:
        return None

    user = body.get("user") if isinstance(body, dict) else None
    return user if isinstance(user, dict) else None


async def require_staff(
    authorization: Optional[str] = Header(default=None),
) -> Optional[dict[str, Any]]:
    """FastAPI dependency requiring a valid Payload staff session.

    Returns the user so routes can log or authorize further. Returns None when
    the flag is off, in which case nothing is checked.
    """
    if not staff_auth_required():
        return None

    token = extract_bearer_token(authorization)
    if not token:
        raise HTTPException(
            status_code=401,
            detail="Authorization header with a Bearer token is required",
        )

    payload_api_url = os.getenv("PAYLOAD_API_URL", "").strip()
    if not payload_api_url:
        # Enforcement was demanded but cannot be performed. Refusing is the
        # only safe reading: the alternative silently serves the very routes
        # the operator asked to protect.
        logger.error(
            "%s is enabled but PAYLOAD_API_URL is not set; refusing the request",
            STAFF_AUTH_FLAG,
        )
        raise HTTPException(
            status_code=503,
            detail="Session verification is misconfigured",
        )

    user = await fetch_payload_user(token, payload_api_url)
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid or expired session")

    return user
