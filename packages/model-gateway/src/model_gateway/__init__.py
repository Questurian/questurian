"""Which model each job runs on, decided in one place.

Two Python processes in this monorepo call Gemini -- ai-blog-writer's backend
and location-manager's alt-text service -- and each decided its own models
from constants scattered across 22 files and three copies of the rate table.
Moving every call from 3.x to 2.5 touched all of them; one copy was left
holding 3.x prices under 2.5 names, and the alt-text service was missed
entirely for days. Nothing caught either.

Call sites name a **job** -- ``lm.alt_text``, ``p2b.compose`` -- and the
gateway names the model, prices the call, and reports it to the dashboard's
usage collector so no call site can forget to.

It is a library, not a service. A model call must never gain a dependency on
another process being up: a 25-second Gemini call has nothing to gain from an
extra network hop, and a gateway that is down must not mean an app that is
down. The dashboard owns the job-to-model table; this fetches it, caches it,
and falls back to a checked-in default when the dashboard is unreachable.

Resolving one job::

    from model_gateway import model_for

    model_for("lm.alt_text")            # what the next call will run on
    model_for("p2b.compose", override=chosen)   # an operator's own choice

Reporting one call::

    from model_gateway import observe_job_call

    with observe_job_call("lm.alt_text", provider="google-vertex",
                          model=model) as observed:
        response = client.generate(...)
        observed.record_usage(response.usage_metadata)
"""

from __future__ import annotations

from typing import Optional

from .jobs import (
    APP_ABW,
    APP_LM,
    JOBS,
    JOBS_BY_ID,
    Job,
    UnknownJob,
    job,
    jobs_for_app,
)
from .rates import (
    MODEL_RATES,
    ModelRate,
    estimated_cost,
    rate_for,
    rates_payload,
)
from .settings import (
    ModelTable,
    Settings,
    get_settings,
    set_settings,
)
from .substitution import effective_model, substitution_report
from .tokens import normalize_token_usage
from .usage import (
    CallObservation,
    UsageEmitter,
    observe_external_call,
    observe_job_call,
    set_emitter,
)

__version__ = "0.1.0"


def requested_model_for(job_id: str, *, override: Optional[str] = None) -> Optional[str]:
    """The model this job *asks* for, before any substitution.

    Three Prompt2Blog jobs still ask for a Claude model that no Claude path
    can currently serve. Keeping the request readable next to what actually
    serves it is the point -- the old arrangement showed only one of the two.
    """
    return get_settings().model_for(job_id, override=override)


def model_for(job_id: str, *, override: Optional[str] = None) -> Optional[str]:
    """The model that will actually serve this job's next call.

    Returns None for jobs with no model behind them -- the two Places lookups
    -- so a caller that gets None has been told something true rather than
    handed a default that would be a lie.
    """
    return effective_model(requested_model_for(job_id, override=override))


__all__ = [
    "__version__",
    # jobs
    "APP_ABW",
    "APP_LM",
    "JOBS",
    "JOBS_BY_ID",
    "Job",
    "UnknownJob",
    "job",
    "jobs_for_app",
    # resolution
    "model_for",
    "requested_model_for",
    "effective_model",
    "substitution_report",
    # settings
    "ModelTable",
    "Settings",
    "get_settings",
    "set_settings",
    # rates
    "MODEL_RATES",
    "ModelRate",
    "estimated_cost",
    "rate_for",
    "rates_payload",
    "normalize_token_usage",
    # usage reporting
    "CallObservation",
    "UsageEmitter",
    "observe_external_call",
    "observe_job_call",
    "set_emitter",
]
