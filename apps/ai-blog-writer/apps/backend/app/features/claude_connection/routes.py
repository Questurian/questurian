"""Claude connection routes: report the login, and offer to start a new one."""

import logging
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from app.core.staff_auth import require_staff
from app.features.claude_connection import login as login_module
from app.features.claude_connection import messaging
from app.features.claude_connection.login import ENABLE_LOGIN_ENV
from app.features.claude_connection.status import (
    STATE_CONNECTED,
    read_claude_status,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/claude", tags=["claude"])


def _client_host(request: Request) -> Optional[str]:
    return request.client.host if request.client else None


@router.get("/status")
def claude_status(
    request: Request,
    _staff: Optional[dict[str, Any]] = Depends(require_staff),
) -> dict[str, Any]:
    """Whether this machine can reach Claude on the owner's subscription.

    Defined with `def` rather than `async def` on purpose: it shells out to the
    Claude CLI, and FastAPI runs sync endpoints in a worker thread, so a slow
    or hung CLI cannot stall the event loop the pipelines run on.
    """
    host = _client_host(request)
    snapshot = read_claude_status()
    snapshot["loginAvailable"] = login_module.login_available(host)
    snapshot["loginCommand"] = login_module.login_command(snapshot.get("cliPath"))
    return snapshot


@router.post("/login")
def start_claude_login(
    request: Request,
    _staff: Optional[dict[str, Any]] = Depends(require_staff),
) -> dict[str, Any]:
    """Open a terminal running `claude auth login --claudeai` on this machine.

    Returns the command it started so the UI can show it either way. No part of
    the sign-in passes through this process -- see `login.py` for why.
    """
    host = _client_host(request)
    command = login_module.login_command()

    if not login_module.login_enabled():
        raise HTTPException(
            status_code=403,
            detail=(
                f"Starting a Claude sign-in is disabled here ({ENABLE_LOGIN_ENV}). "
                f"Run `{command}` on the machine hosting this backend."
            ),
        )

    if not login_module.launcher_supported():
        raise HTTPException(
            status_code=501,
            detail=(
                "This app can only open a sign-in terminal on macOS. Run "
                f"`{command}` on the machine hosting this backend."
            ),
        )

    if not login_module.login_available(host):
        raise HTTPException(
            status_code=403,
            detail=(
                "A Claude sign-in can only be started from a browser on the "
                "machine hosting this backend, because it signs in that machine "
                f"rather than you. Run `{command}` there instead."
            ),
        )

    try:
        started = login_module.launch_login()
    except RuntimeError as error:
        logger.warning("Claude sign-in launch failed: %s", error)
        raise HTTPException(status_code=502, detail=str(error)) from error

    return {
        "started": True,
        "command": started,
        "detail": (
            "A terminal is opening. Finish signing in there, then re-check the "
            "connection."
        ),
    }


class TestMessageRequest(BaseModel):
    """One question for the bench. Not a pipeline request."""

    prompt: str
    model: Optional[str] = None
    # Carried from the previous reply to continue the same conversation. Also
    # much cheaper: the system prompt becomes a cache read rather than a cache
    # write, which on a first measurement was the difference between 3.7 and
    # 0.3 cents a message.
    sessionId: Optional[str] = None


@router.get("/models")
def claude_models() -> dict[str, Any]:
    """Models the bench will accept. An allow-list, not a catalogue."""
    return {"models": [dict(choice) for choice in messaging.MODEL_CHOICES]}


@router.post("/test-message")
def send_claude_test_message(
    body: TestMessageRequest,
    _staff: Optional[dict[str, Any]] = Depends(require_staff),
) -> dict[str, Any]:
    """Send one message to Claude and report the answer, the model, and the cost.

    Refuses unless the connection is green. The state this is guarding against
    is `api_billed_override`: Claude would still answer, but the spend would
    land on API billing instead of the subscription, and a bench that quietly
    charges the wrong account is worse than one that will not run.
    """
    snapshot = read_claude_status()
    if snapshot["state"] != STATE_CONNECTED:
        raise HTTPException(
            status_code=409,
            detail=(
                snapshot["detail"]
                or "Claude is not connected on this machine, so nothing was sent."
            ),
        )

    try:
        return messaging.send_test_message(
            prompt=body.prompt,
            model_id=body.model,
            session_id=body.sessionId,
        )
    except messaging.TestMessageError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
