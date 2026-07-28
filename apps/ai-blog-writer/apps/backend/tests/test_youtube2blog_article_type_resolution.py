"""The article type every downstream stage composes against."""

from types import SimpleNamespace

from app.features.youtube2blog.graph.nodes import classification as classification_nodes


class _Recorder:
    def __init__(self):
        self.started: list[str] = []

    def start_stage(self, stage: str) -> None:
        self.started.append(stage)


def _context(monkeypatch, guidelines: dict[str, str]):
    monkeypatch.setattr(
        classification_nodes,
        "stage_3_retrieve_guideline",
        lambda article_type: guidelines.get(article_type, ""),
    )
    recorded: dict[str, dict] = {}

    def record_stage(state, *, stage_name, input_refs, data):
        recorded[stage_name] = {"input_refs": input_refs, "data": data}
        return dict(state.get("stage_results") or {})

    context = SimpleNamespace(
        run_id="run-1",
        active_model="model",
        start_stage=lambda _stage: None,
        record_stage=record_stage,
        stage_ref=lambda run_id, stage: f"data/runs/{run_id}/{stage}.json",
        dependencies=SimpleNamespace(article_type_names_reader=lambda: ["News"]),
    )
    return context, recorded


def test_forced_type_drives_both_the_guideline_and_the_resolved_type(monkeypatch):
    """The guideline came from the forced type while every downstream stage
    read stage_2's classification, so composition followed a Listicle guideline
    while labelling the article News."""
    context, recorded = _context(
        monkeypatch,
        {"Listicle": "LISTICLE GUIDELINE", "News": "NEWS GUIDELINE"},
    )
    node = classification_nodes.build_classification_nodes(context)["stage_3_guideline"]

    result = node(
        {
            "forced_article_type": "Listicle",
            "stage2": {
                "video_id": "v",
                "title": "t",
                "classification": "News",
                "confidence": 0.99,
                "reasoning": "r",
            },
        }
    )

    assert result["article_type"] == "Listicle"
    assert result["stage3_guideline"] == "LISTICLE GUIDELINE"
    assert recorded["stage_3_guideline"]["data"]["source"] == "user_selected"
    # stage_2 may not have run at all, so it must not be claimed as an input.
    assert "stage_2" not in recorded["stage_3_guideline"]["input_refs"]


def test_auto_classified_type_is_published_to_state(monkeypatch):
    context, recorded = _context(monkeypatch, {"News": "NEWS GUIDELINE"})
    node = classification_nodes.build_classification_nodes(context)["stage_3_guideline"]

    result = node(
        {
            "stage2": {
                "video_id": "v",
                "title": "t",
                "classification": "News",
                "confidence": 0.99,
                "reasoning": "r",
            },
        }
    )

    assert result["article_type"] == "News"
    assert result["stage3_guideline"] == "NEWS GUIDELINE"
    assert recorded["stage_3_guideline"]["data"]["source"] == "auto_classified"
    assert "stage_2" in recorded["stage_3_guideline"]["input_refs"]
