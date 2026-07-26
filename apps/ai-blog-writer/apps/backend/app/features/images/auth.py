"""Authentication header validation for image routes."""

from typing import Optional

from .errors import _raise_http_error


def _extract_bearer_token(authorization: Optional[str]) -> str:
    """Extract and validate the JWT from the Authorization header."""
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
