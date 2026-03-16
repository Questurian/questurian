import json
import sys
import types

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core import clear_all_runs
from app.features.keyword_intel.dataforseo_client import (
    DataForSEOClient,
    DataForSEOLanguage,
    DataForSEOLocation,
)

# Avoid importing heavyweight external LLM clients during route-module import.
utils_stub = types.ModuleType("utils")
utils_stub.get_vertex_llm = lambda *args, **kwargs: None
utils_stub.parse_json_response = lambda value: json.loads(value)
sys.modules.setdefault("utils", utils_stub)

import app.features.keyword_intel.routes as keyword_intel_routes


class _StubProviderClient:
    def resolve_location(self, *, geo, region=None, city=None):  # noqa: ANN001
        if geo == "zz":
            raise ValueError("Unsupported geo code: zz")
        return DataForSEOLocation(
            location_code=1001,
            location_name="Lima, Peru",
            country_iso_code="PE",
            location_type="City",
        )

    def resolve_language(self, language_code: str):  # noqa: ANN001
        if language_code == "zz":
            raise ValueError("Unsupported language code: zz")
        mapping = {
            "en": DataForSEOLanguage(language_code="en", language_name="English"),
            "es": DataForSEOLanguage(language_code="es", language_name="Spanish"),
        }
        return mapping[language_code]

    def build_autocomplete_task(self, **kwargs):  # noqa: ANN003
        client = DataForSEOClient(login="user", password="pass")
        return client.build_autocomplete_task(**kwargs)

    def build_organic_task(self, **kwargs):  # noqa: ANN003
        client = DataForSEOClient(login="user", password="pass")
        return client.build_organic_task(**kwargs)

    def fetch_autocomplete_suggestions(self, **_kwargs):
        return [
            " Best Restaurants Near Larcomar ",
            "cheap restaurants near larcomar",
            "best restaurants near larcomar",
        ]

    def fetch_organic_items(self, **_kwargs):
        return [
            {
                "type": "related_searches",
                "items": [
                    {"title": "seafood near larcomar"},
                    {"title": "where to eat near larcomar"},
                    {"title": "restaurants near the sound"},
                ],
            },
            {
                "type": "people_also_search",
                "items": [
                    {"title": "best places to eat near larcomar"},
                ],
            },
        ]


def _build_client() -> TestClient:
    app = FastAPI()
    app.include_router(keyword_intel_routes.router)
    return TestClient(app)


def _sample_market_context() -> keyword_intel_routes.ResolvedMarketContext:
    return keyword_intel_routes.ResolvedMarketContext(
        market_profile="tourists_in_peru_en",
        provider="dataforseo",
        geo="pe",
        language="en",
        device="desktop",
        search_domain="google.com",
        region=None,
        city="lima",
        location_code=1001,
        location_name="Lima, Peru",
        location_type="City",
        language_code="en",
        language_name="English",
    )


def test_dataforseo_task_builders_include_provider_fields():
    client = DataForSEOClient(login="user", password="pass")

    autocomplete_task = client.build_autocomplete_task(
        keyword="restaurants near larcomar",
        location_code=1024,
        language_code="en",
        device="mobile",
        search_domain="google.com",
    )
    assert autocomplete_task["keyword"] == "restaurants near larcomar"
    assert autocomplete_task["location_code"] == 1024
    assert autocomplete_task["language_code"] == "en"
    assert autocomplete_task["client"] == "android"
    assert autocomplete_task["se_domain"] == "google.com"

    organic_task = client.build_organic_task(
        keyword="restaurants near larcomar",
        location_code=1024,
        language_code="en",
        device="desktop",
        search_domain="google.com",
    )
    assert organic_task["device"] == "desktop"
    assert organic_task["depth"] == 10
    assert organic_task["se_domain"] == "google.com"


