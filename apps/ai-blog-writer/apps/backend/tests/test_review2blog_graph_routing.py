import sys
import types

# Avoid importing heavyweight external LLM clients during route-module import.
utils_stub = types.ModuleType("utils")
utils_stub.get_vertex_llm = lambda *args, **kwargs: None
sys.modules.setdefault("utils", utils_stub)

import app.features.review2blog.routes as review2blog_routes


def test_review2blog_pipeline_uses_langgraph_runner(monkeypatch):
    captured: dict[str, object] = {}

    def _fake_graph_runner(
        *,
        run_id,
        initial_state,
        phase1_runner,
        phase2_runner,
        phase3_runner,
        finalize_runner,
    ):
        captured["run_id"] = run_id
        captured["initial_state"] = initial_state
        captured["phase1_runner"] = phase1_runner
        captured["phase2_runner"] = phase2_runner
        captured["phase3_runner"] = phase3_runner
        captured["finalize_runner"] = finalize_runner

    monkeypatch.setattr(review2blog_routes, "run_review2blog_graph", _fake_graph_runner)

    request = review2blog_routes.Review2BlogRunRequest(
        review_payload={
            "name": "Mar y Sol",
            "reviews": [
                {"text": "Great ceviche", "rating": 5, "date": "2025-01-15"},
            ],
        },
        listicle={"listicle_title": "Top Seafood"},
        max_tokens=2048,
    )

    review2blog_routes._run_review2blog_pipeline("run-graph", request)

    assert captured["run_id"] == "run-graph"
    initial_state = captured["initial_state"]
    assert isinstance(initial_state, dict)
    assert isinstance(initial_state.get("reviews"), list)
    assert isinstance(initial_state.get("restaurant_context"), dict)
    assert isinstance(initial_state.get("listicle"), dict)
    assert callable(captured["phase1_runner"])
    assert callable(captured["phase2_runner"])
    assert callable(captured["phase3_runner"])
    assert callable(captured["finalize_runner"])
