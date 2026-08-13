"""Caller credential resolution for image routes.

These routes forward the caller's own Payload JWT so that uploads are created
as the acting Staff user rather than a service account. The token reaches us
either as an `Authorization: Bearer` header or as the `payload-token` session
cookie — `app.core.staff_token` owns that choice and the origin check the
cookie requires. This module only turns "no credential" into the structured,
`step`-carrying error shape the image API has always returned.
"""

from typing import Optional

from fastapi import Depends

from app.core.staff_token import staff_token

from .errors import _raise_http_error


def _extract_bearer_token(authorization: Optional[str]) -> str:
    """Extract and validate the JWT from the Authorization header.

    Retained for callers that hold a raw header string. Routes take
    `require_image_token` instead, which also accepts the session cookie.
    """
    if not authorization or not authorization.startswith('Bearer '):
        _raise_http_error(
            status_code=401,
            message='Authorization header required with Bearer token',
            step='validate_auth',
        )
    token = authorization.replace('Bearer ', '', 1).strip()
    if not token:
        _raise_http_error(
            status_code=401, message='Bearer token is empty', step='validate_auth'
        )
    return token


async def require_image_token(token: Optional[str] = Depends(staff_token)) -> str:
    """Require a staff credential from either the header or the session cookie."""
    if not token:
        _raise_http_error(
            status_code=401,
            message=(
                'A staff session is required: send the payload-token cookie or '
                'an Authorization: Bearer header'
            ),
            step='validate_auth',
        )
    return token
