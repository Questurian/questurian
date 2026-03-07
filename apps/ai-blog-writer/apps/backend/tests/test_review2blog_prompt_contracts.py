import sys
import types

# Avoid importing heavyweight external LLM clients during route-module import.
utils_stub = types.ModuleType("utils")
utils_stub.get_vertex_llm = lambda *args, **kwargs: None
sys.modules["utils"] = utils_stub

from fastapi import HTTPException

from app.features.review2blog import category_pipeline


def _build_export(category: str) -> dict[str, object]:
    common = {
        "name": "Test Place",
        "type": "seafood-restaurant" if category == "dining" else "hotel",
        "district": "Barranco",
        "locationKey": "peru|lima|barranco",
        "editorial": {
            "placement_type": "curated guide",
            "selection_angle": "review-backed pick for travelers",
            "audience": "travelers",
            "tone": "grounded_editorial",
            "must_mention": ["Barranco"],
            "avoid": ["best"],
        },
        "reviews": [
            {
                "reviewId": "rev-1",
                "source": "google",
                "date": "2025-02-01",
                "rating": 5,
                "text": "Amazing ceviche, warm service, and a lively room.",
            },
            {
                "reviewId": "rev-2",
                "source": "google",
                "date": "2024-01-01",
                "rating": 4,
                "text": "The ceviche was fresh and the room stayed lively.",
            },
        ],
        "title": "Ignored title",
        "description": "Ignored description that should never leak into prompts.",
        "reviews_summary": "Ignored review summary.",
        "neighborhoodDescription": "Ignored neighborhood note.",
    }

    if category == "dining":
        return {
            **common,
            "category": "dining",
            "priceLevel": "$$$",
            "idealFor": ["date night"],
            "tripadvisorCuisines": ["Peruvian", "Seafood"],
            "tripadvisorMealTypes": ["Dinner"],
            "tripadvisorFeatures": ["Reservations"],
            "operationHours": {"hours": [{"day": "Monday", "hours": "12:00-22:00"}]},
        }
    if category == "accommodations":
        return {
            **common,
            "category": "accommodations",
            "type": "boutique",
            "priceLevel": "$$$",
            "accommodationsDetails": {
                "the_stay": {
                    "perfect_for": ["couples"],
                    "kid_friendly": False,
                    "wifi": True,
                    "ac": True,
                    "breakfast_served": True,
                    "parking": ["onsite"],
                },
                "the_experience": {
                    "vibe": ["quiet"],
                    "workspace": "strong",
                    "pool": ["rooftop"],
                    "rooftop_lounge": True,
                    "gym": "small",
                },
                "the_details": {"walkability": "high"},
            },
        }
    if category == "attractions":
        return {
            **common,
            "category": "attractions",
            "type": "museum",
            "priceLevel": "$$",
            "idealFor": ["history lovers"],
            "attractionsDetails": {
                "core": {"attraction_type": "museum", "pricing": "paid"},
                "visit": {"booking_required": False},
            },
            "operationHours": {"hours": [{"day": "Tuesday", "hours": "10:00-18:00"}]},
        }
    if category == "nightlife":
        return {
            **common,
            "category": "nightlife",
            "type": "Cocktail Bar",
            "idealFor": ["cocktails"],
            "nightlifeDetails": {
                "price_tier": "$$$",
                "music": ["house"],
                "details": {
                    "theSpace": {
                        "venueType": {"value": "rooftop"},
                        "venueSize": {"value": "medium"},
                        "vibe": {"value": ["stylish"]},
                        "peakHours": {"value": "23:00-01:00"},
                    },
                    "theScene": {
                        "dressCode": {"value": ["smart casual"]},
                        "energyLevel": {"value": "high"},
                        "crowdProfile": {"value": "late-20s and 30s"},
                    },
                },
            },
            "operationHours": {"hours": [{"day": "Friday", "hours": "18:00-02:00"}]},
        }
    return {
        **common,
        "category": "key_locations",
        "type": "airport",
        "keyLocationsDetails": {
            "location_type": "airport",
            "neighborhood": "Callao",
            "status": "active",
        },
        "operationHours": {"hours": [{"day": "Daily", "hours": "00:00-23:59"}]},
    }


