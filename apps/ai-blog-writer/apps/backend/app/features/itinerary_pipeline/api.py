"""HTTP for the itinerary day workflow.

Handlers are `def`, not `async def`, for the same reason Prompt2Blog's and the
listicle's are: the ones that call a model block for seconds, and running that
on the event loop freezes the whole server for the length of it.

Only three routes here can spend money -- the two interview turns and the
direction extraction -- and each of them takes an idempotency key. Everything
else is deterministic: building the prompt, validating a paste and saving a
result reach no provider at all. That is a property of the design rather than
of this file, and it is what makes Copy a free action the screen can offer
without hedging.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.staff_auth import require_staff, staff_user_id

from ..prompt2blog.dependencies import DefaultPrompt2BlogLLM
from ..prompt2blog.grill_v4 import GrillUnusableResponse
from app.shared.model_calls import resolve

from . import research, service, store
from .contracts import SetupSnapshot
from .direction import DirectionExtractionFailed
from .validation import MAX_PASTE_BYTES

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/itinerary-pipeline", tags=["itinerary-pipeline"])


class HandoffRequest(BaseModel):
    setup: SetupSnapshot


class SetupUpdateRequest(BaseModel):
    setup: SetupSnapshot
    expected_revision: int | None = Field(default=None, ge=1)


class AttemptRequest(BaseModel):
    """A request that may spend, carrying the key that stops it spending twice."""

    attempt_key: str = Field(min_length=8, max_length=80)


class AnswerRequest(AttemptRequest):
    answer: str = Field(min_length=1, max_length=8000)


class AcceptDirectionRequest(BaseModel):
    revision: int = Field(ge=1)


class PreviewRequest(BaseModel):
    # One megabyte, matched to the validator's own limit so a paste that would
    # be refused there is refused here first, with the same number in the
    # message.
    raw: str = Field(min_length=1, max_length=MAX_PASTE_BYTES)


class ApplyRequest(PreviewRequest):
    content_hash: str = Field(min_length=8, max_length=128)
    import_key: str = Field(min_length=8, max_length=80)


class ReviewRequest(BaseModel):
    notes: str = Field(default="", max_length=20000)
    evidence_reviewed: bool = False


def _owner(staff: Any) -> str:
    """The caller's identity, or empty when staff auth is switched off."""
    return staff_user_id(staff) or ""


def _llm():
    return DefaultPrompt2BlogLLM()


def _guard(work, *args, **kwargs):
    """One place where this feature's exceptions become HTTP.

    Each mapping is a different next step for the operator, which is the whole
    reason they are separate exceptions rather than one message: 404 means the
    thing is not there, 409 means somebody moved it, 502 means the model did
    not answer usefully and trying again is reasonable.
    """
    try:
        return work(*args, **kwargs)
    except store.NotOwned as error:
        raise HTTPException(status_code=403, detail=str(error)) from error
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except store.RevisionConflict as error:
        raise HTTPException(
            status_code=409,
            detail=str(error),
            headers={"X-Itinerary-Revision": str(error.current_revision)},
        ) from error
    except service.DuplicateAttempt as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    except service.Stale as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    except GrillUnusableResponse as error:
        logger.warning("Itinerary grill returned nothing usable: %s", error.raw[:400])
        raise HTTPException(
            status_code=502,
            detail="The interview could not decide what to ask next. Try again.",
        ) from error
    except DirectionExtractionFailed as error:
        raise HTTPException(
            status_code=502,
            detail=(
                "The direction could not be written down from the conversation. "
                "The conversation is untouched — try again."
            ),
        ) from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


# ----------------------------------------------------------- the workspace --


@router.post("/workspaces")
def create_workspace(req: HandoffRequest, staff=Depends(require_staff)):
    """Take a browser-held setup into the backend. Idempotent on the draft."""

    def work():
        workspace_id, revision = service.handoff(setup=req.setup, owner_id=_owner(staff))
        setup, current = service.require_workspace(workspace_id, _owner(staff))
        return service.workspace_view(
            workspace_id=workspace_id, setup=setup, workspace_revision=current
        )

    return _guard(work)


