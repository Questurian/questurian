# Prompt2Blog uses first-class stage nodes and explicit adapters

## Context

Prompt2Blog's route split moved its implementation into a 3,205-line
`services/pipeline.py`. That module still combined option-file loading, source
cleanup, prompts, LLM invocation, quality decisions, Markdown formatting,
tracing, persistence, and execution. Its main generation function was 831
lines.

LangGraph wrapped the entire generation function as one callback node. The run
had LangGraph tracing, but individual pipeline stages were invisible to graph
checkpointing and graph-level failure reporting. Tests patched private names on
the route module, which then copied those replacements into implementation
modules at runtime.

## Decision

Prompt2Blog remains one feature boundary, decomposed internally as follows:

- Pure source, Markdown, editorial-block, and quality logic lives outside the
  application stages.
- Each generation operation is a first-class LangGraph node.
- Nodes communicate through `Prompt2BlogGraphState`.
- LLM calls enter through the `Prompt2BlogLLM` dependency.
- Run lifecycle writes enter through `RunRecorder`.
- API modules import their concrete collaborators directly.
- Tests inject `PipelineDependencies` instead of monkeypatching a route-level
  service locator.

Existing REST contracts, persisted stage names, artifact shapes, token policy,
and canonical `Stage[N]Output` vocabulary remain unchanged.

## Consequences

- A stage can be tested and changed without importing every other Prompt2Blog
  responsibility.
- LangGraph traces expose the actual generation topology rather than one opaque
  callback.
- Failure status is written once through the recorder and retains the active
  persisted stage.
- The dynamic `_sync_compat_overrides` route bridge and the monolithic
  `services/pipeline.py` are removed.
- New Prompt2Blog behavior should normally be added as a focused stage or pure
  domain function; orchestration must remain free of prompt construction and
  persistence details.
