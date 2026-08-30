from __future__ import annotations

from typing import Any

from app.shared.prompts import ANTI_AI_TELLS_FULL

from ...dependencies import PipelineDependencies
from ...graph.state import Prompt2BlogV3GraphState
from ...instructions_v3 import stage_context_text
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
    """Write the article from its compose context and evidence records.

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
        instructions=stage_context_text(state["stage_contexts"], "compose"),
        seo_guideline=SEO_SAFE_CONTENT_GENERATION_GUIDELINES,
        style_directive=style_directive,
    )
    prompt = f"{prompt}\n\n{ANTI_AI_TELLS_FULL}"

    # Build-check C2. The compose call measured 29,218 tokens with only about
    # 11,000 traceable from stored data, which made "what should we cut" an
    # unanswerable question. Every part of the prompt is measured here, at the
    # moment it is assembled, so the answer comes off the run instead of an
    # estimate. Characters rather than tokens: no tokenizer is in reach at this
    # point, and roughly four-to-one is close enough to find the big one.
    prompt_sizes = {
        "outline": len(state["outline_text"]),
        "stage_context": len(stage_context_text(state["stage_contexts"], "compose")),
        "seo_guideline": len(SEO_SAFE_CONTENT_GENERATION_GUIDELINES),
        "style_directive": len(style_directive),
        "anti_ai_rules": len(ANTI_AI_TELLS_FULL),
        "total": len(prompt),
    }
    # What the template itself costs, once everything it carries is subtracted.
    prompt_sizes["scaffolding"] = max(
        0, prompt_sizes["total"] - sum(v for k, v in prompt_sizes.items() if k != "total")
    )

    parsed, raw_response = dependencies.llm.invoke_json(
        prompt=prompt,
        max_tokens=6144,
        temperature=state["compose_temperature"],
        model_name=state["writing_model"],
        schema=REWRITE_SCHEMA,
    )
    rewrite = _sanitize_rewrite(
        parsed,
        # The brief owns the working title until the title stage runs; the
        # evidence is never a fallback body, because empty prose is honest and
        # pasted records are not.
        fallback_title=state["brief"]["seed"],
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
            "brief_fingerprint": state["brief"]["brief_fingerprint"],
            "form_id": state["brief"]["form_id"],
            "outline_accepted": state.get("outline_accepted", False),
            "style_directive": style_directive,
            "prompt_sizes": prompt_sizes,
        },
        prompt=prompt,
        raw_response=raw_response,
        parsed=parsed,
        output=rewrite,
    )
    return {"current_stage": stage, "rewrite": rewrite}
