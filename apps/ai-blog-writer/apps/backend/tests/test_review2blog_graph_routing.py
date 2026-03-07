import sys
import types

# Avoid importing heavyweight external LLM clients during route-module import.
utils_stub = types.ModuleType("utils")
utils_stub.get_vertex_llm = lambda *args, **kwargs: None
sys.modules["utils"] = utils_stub

import app.features.review2blog.routes as review2blog_routes


def _build_dining_export() -> dict[str, object]:
    return {
        "category": "dining",
        "name": "Mar y Sol",
        "type": "seafood-restaurant",
        "district": "Barranco",
        "locationKey": "peru|lima|barranco",
        "priceLevel": "$$$",
        "idealFor": ["date night", "seafood lovers"],
        "tripadvisorCuisines": ["Peruvian", "Seafood"],
        "tripadvisorMealTypes": ["Dinner"],
        "tripadvisorFeatures": ["Reservations", "Outdoor Seating"],
        "operationHours": {"hours": [{"day": "Monday", "hours": "12:00-22:00"}]},
        "editorial": {
            "placement_type": "curated guide",
            "selection_angle": "review-backed seafood dinner pick",
            "audience": "travelers",
            "tone": "grounded_editorial",
            "must_mention": ["Barranco"],
            "avoid": ["best"],
        },
        "reviews": [
            {
                "reviewId": "rev-1",
                "source": "google",
                "date": "2025-01-15",
                "rating": 5,
                "text": "Amazing ceviche, warm service, and a lively room.",
            }
        ],
    }


def test_review2blog_initial_pipeline_uses_langgraph_runner(monkeypatch):
    captured: dict[str, object] = {}

    def _fake_graph_runner(**kwargs):
        captured.update(kwargs)

    monkeypatch.setattr(review2blog_routes, "run_review2blog_graph", _fake_graph_runner)

    request = review2blog_routes.Review2BlogRunRequest(
        review_payload=_build_dining_export(),
        max_tokens=2048,
    )

    review2blog_routes._run_review2blog_pipeline("run-graph", request)

    assert captured["run_id"] == "run-graph"
    assert captured["entrypoint"] == "review2blog/run"
    initial_state = captured["initial_state"]
    assert isinstance(initial_state, dict)
    assert initial_state["mode"] == "initial"
    assert isinstance(initial_state.get("review_payload"), dict)
    assert initial_state["resolved_max_tokens"] == 2048
    assert "listicle" not in initial_state
    assert callable(captured["validate_input_runner"])
    assert callable(captured["route_phase1_mode_runner"])
    assert callable(captured["phase1_single_runner"])
    assert callable(captured["phase1_batch_runner"])
    assert callable(captured["phase1_merge_runner"])
    assert callable(captured["phase2_runner"])
    assert callable(captured["await_listicle_runner"])
    assert callable(captured["phase3_generate_runner"])
    assert callable(captured["phase3_validate_runner"])
    assert callable(captured["finalize_runner"])


def test_review2blog_resume_pipeline_uses_langgraph_runner(monkeypatch):
    captured: dict[str, object] = {}

    def _fake_graph_runner(**kwargs):
        captured.update(kwargs)

    monkeypatch.setattr(review2blog_routes, "run_review2blog_graph", _fake_graph_runner)
    monkeypatch.setattr(
        review2blog_routes,
        "read_stage_result",
        lambda run_id, stage: {
            "stage_phase1": {
                "data": {
                    "restaurant_context": {"name": "Mar y Sol"},
                    "summary": {"review_count": 1, "signal_count": 1},
                }
            },
            "stage_phase2": {
                "data": {
                    "parsed": {
                        "review_count": 1,
                        "average_rating": 5.0,
                        "date_range": {"earliest": "2025-01-15", "latest": "2025-01-15"},
                        "overall_vibe": "bright seafood spot",
                        "overall_confidence": "medium",
                        "contradictions": [],
                        "editorial_hooks": [],
                        "standout_dishes": [],
                        "food": {},
                        "service": {},
                        "atmosphere": {},
                        "location": {},
                        "value": {},
                        "crowd": {},
                    }
                }
            },
        }[stage],
    )

    request = review2blog_routes.Review2BlogResumeRequest(
        listicle={
            "listicle_type": "Date Night",
            "listicle_title": "Best Date Spots",
            "listicle_goal": "Romantic picks",
        },
        max_tokens=2048,
    )

    review2blog_routes._resume_review2blog_pipeline("run-resume", request)

    assert captured["run_id"] == "run-resume"
    assert captured["entrypoint"] == "review2blog/run/run-resume/resume"
    initial_state = captured["initial_state"]
    assert isinstance(initial_state, dict)
    assert initial_state["mode"] == "resume"
    assert isinstance(initial_state.get("restaurant_context"), dict)
    assert isinstance(initial_state.get("phase2_parsed"), dict)
    assert isinstance(initial_state.get("listicle"), dict)
