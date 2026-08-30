"""Endpoints for pipelines that are switched off, not broken.

URL2Blog and YouTube2Blog were retired in ADR 0032. They shared the tone
profiles and the anti-AI voice rules with Prompt2Blog, and the v4 rework
changes both. Left mounted they would have looked completely usable and failed
mid-run, or worse, quietly produced worse articles against half-changed rules.

They answer here instead, with a status that says what happened. The code is in
git history; they are rebuilt on the v4 foundation rather than patched onto it.
"""

from fastapi import APIRouter
from fastapi.responses import JSONResponse

router = APIRouter()

_RETIRED = {
    "error": "pipeline_retired",
    "detail": (
        "This pipeline is retired while Prompt2Blog is rebuilt as v4. It is not "
        "broken and it is not coming back in this form: it will be rebuilt on "
        "the v4 foundation. See ADR 0032."
    ),
}


def _retired() -> JSONResponse:
    # 410 rather than 404: the route existed, the decision was deliberate, and a
    # caller should stop retrying rather than assume a typo.
    return JSONResponse(_RETIRED, status_code=410)


@router.api_route(
    "/url2blog/{path:path}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    include_in_schema=False,
)
async def url2blog_retired(path: str) -> JSONResponse:
    return _retired()


@router.api_route(
    "/youtube2blog/{path:path}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    include_in_schema=False,
)
async def youtube2blog_retired(path: str) -> JSONResponse:
    return _retired()
