"""Text LLM backed by the Claude Code CLI's subscription login.

``get_vertex_llm`` picks a provider per call from the model name and builds a
fresh object every time -- no caching, no module singleton, no shared state --
so a pipeline run already mixes providers freely. This adds a third one beside
Vertex and the Anthropic API, reachable only when
``CLAUDE_SUBSCRIPTION_MODELS_ENABLED`` is on.

The contract every caller in this codebase relies on is three members::

    .invoke(prompt) -> str
    .model_name
    .last_usage_metadata

That is all this class promises. There is no LangChain here, the same way
``ClaudeTextLLM`` has none.

Why it delegates rather than shells out itself
----------------------------------------------
``app.features.claude_connection.cli_writer`` already owns the argument
building, the isolation flags, the allow-listed model aliases, the closed
stdin, and -- the part that matters most -- the refusal to send at all unless
``GET /claude/status`` is green. Re-implementing any of that here would mean two
places that can disagree about whether a call is safe to make, and the one that
would drift is the copy. So this is a thin adapter over that transport.

That makes this the one module in ``packages/utils`` that reaches up into the
backend app, which is backwards. It is a deliberate, single, lazily-taken
import rather than a layering the rest of the package follows: the transport
cannot move down here without dragging the whole Claude status reader with it,
and the default path never touches this module at all.
"""

from typing import Any, Optional


class ClaudeCliUnavailable(RuntimeError):
    """The CLI transport could not be imported or could not answer.

    ``kind`` carries the transport's own classification through unchanged --
    ``quota_exhausted``, ``not_connected``, ``provider_unavailable`` or
    ``invalid_response``. Flattening the transport error to its message, which
    is what this did before, is what left the pipeline unable to tell an
    exhausted account from an unusable answer.
    """

    def __init__(self, message: str, *, kind: str = "invalid_response") -> None:
        super().__init__(message)
        self.kind = kind


def _transport() -> Any:
    """The CLI writer module, imported at call time.

    Lazy so that importing ``utils`` from a context without the backend app on
    the path -- a script, a converter process -- does not fail on an import it
    was never going to use.
    """
    try:
        from app.features.claude_connection import cli_writer
    except ImportError as error:  # pragma: no cover - packaging failure
        raise ClaudeCliUnavailable(
            "The Claude CLI writer transport is not importable here.",
            kind="not_connected",
        ) from error
    return cli_writer


# The transport reports usage in the shape its HTTP responses use. The token
# tracker reads snake_case. Translating here keeps the API surface and the
# accounting surface from having to agree on one spelling.
_USAGE_KEYS = (
    ("inputTokens", "input_tokens"),
    ("outputTokens", "output_tokens"),
    ("cacheReadInputTokens", "cache_read_input_tokens"),
    ("cacheCreationInputTokens", "cache_creation_input_tokens"),
)


def _usage_metadata(usage: Optional[dict[str, Any]]) -> Optional[dict[str, Any]]:
    """Carry the CLI's own token counts through under the tracker's names.

    ``input_tokens`` and ``output_tokens`` are the keys the existing usage
    normalizer already reads, so token totals land in the per-run tracker with
    no further wiring. The two cache figures stay flat, the way the CLI reports
    them; nothing reads them under those names yet, so cache savings are still
    invisible on this provider -- a separate fix, not a silent re-shaping here.

    Note what these numbers mean before comparing them to Gemini's:
    ``input_tokens`` counts only the uncached prompt. The cached prefix sits in
    the two cache fields and is not folded in.
    """
    if not isinstance(usage, dict):
        return None
    carried = {
        target: usage[source]
        for source, target in _USAGE_KEYS
        if isinstance(usage.get(source), int) and not isinstance(usage[source], bool)
    }
    return carried or None


class ClaudeCliTextLLM:
    """One writer call, answered on the machine's Claude subscription.

    ``temperature`` and ``max_tokens`` are accepted and dropped rather than
    faked: the CLI has no flag for either. The output cap is whatever the
    model's own default is, which is roomier than anything the pipeline asks
    for (stages request ~6k and the shared floor already widens that to 64k),
    so nothing is being silently truncated. See the smoke-test README.
    """

    def __init__(
        self,
        *,
        model_name: str,
        max_tokens: int,
        temperature: Optional[float] = None,
    ) -> None:
        self.model_name = model_name
        self.max_tokens = max_tokens
        self.temperature = temperature
        self.last_usage_metadata: Optional[dict[str, Any]] = None
        # The CLI is the only provider here that reports a per-call price. It
        # is a notional API-equivalent figure rather than money leaving an
        # account -- subscription calls draw plan allowance -- but it is
        # measured, per call, and it is the only cost signal this provider has.
        self.last_cost_usd: Optional[float] = None

    def invoke(self, prompt: str) -> str:
        return self._call(prompt, None)["text"]

    def invoke_json(
        self,
        prompt: str,
        *,
        input_schema: dict[str, Any],
        max_tokens: int | None = None,
        thinking_budget: int | None = None,
    ) -> Any:
        """Ask for JSON the transport validates, rather than JSON to parse.

        `max_tokens` and `thinking_budget` are accepted and ignored. The CLI
        takes neither: it has no output ceiling flag and no temperature or
        thinking control. Accepting them keeps one call signature across
        providers, so the caller does not have to know which provider it got --
        and silently dropping an output ceiling is exactly what truncated
        structuring on the Gemini path, so it is written down here rather than
        discovered again.

        Present only on this provider, and callers detect it by asking whether
        it exists. That is what keeps the schema path opt-in per provider: a
        caller that finds no such method keeps asking in prose and parsing the
        answer, exactly as before.

        The reply comes from the CLI's ``structured_output``, which is the
        object it validated -- not ``result``, which is a string the model
        wrote. Both carry the same JSON and only one of them is a guarantee.
        """
        return self._call(prompt, input_schema)["payload"]

    def _call(
        self,
        prompt: str,
        input_schema: Optional[dict[str, Any]],
    ) -> dict[str, Any]:
        cli_writer = _transport()
        try:
            if input_schema is None:
                result = cli_writer.invoke_text(
                    prompt=prompt, model_name=self.model_name
                )
            else:
                result = cli_writer.invoke_structured(
                    prompt=prompt,
                    input_schema=input_schema,
                    model_name=self.model_name,
                )
        except cli_writer.ClaudeCliWriterError as error:
            raise ClaudeCliUnavailable(
                str(error),
                kind=getattr(error, "kind", "invalid_response"),
            ) from error

        # The alias asked for is not the model that answered: 'sonnet' is a
        # moving target, so a spend record keyed on it would not say what it
        # paid for.
        self.model_name = result.get("modelName") or self.model_name
        self.last_usage_metadata = _usage_metadata(result.get("usage"))
        self.last_cost_usd = result.get("costUsd")
        return result