def test_parse_related_search_entries_extracts_both_sources_and_ranks():
    items = [
        {
            "type": "related_searches",
            "items": [{"title": "seafood near larcomar"}],
        },
        {
            "type": "people_also_search",
            "items": [{"title": "best places to eat near larcomar"}],
        },
    ]

    entries = keyword_intel_routes.parse_related_search_entries(items)

    assert entries == [
        {
            "text": "seafood near larcomar",
            "source_type": "related_searches",
            "source_rank": 1,
        },
        {
            "text": "best places to eat near larcomar",
            "source_type": "people_also_search",
            "source_rank": 1,
        },
    ]


def test_market_profile_validation_and_resolution():
    validated = keyword_intel_routes._validate_request(
        keyword_intel_routes.KeywordIntelRunRequest(
            seed="restaurants near larcomar",
            market_profile="locals_peru_es",
            device="mobile",
            city="lima",
        )
    )
    assert validated.geo == "pe"
    assert validated.language == "es"
    assert validated.market_profile == "locals_peru_es"
    assert validated.device == "mobile"

    market_context = keyword_intel_routes.resolve_market_context(
        validated,
        provider_client=_StubProviderClient(),
    )
    assert market_context.location_code == 1001
    assert market_context.location_name == "Lima, Peru"
    assert market_context.language_code == "es"


def test_normalize_phrase_records_keeps_near_seed_and_preserves_text():
    market_context = _sample_market_context()
    raw_records = keyword_intel_routes.build_autocomplete_phrase_records(
        [
            " Best Restaurants Near Larcomar ",
            "best restaurants near larcomar",
            "restaurants near larcomar",
        ],
        seed="restaurants near larcomar",
        market_context=market_context,
    )
    normalized_records, dropped_records = keyword_intel_routes.normalize_phrase_records(
        raw_records,
        seed="restaurants near larcomar",
    )

    assert [record["text"] for record in normalized_records] == [
        " Best Restaurants Near Larcomar ",
        "restaurants near larcomar",
    ]
    assert normalized_records[0]["normalized_text"] == "Best Restaurants Near Larcomar"
    assert normalized_records[0]["platform_modifiers"] == []
    assert normalized_records[1]["normalized_text"] == "restaurants near larcomar"
    assert normalized_records[1]["is_near_seed"] is True
    assert any(record["filter_reason"] == "exact_duplicate" for record in dropped_records)


