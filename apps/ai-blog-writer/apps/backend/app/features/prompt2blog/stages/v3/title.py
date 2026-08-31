from __future__ import annotations

from typing import Any

from ...config import P2B_V3_TITLE_MODEL
from ...content.markdown import _clean_title, extract_markdown_headings
from ...dependencies import PipelineDependencies
from ...graph.state import Prompt2BlogV3GraphState
from ...instructions_v3 import stage_context_text
from ...observability import _append_stage_trace
from ...prompts.editorial_v3 import P2B_V3_TITLE_PROMPT
from ...support import _json, _safe_dict, _safe_str


# How much of the article the headline writer actually needs. The direct
# answer sits near the top by construction, so the opening carries what the
# piece turned out to be about. Sending the whole article to write one string
# would be paying drafting prices for a headline.
TITLE_OPENING_CHARACTERS = 1_200


def _title_material(state: Prompt2BlogV3GraphState) -> dict[str, Any]:
    """What the headline is written from.

    It used to be two summary lines and the headings, and never the article.
    Handed audit-flavoured headings, it wrote an honest label for them -- which
    is how a piece about Lima ended up titled after our research.

    It gets the opening now, because the promise the headline has to keep is
    the brief's, and whether the article kept it is only visible in the prose.
    """
    outline = _safe_dict(state.get("outline"))
    content = _safe_str(_safe_dict(state.get("rewrite")).get("improved_content"))
    opening = content[:TITLE_OPENING_CHARACTERS].strip()
    return {
        # The operator's own line, which this stage has never once been shown.
        # The prompt has always said "keep the original title's intent"; that
        # named a v3 field v4 removed, so the instruction pointed at nothing
        # and the stage fell back on search engine instinct. Run 90b3f9bc
        # turned "Lima is no longer simply the stopover before Cusco" into
        # "Lima vs. Cusco: Why a 2-3 Day Stopover Beats a Layover Before Machu
        # Picchu" -- a colon, keywords, and a comparison the article does not
        # make.
        "the_authors_own_headline": _safe_str(
            _safe_dict(state.get("brief")).get("seed")
        ),
        "the_promise": _safe_str(_safe_dict(state.get("brief")).get("outcome")),
        "spine": _safe_str(_safe_dict(state.get("brief")).get("spine")),
        "article_opening": opening,
        "direct_answer_focus": _safe_str(outline.get("direct_answer_focus")),
        "takeaway_focus": _safe_str(outline.get("takeaway_focus")),
        "headings": extract_markdown_headings(content),
    }


# Title is compact and constrained by headline rules, the brief, and settled
# article. A dedicated medium-effort model avoids paying full drafting effort
# for one string while keeping it on Claude rather than the research worker.
def run_v3_title_stage(
    state: Prompt2BlogV3GraphState,
    dependencies: PipelineDependencies,
) -> dict[str, Any]:
    """Write the headline the brief already promised.

    The brief holds the promise -- make a layover traveller book two extra
    nights -- and it has steered the writing since the outline. This stage
    confirms it against the finished piece rather than inventing a subject
    here, which is what produced a headline about our research instead of
    about Lima.
    """
    stage = "stage_v3_title"
    run_id = state["run_id"]
    rewrite = state["rewrite"]
    title_model = state.get("title_model", P2B_V3_TITLE_MODEL)
    dependencies.recorder.start_stage(run_id, stage)

    prompt = P2B_V3_TITLE_PROMPT.format(
        headline_context=stage_context_text(state["stage_contexts"], "title"),
        article_signals=_json(_title_material(state)),
    )
    raw_response = dependencies.llm.invoke_text(
        prompt=prompt,
        max_tokens=512,
        temperature=0.1,
        model_name=title_model,
    )
    final_title = (
        _clean_title(raw_response)
        or rewrite["improved_title"]
        or state["brief"]["seed"]
    )
    dependencies.recorder.record_stage(
        run_id,
        stage,
        {"final_title": final_title, "raw_response": raw_response},
    )
    _append_stage_trace(
        state["trace"],
        state["include_debug"],
        stage=stage,
        model_name=title_model,
        prompt=prompt,
        raw_response=raw_response,
        output={"final_title": final_title},
    )
    return {"current_stage": stage, "final_title": final_title}