def _claim(
    *,
    review_id: str,
    review_date: str,
    topic: str,
    subject: str,
    polarity: str,
    quote: str,
    named_entity: str = "",
) -> dict[str, object]:
    return {
        "review_id": review_id,
        "review_source": "google",
        "review_date": review_date,
        "rating": 5,
        "review_sentiment": "positive",
        "topic": topic,
        "subject": subject,
        "polarity": polarity,
        "strength": "high",
        "specificity": "high",
        "quote": quote,
        "named_entity": named_entity,
    }


class _StubLLM:
    def __init__(self, responses: list[str]):
        self._responses = responses
        self.calls = 0

    def invoke(self, _prompt: str) -> str:
        response = self._responses[min(self.calls, len(self._responses) - 1)]
        self.calls += 1
        return response


def test_validate_and_normalize_export_accepts_all_five_categories():
    for category in category_pipeline.CATEGORY_TOPICS:
        normalized = category_pipeline.validate_and_normalize_export(_build_export(category))
        assert normalized["category"] == category
        assert normalized["location_context"]["category"] == category
        assert normalized["editorial_intent"]["selection_angle"] == "review-backed pick for travelers"
        assert len(normalized["reviews"]) == 2


def test_validate_and_normalize_export_rejects_missing_category_field():
    payload = _build_export("nightlife")
    del payload["nightlifeDetails"]["details"]["theSpace"]["venueType"]  # type: ignore[index]

    try:
        category_pipeline.validate_and_normalize_export(payload)
    except HTTPException as exc:
        assert exc.status_code == 400
        assert "nightlifeDetails.details.theSpace.venueType.value" in str(exc.detail)
    else:
        raise AssertionError("Expected validation to fail")


def test_invoke_json_llm_with_retry_repairs_fenced_json_with_trailing_commas(monkeypatch):
    stub = _StubLLM(['```json\n[{"ok": 1,},]\n```'])
    monkeypatch.setattr(category_pipeline, "get_vertex_llm", lambda **_kwargs: stub)

    raw, parsed, meta = category_pipeline._invoke_json_llm_with_retry(
        prompt="phase 1",
        retry_prompt_builder=lambda **_kwargs: "retry",
        max_tokens=256,
        retry_limit=0,
        label="Review2Blog phase 1",
    )

    assert raw == '```json\n[{"ok": 1,},]\n```'
    assert parsed == [{"ok": 1}]
    assert meta == {"attempt_count": 1, "repair_used": True}


def test_build_writer_prompt_excludes_ignored_prose_fields():
    normalized = category_pipeline.validate_and_normalize_export(_build_export("dining"))
    profile = category_pipeline.build_evidence_profile(
        category="dining",
        claims=[
            _claim(
                review_id="rev-1",
                review_date="2025-02-01",
                topic="food",
                subject="ceviche",
                polarity="positive",
                quote="Amazing ceviche",
                named_entity="ceviche",
            )
        ],
        reviews=normalized["reviews"],
        location_context=normalized["location_context"],
        editorial_intent=normalized["editorial_intent"],
        recent_window_days=180,
    )
    brief = category_pipeline.build_writer_brief(
        evidence_profile=profile,
        location_context=normalized["location_context"],
        editorial_intent=normalized["editorial_intent"],
        listicle={"listicle_title": "Best Seafood Spots in Barranco", "blurb_length": "long"},
    )
    prompt = category_pipeline.build_writer_prompt(brief)

    assert "Ignored title" not in prompt
    assert "Ignored description" not in prompt
    assert "Ignored neighborhood note" not in prompt
    assert "Ignored review summary" not in prompt
    assert 'Title: Best Seafood Spots in Barranco' in prompt
    assert "6 to 7 sentences" in prompt
    assert "Questurian's own expert editorial voice" in prompt
    assert "Never mention reviews, reviewers" in prompt