def test_filter_group_and_label_preserve_stable_ids(monkeypatch):
    market_context = _sample_market_context().to_dict()
    candidate_records = keyword_intel_routes.build_autocomplete_phrase_records(
        [
            "best restaurants near larcomar",
            "best places to eat near larcomar",
            "restaurants near the sound",
        ],
        seed="restaurants near larcomar",
        market_context=market_context,
    )
    normalized_records, _ = keyword_intel_routes.normalize_phrase_records(
        candidate_records,
        seed="restaurants near larcomar",
    )
    good_ids = [normalized_records[0]["phrase_id"], normalized_records[1]["phrase_id"]]
    bad_id = normalized_records[2]["phrase_id"]

    grouped_group_id = keyword_intel_routes._build_group_id(good_ids)
    responses = iter(
        [
            (
                {
                    "seed_intent": {
                        "topic_label": "dining",
                        "intent_label": "find_restaurants",
                    },
                    "phrases": [
                        {
                            "phrase_id": good_ids[0],
                            "topic_label": "dining",
                            "intent_label": "find_restaurants",
                            "intent_relation": "same_intent",
                            "reason": "same_restaurant_search_intent",
                        },
                        {
                            "phrase_id": good_ids[1],
                            "topic_label": "dining",
                            "intent_label": "find_restaurants",
                            "intent_relation": "same_intent",
                            "reason": "same_restaurant_search_intent",
                        },
                        {
                            "phrase_id": bad_id,
                            "topic_label": "dining",
                            "intent_label": "find_restaurants",
                            "intent_relation": "irrelevant_intent",
                            "reason": "no_shared_seed_anchor",
                        },
                    ],
                },
                "{}",
            ),
            (
                {
                    "groups": [
                        {
                            "phrase_ids": good_ids,
                        }
                    ]
                },
                "{}",
            ),
            (
                {
                    "groups": [
                        {
                            "group_id": grouped_group_id,
                            "label": "best overall restaurants",
                        }
                    ]
                },
                "{}",
            ),
        ]
    )

    monkeypatch.setattr(
        keyword_intel_routes,
        "_invoke_json_llm",
        lambda _prompt: next(responses),
    )

    seed_intent_profile, classified_records = (
        keyword_intel_routes.classify_phrase_intent_with_ai(
            seed="restaurants near larcomar",
            market_context=market_context,
            normalized_phrase_records=normalized_records,
        )
    )
    retained_records, filtered_records = (
        keyword_intel_routes.filter_irrelevant_phrases_with_ai(
            seed="restaurants near larcomar",
            market_context=market_context,
            seed_intent_profile=seed_intent_profile,
            classified_phrase_records=classified_records,
        )
    )
    grouped = keyword_intel_routes.semantic_group_phrases_with_ai(
        seed="restaurants near larcomar",
        market_context=market_context,
        retained_phrase_records=retained_records,
    )
    labeled = keyword_intel_routes.label_groups_with_ai(
        seed="restaurants near larcomar",
        language="en",
        market_context=market_context,
        groups=grouped,
        retained_phrase_records=retained_records,
    )

    assert [record["phrase_id"] for record in retained_records] == good_ids
    assert filtered_records[0]["phrase_id"] == bad_id
    assert filtered_records[0]["filter_reason"] == "no_shared_seed_anchor"
    assert grouped[0]["group_id"] == grouped_group_id
    assert labeled[0]["phrase_ids"] == good_ids
    assert labeled[0]["phrases"] == [
        "best restaurants near larcomar",
        "best places to eat near larcomar",
    ]


