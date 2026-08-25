from __future__ import annotations

from typing import Any

from app.shared.prompts import ANTI_AI_TELLS_FULL

from ...dependencies import PipelineDependencies
from ...graph.state import Prompt2BlogV3GraphState
from ...observability import _append_stage_trace
from ...prompts.editorial_v3 import P2B_V3_COMPOSE_PROMPT
from ...prompts.generation import SEO_SAFE_CONTENT_GENERATION_GUIDELINES
from ...quality import _sanitize_rewrite
from ...schemas import REWRITE_SCHEMA
from ...support import _format_style_directive


def run_v3_compose_stage(
    state: Prompt2BlogV3GraphState,
    dependencies: PipelineDependencies,
) -> dict[str, Any]:
    """Write the article from the instruction stack and the evidence records.

    Compose never sees cleaned source prose or supplemental material, because
    v3 has neither. Its only permitted facts are the claims the researcher
    supplied, which is what makes grounding a comparison rather than a guess.
    """
    stage = "stage_v3_compose"
    run_id = state["run_id"]
    dependencies.recorder.start_stage(run_id, stage)

    style_directive = _format_style_directive(state["option_context"])
    prompt = P2B_V3_COMPOSE_PROMPT.format(
        outline=state["outline_text"],
        instructions=state["instruction_text"],
        seo_guideline=SEO_SAFE_CONTENT_GENERATION_GUIDELINES,
        style_directive=style_directive,
    )
    prompt = f"{prompt}\n\n{ANTI_AI_TELLS_FULL}"

    parsed, raw_response = dependencies.llm.invoke_json(
        prompt=prompt,
        max_tokens=6144,
        temperature=state["compose_temperature"],
        model_name=state["writing_model"],
        schema=REWRITE_SCHEMA,
    )
    rewrite = _sanitize_rewrite(
        parsed,
        # The commission owns the working title until the title stage runs; the
        # evidence is never a fallback body, because empty prose is honest and
        # pasted records are not.
        fallback_title=state["commission"]["original_title"],
        fallback_content="",
    )
    rewrite["improved_content"] = dependencies.llm.enforce_anti_ai(
        rewrite["improved_content"],
        model_name=state["writing_model"],
        max_tokens=6144,
        context="prompt2blog v3 compose",
    )

    dependencies.recorder.record_stage(
        run_id,
        stage,
        {"rewrite": rewrite, "raw_response": raw_response},
    )
    _append_stage_trace(
        state["trace"],
        state["include_debug"],
        stage=stage,
        model_name=state["writing_model"],
        input_payload={
            "commission_fingerprint": state["commission"]["commission_fingerprint"],
            "form_id": state["commission"]["form_id"],
            "outline_accepted": state.get("outline_accepted", False),
            "style_directive": style_directive,
        },
        prompt=prompt,
        raw_response=raw_response,
        parsed=parsed,
        output=rewrite,
    )
    return {"current_stage": stage, "rewrite": rewrite}