@router.get("/workspaces/{workspace_id}")
def read_workspace(workspace_id: str, staff=Depends(require_staff)):
    def work():
        setup, revision = service.require_workspace(workspace_id, _owner(staff))
        return service.workspace_view(
            workspace_id=workspace_id, setup=setup, workspace_revision=revision
        )

    return _guard(work)


@router.patch("/workspaces/{workspace_id}/setup")
def patch_setup(
    workspace_id: str, req: SetupUpdateRequest, staff=Depends(require_staff)
):
    """A versioned setup change. Saving an unchanged setup is a no-op."""

    def work():
        service.require_workspace(workspace_id, _owner(staff))
        revision = service.update_setup(
            workspace_id, req.setup, expected_revision=req.expected_revision
        )
        setup, current = service.require_workspace(workspace_id, _owner(staff))
        return service.workspace_view(
            workspace_id=workspace_id, setup=setup, workspace_revision=current or revision
        )

    return _guard(work)


def _day(workspace_id: str, day_id: str, staff) -> dict[str, Any]:
    setup, revision = service.require_workspace(workspace_id, _owner(staff))
    return service.day_view(
        workspace_id=workspace_id,
        setup=setup,
        workspace_revision=revision,
        day_id=day_id,
    )


@router.get("/workspaces/{workspace_id}/days/{day_id}")
def read_day(workspace_id: str, day_id: str, staff=Depends(require_staff)):
    return _guard(_day, workspace_id, day_id, staff)


# ---------------------------------------------------------------- the grill --


@router.post("/workspaces/{workspace_id}/days/{day_id}/grill/start")
def start_grill(
    workspace_id: str, day_id: str, req: AttemptRequest, staff=Depends(require_staff)
):
    def work():
        setup, _revision = service.require_workspace(workspace_id, _owner(staff))
        service.start_grill(
            workspace_id=workspace_id,
            setup=setup,
            day_id=day_id,
            attempt_key=req.attempt_key,
            llm=_llm(),
        )
        return _day(workspace_id, day_id, staff)

    return _guard(work)


@router.post("/workspaces/{workspace_id}/days/{day_id}/grill/answer")
def answer_grill(
    workspace_id: str, day_id: str, req: AnswerRequest, staff=Depends(require_staff)
):
    def work():
        setup, _revision = service.require_workspace(workspace_id, _owner(staff))
        service.answer_grill(
            workspace_id=workspace_id,
            setup=setup,
            day_id=day_id,
            answer=req.answer,
            attempt_key=req.attempt_key,
            llm=_llm(),
        )
        return _day(workspace_id, day_id, staff)

    return _guard(work)


@router.post("/workspaces/{workspace_id}/days/{day_id}/grill/reopen")
def reopen_grill(
    workspace_id: str, day_id: str, req: AttemptRequest, staff=Depends(require_staff)
):
    def work():
        setup, _revision = service.require_workspace(workspace_id, _owner(staff))
        service.reopen_grill(
            workspace_id=workspace_id,
            setup=setup,
            day_id=day_id,
            attempt_key=req.attempt_key,
            llm=_llm(),
        )
        return _day(workspace_id, day_id, staff)

    return _guard(work)


# ------------------------------------------------------------ the direction --


@router.post("/workspaces/{workspace_id}/days/{day_id}/direction/prepare")
def prepare_direction(
    workspace_id: str, day_id: str, req: AttemptRequest, staff=Depends(require_staff)
):
    def work():
        setup, _revision = service.require_workspace(workspace_id, _owner(staff))
        service.prepare_direction(
            workspace_id=workspace_id,
            setup=setup,
            day_id=day_id,
            attempt_key=req.attempt_key,
            llm=_llm(),
        )
        return _day(workspace_id, day_id, staff)

    return _guard(work)


@router.post("/workspaces/{workspace_id}/days/{day_id}/direction/accept")
def accept_direction(
    workspace_id: str,
    day_id: str,
    req: AcceptDirectionRequest,
    staff=Depends(require_staff),
):
    """Accept the candidate that was on screen. Costs nothing."""

    def work():
        setup, _revision = service.require_workspace(workspace_id, _owner(staff))
        service.accept_direction(
            workspace_id=workspace_id,
            setup=setup,
            day_id=day_id,
            revision=req.revision,
        )
        return _day(workspace_id, day_id, staff)

    return _guard(work)