def test_intent_classification_filters_adjacent_verticals_and_preserves_pattern_boundaries(
    monkeypatch,
):
    market_context = _sample_market_context().to_dict()
    candidate_records = keyword_intel_routes.build_autocomplete_phrase_records(
        [
            "where to stay in miraflores",
            "safest place to stay in lima peru",
            "where to stay in miraflores lima peru reddit",
            "where is miraflores lima",
            "lima restaurants miraflores",
        ],
        seed="where to stay in miraflores lima",
        market_context=market_context,
    )
    normalized_records, _ = keyword_intel_routes.normalize_phrase_records(
        candidate_records,
        seed="where to stay in miraflores lima",
    )
    stay_id = next(
        record["phrase_id"]
        for record in normalized_records
        if record["normalized_text"] == "where to stay in miraflores"
    )
    safe_id = next(
        record["phrase_id"]
        for record in normalized_records
        if record["normalized_text"] == "safest place to stay in lima peru"
    )
    reddit_id = next(
        record["phrase_id"]
        for record in normalized_records
        if record["normalized_text"] == "where to stay in miraflores lima peru reddit"
    )
    where_is_id = next(
        record["phrase_id"]
        for record in normalized_records
        if record["normalized_text"] == "where is miraflores lima"
    )
    restaurants_id = next(
        record["phrase_id"]
        for record in normalized_records
        if record["normalized_text"] == "lima restaurants miraflores"
    )

    responses = iter(
        [
            (
                {
                    "seed_intent": {
                        "topic_label": "lodging",
                        "intent_label": "find_accommodation",
                    },
                    "phrases": [
                        {
                            "phrase_id": stay_id,
                            "topic_label": "lodging",
                            "intent_label": "find_accommodation",
                            "intent_relation": "same_intent",
                            "reason": "same_lodging_task",
                        },
                        {
                            "phrase_id": safe_id,
                            "topic_label": "lodging",
                            "intent_label": "evaluate_lodging_options",
                            "intent_relation": "same_intent",
                            "reason": "same_lodging_task",
                        },
                        {
                            "phrase_id": reddit_id,
                            "topic_label": "lodging",
                            "intent_label": "find_accommodation",
                            "intent_relation": "same_intent",
                            "reason": "same_lodging_task_platform_variant",
                        },
                        {
                            "phrase_id": where_is_id,
                            "topic_label": "location_definition",
                            "intent_label": "define_location",
                            "intent_relation": "adjacent_intent",
                            "reason": "adjacent_intent_define_location",
                        },
                        {
                            "phrase_id": restaurants_id,
                            "topic_label": "dining",
                            "intent_label": "find_restaurants",
                            "intent_relation": "adjacent_intent",
                            "reason": "adjacent_intent_find_restaurants",
                        },
                    ],
                },
                "{}",
            ),
        ]
    )
    monkeypatch.setattr(
        keyword_intel_routes,
        "_invoke_json_llm",
        lambda _prompt: next(responses),
    )

    seed_intent_profile, classified_records = (
        keyword_intel_routes.classify_phrase_intent_with_ai(
            seed="where to stay in miraflores lima",
            market_context=market_context,
            normalized_phrase_records=normalized_records,
        )
    )
    retained_records, filtered_records = (
        keyword_intel_routes.filter_irrelevant_phrases_with_ai(
            seed="where to stay in miraflores lima",
            market_context=market_context,
            seed_intent_profile=seed_intent_profile,
            classified_phrase_records=classified_records,
        )
    )

    assert [record["phrase_id"] for record in retained_records] == [
        stay_id,
        safe_id,
        reddit_id,
    ]
    assert {record["phrase_id"] for record in filtered_records} == {
        where_is_id,
        restaurants_id,
    }
    assert {
        record["filter_reason"] for record in filtered_records
    } == {
        "adjacent_intent_define_location",
        "adjacent_intent_find_restaurants",
    }

    pattern_summary = keyword_intel_routes.extract_pattern_summary(
        seed="where to stay in miraflores lima",
        retained_phrase_records=retained_records,
    )
    flattened_values = [
        value
        for values in pattern_summary.values()
        for value in values
    ]
    assert "safest place" in pattern_summary["recurring_feature_terms"]
    assert pattern_summary["platform_modifiers"] == ["reddit"]
    assert "reddit" not in pattern_summary["recurring_feature_terms"]
    assert "reddit" not in pattern_summary["top_modifiers"]
    assert "staymirafloreslima" not in flattened_values
    assert "perurestaurantssafestplace" not in flattened_values
    assert "perusafestplacereddit" not in flattened_values


def test_semantic_grouping_merges_market_variants_and_splits_platform_modifiers(
    monkeypatch,
):
    market_context = _sample_market_context().to_dict()
    retained_records = keyword_intel_routes.build_autocomplete_phrase_records(
        [
            "where to stay in miraflores lima peru",
            "where to stay in miraflores peru",
            "where to stay in miraflores peru reddit",
        ],
        seed="where to stay in miraflores lima peru",
        market_context=market_context,
    )
    normalized_records, _ = keyword_intel_routes.normalize_phrase_records(
        retained_records,
        seed="where to stay in miraflores lima peru",
    )
    stay_lima_id = next(
        record["phrase_id"]
        for record in normalized_records
        if record["normalized_text"] == "where to stay in miraflores lima peru"
    )
    stay_peru_id = next(
        record["phrase_id"]
        for record in normalized_records
        if record["normalized_text"] == "where to stay in miraflores peru"
    )
    reddit_id = next(
        record["phrase_id"]
        for record in normalized_records
        if record["normalized_text"] == "where to stay in miraflores peru reddit"
    )

    classified_records = [
        {
            **record,
            "topic_label": "lodging",
            "intent_label": "find_accommodation",
            "intent_relation": "same_intent",
            "classification_reason": "same_lodging_task",
            "classification_source": "test",
        }
        for record in normalized_records
    ]

    responses = iter(
        [
            (
                {
                    "groups": [
                        {"phrase_ids": [stay_lima_id]},
                        {"phrase_ids": [stay_peru_id]},
                    ]
                },
                "{}",
            )
        ]
    )
    monkeypatch.setattr(
        keyword_intel_routes,
        "_invoke_json_llm",
        lambda _prompt: next(responses),
    )

    grouped = keyword_intel_routes.semantic_group_phrases_with_ai(
        seed="where to stay in miraflores lima peru",
        market_context=market_context,
        retained_phrase_records=classified_records,
    )

    assert len(grouped) == 2
    assert grouped[0]["phrase_ids"] == [stay_lima_id, stay_peru_id]
    assert grouped[0]["group_id"] == keyword_intel_routes._build_group_id(
        [stay_lima_id, stay_peru_id]
    )
    assert grouped[0]["modifier_tags"] == []
    assert grouped[1]["phrase_ids"] == [reddit_id]
    assert grouped[1]["modifier_tags"] == ["reddit"]