def test_evidence_profile_tracks_recent_support_and_supported_named_entities():
    normalized = category_pipeline.validate_and_normalize_export(_build_export("dining"))
    profile = category_pipeline.build_evidence_profile(
        category="dining",
        claims=[
            _claim(
                review_id="rev-1",
                review_date="2025-02-01",
                topic="food",
                subject="ceviche",
                polarity="positive",
                quote="Amazing ceviche",
                named_entity="ceviche",
            ),
            _claim(
                review_id="rev-2",
                review_date="2024-01-01",
                topic="food",
                subject="ceviche",
                polarity="positive",
                quote="fresh ceviche",
                named_entity="ceviche",
            ),
            _claim(
                review_id="rev-1",
                review_date="2025-02-01",
                topic="service",
                subject="warm service",
                polarity="positive",
                quote="warm service",
            ),
        ],
        reviews=normalized["reviews"],
        location_context=normalized["location_context"],
        editorial_intent=normalized["editorial_intent"],
        recent_window_days=180,
    )

    ceviche_claim = next(claim for claim in profile["ranked_claims"] if claim["subject"] == "ceviche")
    assert ceviche_claim["support_count"] == 2
    assert ceviche_claim["recent_support_count"] == 1
    assert profile["named_entity_support"][0]["name"] == "ceviche"

    brief = category_pipeline.build_writer_brief(
        evidence_profile=profile,
        location_context=normalized["location_context"],
        editorial_intent=normalized["editorial_intent"],
    )
    assert brief["supported_named_entities"][0]["name"] == "ceviche"


def test_nightlife_profile_prefers_music_and_crowd_evidence():
    normalized = category_pipeline.validate_and_normalize_export(_build_export("nightlife"))
    profile = category_pipeline.build_evidence_profile(
        category="nightlife",
        claims=[
            _claim(
                review_id="rev-1",
                review_date="2025-02-01",
                topic="music",
                subject="house playlist",
                polarity="positive",
                quote="great house music",
            ),
            _claim(
                review_id="rev-2",
                review_date="2024-01-01",
                topic="crowd",
                subject="mixed crowd",
                polarity="positive",
                quote="fun mixed crowd",
            ),
        ],
        reviews=normalized["reviews"],
        location_context=normalized["location_context"],
        editorial_intent=normalized["editorial_intent"],
        recent_window_days=180,
    )
    assert profile["topic_breakdown"][0]["topic"] == "music"
    assert any(item["topic"] == "crowd" for item in profile["topic_breakdown"])


def test_key_locations_writer_guidance_stays_utility_focused():
    normalized = category_pipeline.validate_and_normalize_export(_build_export("key_locations"))
    profile = category_pipeline.build_evidence_profile(
        category="key_locations",
        claims=[
            _claim(
                review_id="rev-1",
                review_date="2025-02-01",
                topic="signage",
                subject="clear signage",
                polarity="positive",
                quote="clear signage",
            ),
            _claim(
                review_id="rev-2",
                review_date="2024-01-01",
                topic="wait_times",
                subject="long security line",
                polarity="negative",
                quote="long security line",
            ),
        ],
        reviews=normalized["reviews"],
        location_context=normalized["location_context"],
        editorial_intent=normalized["editorial_intent"],
        recent_window_days=180,
    )
    brief = category_pipeline.build_writer_brief(
        evidence_profile=profile,
        location_context=normalized["location_context"],
        editorial_intent=normalized["editorial_intent"],
    )

    assert "Write for utility" in brief["category_guidance"]


