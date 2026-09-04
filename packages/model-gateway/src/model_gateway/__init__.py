"""Which model each job runs on, decided in one place.

Two Python processes in this monorepo call Gemini -- ai-blog-writer's backend
and location-manager's alt-text service -- and until now each one decided its
own models, from constants scattered across 22 files and three separate copies
of the rate table. Moving every call from 3.x to 2.5 touched all of them; one
copy was left holding 3.x prices under 2.5 names, and the alt-text service was
missed entirely for days. Nothing caught either.

This package is the single decision. Call sites name a *job* -- "lm.alt_text",
"p2b.compose" -- and the gateway names the model, prices the call, and reports
it to the dashboard's usage collector so no call site can forget to.

It is a library, not a service. A model call must never gain a dependency on
another process being up: a 25-second Gemini call has nothing to gain from an
extra network hop, and a gateway that is down must not mean an app that is
down. The dashboard owns the job-to-model table and this package fetches it at
startup, caches it, and falls back to a checked-in default when the dashboard
is unreachable. Dashboard down means "apps keep running on what they last
read", never "apps stop".

Nothing is exported yet. This is the packaging skeleton: it exists so both
virtualenvs can import it before there is anything to import. The registry,
rate table, settings client and usage reporting land next.
"""

from __future__ import annotations

__version__ = "0.1.0"

__all__ = ["__version__"]