def test_score_groups_is_deterministic():
    market_context = _sample_market_context()
    retained_records = keyword_intel_routes.build_autocomplete_phrase_records(
        [
            "best restaurants near larcomar",
            "best places to eat near larcomar",
            "cheap restaurants near larcomar",
        ],
        seed="restaurants near larcomar",
        market_context=market_context,
    )
    normalized_records, _ = keyword_intel_routes.normalize_phrase_records(
        retained_records,
        seed="restaurants near larcomar",
    )
    groups = [
        {
            "group_id": keyword_intel_routes._build_group_id(
                [normalized_records[0]["phrase_id"], normalized_records[1]["phrase_id"]]
            ),
            "label": "best overall restaurants",
            "phrase_ids": [
                normalized_records[0]["phrase_id"],
                normalized_records[1]["phrase_id"],
            ],
            "phrases": [
                normalized_records[0]["text"],
                normalized_records[1]["text"],
            ],
        },
        {
            "group_id": keyword_intel_routes._build_group_id(
                [normalized_records[2]["phrase_id"]]
            ),
            "label": "budget restaurants",
            "phrase_ids": [normalized_records[2]["phrase_id"]],
            "phrases": [normalized_records[2]["text"]],
        },
    ]

    scored = keyword_intel_routes.score_groups(
        groups=groups,
        retained_phrase_records=normalized_records,
        pattern_summary={
            "top_modifiers": ["best", "cheap"],
            "top_entities": ["restaurants", "larcomar"],
            "recurring_location_anchors": ["larcomar"],
            "recurring_question_stems": [],
            "recurring_feature_terms": ["seafood"],
        },
    )

    assert [group["label"] for group in scored] == [
        "best overall restaurants",
        "budget restaurants",
    ]
    assert scored[0]["group_id"] == groups[0]["group_id"]
    assert scored[0]["score"] >= scored[1]["score"]


def test_keyword_intel_validation_returns_400_for_bad_inputs(monkeypatch):
    client = _build_client()
    monkeypatch.setattr(
        keyword_intel_routes,
        "_build_provider_client",
        lambda: _StubProviderClient(),
    )

    missing_seed = client.post(
        "/keyword-intel/run",
        json={"seed": " ", "market_profile": "custom", "geo": "pe", "language": "en"},
    )
    assert missing_seed.status_code == 400

    missing_geo = client.post(
        "/keyword-intel/run",
        json={"seed": "restaurants", "market_profile": "custom", "language": "en"},
    )
    assert missing_geo.status_code == 400

    conflicting_profile = client.post(
        "/keyword-intel/run",
        json={
            "seed": "restaurants",
            "market_profile": "tourists_in_peru_en",
            "geo": "us",
        },
    )
    assert conflicting_profile.status_code == 400

    bad_device = client.post(
        "/keyword-intel/run",
        json={
            "seed": "restaurants",
            "market_profile": "custom",
            "geo": "pe",
            "language": "en",
            "device": "tablet",
        },
    )
    assert bad_device.status_code == 400


