# Model Gateway

One place that decides which model a job runs on, for every Python process in
this monorepo.

Call sites name a **job** — `lm.alt_text`, `p2b.compose` — and never a model.
The gateway resolves the job to a model, prices the call, and reports it to the
dashboard's usage collector so no call site can forget to.

## Why this is a package and not a service

A model call must never gain a dependency on another process being up. A
25-second Gemini call has nothing to gain from an extra network hop, and a
gateway that is down must not mean an app that is down.

The dashboard owns the job-to-model table. The gateway fetches it, caches it,
and falls back to a checked-in default when the dashboard is unreachable.
Dashboard down means "apps keep running on what they last read", never "apps
stop".

## Who imports it

Two processes in this repo call Gemini. Nothing else does.

| App | Process | Port |
|---|---|---|
| ai-blog-writer | `apps/backend` (FastAPI) | 4003 |
| location-manager | `packages/python-alt-text` (FastAPI) | 8642 |

Location Manager's Bun server calls Google Places and geocoding only. The
dashboard collects usage and makes no model calls. Questura is out of scope.

## How it reaches both virtualenvs

The two apps have separate virtualenvs and unlike run mechanics — one extends
`PYTHONPATH` from an Nx target, the other runs `uvicorn` from its own directory
with no path extension at all. What they do share is that both create their
venv with `uv` and install from a `requirements.txt`.

So the gateway installs **editable, from each app's `requirements.txt`**:

```
apps/ai-blog-writer/apps/backend/requirements.txt
    -e ../../packages/model-gateway

apps/location-manager/packages/python-alt-text/requirements.txt
    -e ../../../../packages/model-gateway
```

Two things about those paths:

- **They are relative to the working directory the install runs from, not to
  the requirements file.** That is `apps/ai-blog-writer` for the first and
  `apps/location-manager/packages/python-alt-text` for the second. This was
  verified against `uv 0.9.30` rather than assumed; pip and uv have differed
  here in the past.
- **Editable means both venvs import this same source tree.** An edit here is
  live in both apps without reinstalling — which is the point, since the whole
  failure this package exists to prevent is a model decision changed in one
  place and missed in another.

`dev:clean` in either app recreates the venv from `requirements.txt`, so the
gateway comes back with everything else. No extra step.

### The stale-venv guards

Both apps skip reinstalling when the venv already looks usable, and both decide
that by importing a few names. `model_gateway` is in both lists, so a venv
predating the gateway counts as stale instead of silently starting without it:

- `apps/ai-blog-writer/scripts/ensure-python-deps.sh` — `required_modules`
- `apps/location-manager/packages/python-alt-text/package.json` — `py:ensure`

Add to those lists if this package ever grows a dependency that can go missing.

### Docker

`apps/ai-blog-writer/apps/backend/Dockerfile` builds with `apps/ai-blog-writer`
as its context, which the editable path escapes. That break is annotated in the
Dockerfile itself. The Docker setup has not been touched since PR #31 and local
development does not use it; fixing the context or deleting the setup is a
deliberate decision, not something to patch around here.

## Dependencies

None, on purpose. This package is imported by two services with unlike
dependency sets; anything added here is added to both. It talks to the
dashboard over the standard library and leaves provider SDKs to the caller.

## Status

Phase 0: the packaging skeleton. It installs and imports in both venvs and
nothing imports it yet. The job registry, rate table, settings client and usage
reporting land next.
