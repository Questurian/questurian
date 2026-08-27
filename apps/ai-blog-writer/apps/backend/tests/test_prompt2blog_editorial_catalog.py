from __future__ import annotations

from app.features.prompt2blog.editorial_catalog import load_editorial_catalog


EXPECTED_FORM_IDS = [
    "news-report",
    "analysis",
    "explainer",
    "feature-profile",
    "interview-qa",
    "opinion-column",
    "personal-essay-travelogue",
    "destination-guide",
    "service-guide",
    "itinerary",
    "curated-list-best-of",
    "comparison",
    "review",
    "how-to-checklist",
    "cost-budget-breakdown",
]

EXPECTED_MODULE_IDS = [
    "cost-affordability",
    "accommodation-neighborhoods",
    "food-drink",
    "transportation",
    "safety",
    "visa-entry",
    "seasonality-weather",
    "adventure-outdoors",
    "long-stay-remote-work",
    "culture-etiquette",
]


def test_editorial_catalog_has_exact_v3_inventory_and_complete_rules():
    catalog = load_editorial_catalog()

    assert [item.id for item in catalog.forms] == EXPECTED_FORM_IDS
    assert [item.id for item in catalog.topic_modules] == EXPECTED_MODULE_IDS
    assert len({item.id for item in catalog.forms}) == 15
    assert len({item.id for item in catalog.topic_modules}) == 10
    assert all(item.label and item.description for item in catalog.forms)
    assert all(item.label and item.description for item in catalog.topic_modules)
    assert all(250 <= len(item.instructions.split()) <= 500 for item in catalog.forms)
    assert all(
        100 <= len(item.instructions.split()) <= 250 for item in catalog.topic_modules
    )
    assert catalog.house_rules.instructions
    assert catalog.headline_rules.instructions


def test_source_gated_forms_declare_deterministic_material_requirements():
    catalog = load_editorial_catalog()
    requirements = {item.id: item.source_requirements for item in catalog.forms}

    assert requirements["interview-qa"] == ["attributable-responses"]
    assert requirements["personal-essay-travelogue"] == ["first-person-material"]
    assert requirements["review"] == ["documented-evaluation"]
    assert requirements["feature-profile"] == ["reported-people-scenes-quotations"]


def test_every_form_ships_its_use_when_decision_sections():
    """The direction step chooses a form; it must see when not to pick one.

    Shipping only the one-line summary is what let "Where to eat in Lima right
    now" become a News Report: "reports a timely development" fits "right now",
    and news-report's own "do not use for broad destination summaries" never
    reached the chooser.
    """
    catalog = load_editorial_catalog()

    for form in catalog.forms:
        assert form.use_when, form.id
        assert form.do_not_use_when, form.id
        assert "## " not in form.use_when
        assert "## " not in form.do_not_use_when
        assert form.use_when != form.description
        assert form.do_not_use_when != form.description

    news = next(item for item in catalog.forms if item.id == "news-report")
    assert "broad destination summaries" in news.do_not_use_when
    listicle = next(item for item in catalog.forms if item.id == "curated-list-best-of")
    assert "neighborhood restaurants" in listicle.use_when

    exposed = catalog.public_metadata()["forms"][0]
    assert exposed["use_when"]
    assert exposed["do_not_use_when"]