def test_keyword_intel_run_status_result_and_jobs(monkeypatch):
    client = _build_client()
    clear_all_runs(feature="keyword_intel")
    monkeypatch.setattr(
        keyword_intel_routes,
        "_build_provider_client",
        lambda: _StubProviderClient(),
    )

    validated = keyword_intel_routes._validate_request(
        keyword_intel_routes.KeywordIntelRunRequest(
            seed="restaurants near larcomar",
            market_profile="tourists_in_peru_en",
            device="desktop",
            search_domain="google.com",
            city="lima",
        )
    )
    market_context = keyword_intel_routes.resolve_market_context(
        validated,
        provider_client=_StubProviderClient(),
    )

    autocomplete_records = keyword_intel_routes.build_autocomplete_phrase_records(
        [
            " Best Restaurants Near Larcomar ",
            "cheap restaurants near larcomar",
            "best restaurants near larcomar",
        ],
        seed=validated.seed,
        market_context=market_context,
    )
    related_records = keyword_intel_routes.build_related_phrase_records(
        _StubProviderClient().fetch_organic_items(),
        seed=validated.seed,
        market_context=market_context,
    )
    normalized_records, _ = keyword_intel_routes.normalize_phrase_records(
        autocomplete_records + related_records,
        seed=validated.seed,
    )
    retained_ids = [
        record["phrase_id"]
        for record in normalized_records
        if record["normalized_text"] != "restaurants near the sound"
    ]
    filtered_id = next(
        record["phrase_id"]
        for record in normalized_records
        if record["normalized_text"] == "restaurants near the sound"
    )

    best_id = next(
        record["phrase_id"]
        for record in normalized_records
        if record["normalized_text"] == "Best Restaurants Near Larcomar"
    )
    where_id = next(
        record["phrase_id"]
        for record in normalized_records
        if record["normalized_text"] == "where to eat near larcomar"
    )
    best_places_id = next(
        record["phrase_id"]
        for record in normalized_records
        if record["normalized_text"] == "best places to eat near larcomar"
    )
    cheap_id = next(
        record["phrase_id"]
        for record in normalized_records
        if record["normalized_text"] == "cheap restaurants near larcomar"
    )
    seafood_id = next(
        record["phrase_id"]
        for record in normalized_records
        if record["normalized_text"] == "seafood near larcomar"
    )

    best_group_id = keyword_intel_routes._build_group_id(
        [best_id, where_id, best_places_id]
    )
    budget_group_id = keyword_intel_routes._build_group_id([cheap_id])
    seafood_group_id = keyword_intel_routes._build_group_id([seafood_id])

    def _fake_invoke_json_llm(prompt: str):
        if "classifying keyword-intel phrase records by topic and search intent" in prompt:
            return (
                {
                    "seed_intent": {
                        "topic_label": "dining",
                        "intent_label": "find_restaurants",
                    },
                    "phrases": [
                        {
                            "phrase_id": best_id,
                            "topic_label": "dining",
                            "intent_label": "find_restaurants",
                            "intent_relation": "same_intent",
                            "reason": "same_restaurant_task",
                        },
                        {
                            "phrase_id": where_id,
                            "topic_label": "dining",
                            "intent_label": "find_restaurants",
                            "intent_relation": "same_intent",
                            "reason": "same_restaurant_task",
                        },
                        {
                            "phrase_id": best_places_id,
                            "topic_label": "dining",
                            "intent_label": "find_restaurants",
                            "intent_relation": "same_intent",
                            "reason": "same_restaurant_task",
                        },
                        {
                            "phrase_id": cheap_id,
                            "topic_label": "dining",
                            "intent_label": "budget_restaurants",
                            "intent_relation": "same_intent",
                            "reason": "same_restaurant_task",
                        },
                        {
                            "phrase_id": seafood_id,
                            "topic_label": "dining",
                            "intent_label": "seafood_restaurants",
                            "intent_relation": "same_intent",
                            "reason": "same_restaurant_task",
                        },
                        {
                            "phrase_id": filtered_id,
                            "topic_label": "dining",
                            "intent_label": "find_restaurants",
                            "intent_relation": "irrelevant_intent",
                            "reason": "off_topic_market_mismatch",
                        },
                    ],
                },
                "{}",
            )

        if "semantic opportunity clusters" in prompt:
            return (
                {
                    "groups": [
                        {
                            "phrase_ids": [best_id, where_id, best_places_id],
                        },
                    ]
                },
                "{}",
            )

        return (
            {
                "groups": [
                    {
                        "group_id": best_group_id,
                        "label": "best overall restaurants",
                    },
                    {
                        "group_id": budget_group_id,
                        "label": "budget restaurants",
                    },
                    {
                        "group_id": seafood_group_id,
                        "label": "seafood restaurants",
                    },
                ]
            },
            "{}",
        )

    monkeypatch.setattr(keyword_intel_routes, "_invoke_json_llm", _fake_invoke_json_llm)

    response = client.post(
        "/keyword-intel/run",
        json={
            "seed": "restaurants near larcomar",
            "market_profile": "tourists_in_peru_en",
            "device": "desktop",
            "search_domain": "google.com",
            "city": "lima",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    run_id = payload["run_id"]

    status_response = client.get(f"/keyword-intel/status/{run_id}")
    assert status_response.status_code == 200
    assert status_response.json()["state"] == "completed"
    assert status_response.json()["feature"] == "keyword_intel"

    result_response = client.get(f"/keyword-intel/result/{run_id}")
    assert result_response.status_code == 200
    result_payload = result_response.json()
    artifact = result_payload["artifact"]

    assert artifact["market_context"]["market_profile"] == "tourists_in_peru_en"
    assert artifact["market_context"]["geo"] == "pe"
    assert artifact["market_context"]["language"] == "en"
    assert " Best Restaurants Near Larcomar " in artifact["raw_phrases"]
    assert artifact["filtered_out_phrases"] == ["restaurants near the sound"]
    assert artifact["groups"][0]["label"] == "best overall restaurants"
    assert artifact["groups"][0]["group_id"] == best_group_id
    assert artifact["groups"][0]["phrase_ids"] == [best_id, where_id, best_places_id]
    assert artifact["groups"][0]["phrases"] == [
        " Best Restaurants Near Larcomar ",
        "where to eat near larcomar",
        "best places to eat near larcomar",
    ]
    assert artifact["raw_phrase_records"][0]["text"] == " Best Restaurants Near Larcomar "
    assert artifact["retained_phrase_records"][0]["source_rank"] == 1
    assert (
        artifact["debug_artifacts"]["collect_autocomplete_records"]["provider_request_context"][
            "market_context"
        ]["market_profile"]
        == "tourists_in_peru_en"
    )
    assert artifact["debug_artifacts"]["collect_related_search_records"]["raw_provider_response"][
        "results"
    ]

    jobs_response = client.get("/keyword-intel/jobs?limit=20")
    assert jobs_response.status_code == 200
    jobs = jobs_response.json()
    matching = [job for job in jobs if job["run_id"] == run_id]
    assert matching
    assert matching[0]["seed"] == "restaurants near larcomar"
    assert matching[0]["market_profile"] == "tourists_in_peru_en"
    assert matching[0]["geo"] == "pe"
    assert matching[0]["language"] == "en"
    assert matching[0]["filtered_out_phrase_count"] == 1
    assert matching[0]["group_count"] == 3

    clear_all_runs(feature="keyword_intel")