# ---------------------------------------------------------------- the export --


@router.post("/workspaces/{workspace_id}/days/{day_id}/exports")
def create_export(workspace_id: str, day_id: str, staff=Depends(require_staff)):
    """Build the copyable prompt. No model call; the same day returns the same
    export rather than minting a second identity for one request."""

    def work():
        setup, revision = service.require_workspace(workspace_id, _owner(staff))
        service.prepare_export(
            workspace_id=workspace_id,
            setup=setup,
            workspace_revision=revision,
            day_id=day_id,
        )
        return _day(workspace_id, day_id, staff)

    return _guard(work)


# -------------------------------------------------------------- the research --


@router.post("/workspaces/{workspace_id}/days/{day_id}/research", status_code=202)
def research_the_day(
    workspace_id: str,
    day_id: str,
    req: AttemptRequest,
    background: BackgroundTasks,
    staff=Depends(require_staff),
):
    """Run this day's prompt on the subscription, with the web and a schema.

    202, not 200. The claim on the day is written synchronously, before this
    returns, so a double click finds it already there; the research itself is
    minutes of searching and reading and runs in the background. The page polls
    the day, which starts nothing.

    What comes back is not saved. It lands in the import panel as a preview the
    operator confirms, exactly as a pasted answer would -- one validator, one
    review, one Save.
    """

    def work():
        setup, _revision = service.require_workspace(workspace_id, _owner(staff))
        export = service.start_research(
            workspace_id=workspace_id,
            setup=setup,
            day_id=day_id,
            attempt_key=req.attempt_key,
        )
        background.add_task(
            service.run_research,
            attempt_key=req.attempt_key,
            export=export,
            model_name=resolve(research.RESEARCH_JOB),
            call=research.default_transport(),
        )
        return _day(workspace_id, day_id, staff)

    return _guard(work)


# ---------------------------------------------------------------- the import --


@router.post("/workspaces/{workspace_id}/days/{day_id}/imports/preview")
def preview_import(
    workspace_id: str, day_id: str, req: PreviewRequest, staff=Depends(require_staff)
):
    def work():
        setup, _revision = service.require_workspace(workspace_id, _owner(staff))
        preview = service.preview_import(
            workspace_id=workspace_id, setup=setup, day_id=day_id, raw=req.raw
        )
        return {
            "valid": preview["valid"],
            "report": preview["report"].model_dump(),
            "result": (
                None
                if preview["result"] is None
                else preview["result"].model_dump(by_alias=True)
            ),
            "content_hash": preview["content_hash"],
            "export_id": preview["export_id"],
            "changes": preview["changes"],
            "repair_prompt": preview["repair_prompt"],
            # Whether this text is, unedited, what an in-app run returned --
            # which is the only case in which the run's telemetry applies.
            "from_research_run": preview["from_research_run"],
        }

    return _guard(work)


@router.post("/workspaces/{workspace_id}/days/{day_id}/imports/apply")
def apply_import(
    workspace_id: str, day_id: str, req: ApplyRequest, staff=Depends(require_staff)
):
    """Save the previewed result, once, re-checked against current state."""

    def work():
        setup, _revision = service.require_workspace(workspace_id, _owner(staff))
        _stored, created = service.apply_import(
            workspace_id=workspace_id,
            setup=setup,
            day_id=day_id,
            raw=req.raw,
            expected_content_hash=req.content_hash,
            import_key=req.import_key,
        )
        view = _day(workspace_id, day_id, staff)
        # Said out loud, because a duplicate save and a first save look
        # identical on screen otherwise, and an operator who cannot tell them
        # apart cannot tell whether their click landed.
        view["created"] = created
        return view

    return _guard(work)


@router.post("/workspaces/{workspace_id}/days/{day_id}/review")
def save_review(
    workspace_id: str, day_id: str, req: ReviewRequest, staff=Depends(require_staff)
):
    """The operator's own reading. Never rewrites a claim."""

    def work():
        service.require_workspace(workspace_id, _owner(staff))
        store.save_review(
            workspace_id,
            day_id,
            notes=req.notes,
            evidence_reviewed=req.evidence_reviewed,
        )
        return _day(workspace_id, day_id, staff)

    return _guard(work)
