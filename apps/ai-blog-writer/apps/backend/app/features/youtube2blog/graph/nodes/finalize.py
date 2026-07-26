from __future__ import annotations

from shared import Stage3Output, Stage4Output

from ...content.markdown import build_final_markdown
from ..context import YouTube2BlogNodeContext
from ..state import GraphNode, YouTube2BlogGraphState


def build_finalize_nodes(context: YouTube2BlogNodeContext) -> dict[str, GraphNode]:
    def finalize_node(state: YouTube2BlogGraphState) -> YouTube2BlogGraphState:
        stage4 = Stage4Output.model_validate(state["stage4"])
        stage3 = Stage3Output.model_validate(state["stage3_for_title"])
        markdown = build_final_markdown(stage4.title, stage3.final_article)
        context.dependencies.recorder.finalize(
            run_id=context.run_id,
            meta=context.meta,
            stage_results=dict(state.get("stage_results") or {}),
            markdown=markdown,
        )
        return {"markdown": markdown}

    return {"finalize": finalize_node}