def test_validate_category_blurb_rejects_editorial_paraphrase_and_unsupported_named_entity():
    normalized = category_pipeline.validate_and_normalize_export(_build_export("dining"))
    profile = category_pipeline.build_evidence_profile(
        category="dining",
        claims=[
            _claim(
                review_id="rev-1",
                review_date="2025-02-01",
                topic="food",
                subject="ceviche",
                polarity="positive",
                quote="Amazing ceviche",
                named_entity="ceviche",
            ),
            _claim(
                review_id="rev-2",
                review_date="2024-01-01",
                topic="service",
                subject="warm service",
                polarity="positive",
                quote="warm service",
            ),
            _claim(
                review_id="rev-1",
                review_date="2025-02-01",
                topic="food",
                subject="lomo saltado",
                polarity="positive",
                quote="solid lomo saltado",
                named_entity="lomo saltado",
            ),
        ],
        reviews=normalized["reviews"],
        location_context=normalized["location_context"],
        editorial_intent=normalized["editorial_intent"],
        recent_window_days=180,
    )
    brief = category_pipeline.build_writer_brief(
        evidence_profile=profile,
        location_context=normalized["location_context"],
        editorial_intent=normalized["editorial_intent"],
    )

    errors = category_pipeline.validate_category_blurb(
        blurb=(
            "This is a review-backed pick for travelers in Barranco. "
            "It feels like a curated guide choice because the seafood-restaurant angle is obvious. "
            "Ceviche gets attention, and lomo saltado shows up too. "
            "It is easy to recommend."
        ),
        brief=brief,
    )

    assert any("editorial framing" in error or "tracks too closely" in error for error in errors)
    assert any("unsupported named entities" in error for error in errors)


def test_validate_category_blurb_uses_requested_sentence_range():
    normalized = category_pipeline.validate_and_normalize_export(_build_export("dining"))
    profile = category_pipeline.build_evidence_profile(
        category="dining",
        claims=[
            _claim(
                review_id="rev-1",
                review_date="2025-02-01",
                topic="food",
                subject="ceviche",
                polarity="positive",
                quote="Amazing ceviche",
                named_entity="ceviche",
            ),
            _claim(
                review_id="rev-2",
                review_date="2024-01-01",
                topic="service",
                subject="warm service",
                polarity="positive",
                quote="warm service",
            ),
        ],
        reviews=normalized["reviews"],
        location_context=normalized["location_context"],
        editorial_intent=normalized["editorial_intent"],
        recent_window_days=180,
    )
    brief = category_pipeline.build_writer_brief(
        evidence_profile=profile,
        location_context=normalized["location_context"],
        editorial_intent=normalized["editorial_intent"],
        listicle={"listicle_title": "Best Seafood Spots in Barranco", "blurb_length": "short"},
    )

    errors = category_pipeline.validate_category_blurb(
        blurb=(
            "Ceviche gets the strongest repeat praise here. "
            "Warm service helps the room stay approachable. "
            "The overall feel is lively without tipping chaotic. "
            "It lands as a steady Barranco dinner option."
        ),
        brief=brief,
    )

    assert "Blurb must contain 2 to 3 sentences." in errors


def test_validate_category_blurb_rejects_review_process_disclosure():
    normalized = category_pipeline.validate_and_normalize_export(_build_export("dining"))
    profile = category_pipeline.build_evidence_profile(
        category="dining",
        claims=[
            _claim(
                review_id="rev-1",
                review_date="2025-02-01",
                topic="food",
                subject="ceviche",
                polarity="positive",
                quote="Amazing ceviche",
                named_entity="ceviche",
            ),
            _claim(
                review_id="rev-2",
                review_date="2024-01-01",
                topic="service",
                subject="warm service",
                polarity="positive",
                quote="warm service",
            ),
        ],
        reviews=normalized["reviews"],
        location_context=normalized["location_context"],
        editorial_intent=normalized["editorial_intent"],
        recent_window_days=180,
    )
    brief = category_pipeline.build_writer_brief(
        evidence_profile=profile,
        location_context=normalized["location_context"],
        editorial_intent=normalized["editorial_intent"],
        listicle={"listicle_title": "Best Seafood Spots in Barranco", "blurb_length": "medium"},
    )

    errors = category_pipeline.validate_category_blurb(
        blurb=(
            "Reviewers say the ceviche is the standout order here. "
            "People mention warm service and an easy dinner rhythm. "
            "The room feels lively without turning chaotic. "
            "It fits Barranco well."
        ),
        brief=brief,
    )

    assert any("review-mining process" in error for error in errors)
