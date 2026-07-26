import ast
from pathlib import Path

from fastapi import FastAPI

import app.features.editor_assist.listicle_content as listicle_content
import app.features.editor_assist.listicle_content_contracts as listicle_contracts
from app.features.editor_assist.routes import router


EXPECTED_ROUTES = {
    ("GET", "/editor-assist/listicle-guidelines"),
    ("POST", "/editor-assist/compose-itinerary-brief"),
    ("POST", "/editor-assist/compose-itinerary-day-blurbs"),
    ("POST", "/editor-assist/compose-itinerary-intro"),
    ("POST", "/editor-assist/compose-itinerary-stop-reason"),
    ("POST", "/editor-assist/generate-listicle-content"),
    ("POST", "/editor-assist/generate-seo-metadata"),
    ("POST", "/editor-assist/generate-title"),
    ("POST", "/editor-assist/rewrite-block"),
}


def test_editor_assist_http_contract_keeps_all_nine_routes():
    app = FastAPI()
    app.include_router(router)

    actual = {
        (method, route.path)
        for route in app.routes
        for method in route.methods or set()
        if route.path.startswith("/editor-assist")
    }

    assert actual == EXPECTED_ROUTES


def test_root_routes_module_only_aggregates_family_routers():
    routes_path = (
        Path(__file__).parents[1] / "app" / "features" / "editor_assist" / "routes.py"
    )
    module = ast.parse(routes_path.read_text())

    assert not any(
        isinstance(node, (ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef))
        for node in module.body
    )

    included_routers = [
        node
        for node in module.body
        if isinstance(node, ast.Expr)
        and isinstance(node.value, ast.Call)
        and isinstance(node.value.func, ast.Attribute)
        and node.value.func.attr == "include_router"
    ]
    assert len(included_routers) == 4


def test_blurb_composer_remains_a_thin_compatible_orchestrator():
    composer_path = (
        Path(__file__).parents[1]
        / "app"
        / "features"
        / "editor_assist"
        / "blurb_composer.py"
    )
    source = composer_path.read_text()
    module = ast.parse(source)

    top_level_defs = [
        node
        for node in module.body
        if isinstance(node, (ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef))
    ]
    assert len(source.splitlines()) <= 200
    assert [node.name for node in top_level_defs] == [
        "_elapsed_ms",
        "_critical_fields_step",
        "compose_listicle_target",
    ]

    imported_modules = {
        node.module
        for node in module.body
        if isinstance(node, ast.ImportFrom) and node.module
    }
    assert "listicle_writer" not in imported_modules
    assert "writer_brief" not in imported_modules


def test_listicle_writer_remains_a_thin_compatible_facade():
    feature_path = Path(__file__).parents[1] / "app" / "features" / "editor_assist"
    facade_path = feature_path / "listicle_writer.py"
    source = facade_path.read_text()
    module = ast.parse(source)

    top_level_defs = [
        node
        for node in module.body
        if isinstance(node, (ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef))
    ]
    imported_modules = {
        node.module
        for node in module.body
        if isinstance(node, ast.ImportFrom) and node.module
    }

    assert len(source.splitlines()) <= 120
    assert top_level_defs == []
    assert {
        "blurb_composition_retry",
        "listicle_prompt_builders",
        "listicle_prompt_policy",
        "listicle_writer_contracts",
        "listicle_writer_validation",
    }.issubset(imported_modules)


def test_research_profile_remains_a_thin_compatible_facade():
    feature_path = Path(__file__).parents[1] / "app" / "features" / "editor_assist"
    facade_path = feature_path / "research_profile.py"
    source = facade_path.read_text()
    module = ast.parse(source)

    top_level_defs = [
        node
        for node in module.body
        if isinstance(node, (ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef))
    ]
    imported_modules = {
        node.module
        for node in module.body
        if isinstance(node, ast.ImportFrom) and node.module
    }

    assert len(source.splitlines()) <= 120
    assert [node.name for node in top_level_defs] == [
        "_invoke_grounded",
        "run_research_profile",
        "run_research_profiles_concurrently",
    ]
    assert {
        "research_profile_batch",
        "research_profile_contracts",
        "research_profile_execution",
        "research_profile_parsing",
        "research_profile_prompt",
    }.issubset(imported_modules)


def test_writer_brief_remains_a_thin_compatible_facade():
    feature_path = Path(__file__).parents[1] / "app" / "features" / "editor_assist"
    facade_path = feature_path / "writer_brief.py"
    source = facade_path.read_text()
    module = ast.parse(source)

    top_level_defs = [
        node
        for node in module.body
        if isinstance(node, (ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef))
    ]
    imported_modules = {
        node.module
        for node in module.body
        if isinstance(node, ast.ImportFrom) and node.module
    }

    assert len(source.splitlines()) <= 120
    assert [node.name for node in top_level_defs] == [
        "_invoke_curator_model",
        "run_writer_brief",
    ]
    assert {
        "writer_brief_contracts",
        "writer_brief_execution",
        "writer_brief_parsing",
        "writer_brief_policy",
        "writer_brief_prompt",
        "writer_brief_rendering",
    }.issubset(imported_modules)


def test_listicle_content_remains_a_thin_compatible_http_facade():
    feature_path = Path(__file__).parents[1] / "app" / "features" / "editor_assist"
    facade_path = feature_path / "listicle_content.py"
    source = facade_path.read_text()
    module = ast.parse(source)

    top_level_defs = [
        node
        for node in module.body
        if isinstance(node, (ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef))
    ]
    imported_modules = {
        node.module
        for node in module.body
        if isinstance(node, ast.ImportFrom) and node.module
    }

    assert len(source.splitlines()) <= 120
    assert [node.name for node in top_level_defs] == ["generate_listicle_content"]
    assert {
        "listicle_content_contracts",
        "listicle_content_generation",
        "listicle_guidelines",
    }.issubset(imported_modules)


def test_listicle_content_facade_preserves_http_contract_imports():
    assert (
        listicle_content.GenerateListicleContentRequest
        is listicle_contracts.GenerateListicleContentRequest
    )
    assert (
        listicle_content.GenerateListicleContentResponse
        is listicle_contracts.GenerateListicleContentResponse
    )
    assert (
        listicle_content.GenerateListicleTargetRequest
        is listicle_contracts.GenerateListicleTargetRequest
    )
    assert (
        listicle_content.GenerateListicleTargetResponse
        is listicle_contracts.GenerateListicleTargetResponse
    )
    assert (
        listicle_content.ListicleGuidelinesResponse
        is listicle_contracts.ListicleGuidelinesResponse
    )


def test_itinerary_composition_remains_a_thin_compatible_facade():
    feature_path = Path(__file__).parents[1] / "app" / "features" / "editor_assist"
    facade_path = feature_path / "itinerary_composition.py"
    source = facade_path.read_text()
    module = ast.parse(source)

    top_level_defs = [
        node
        for node in module.body
        if isinstance(node, (ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef))
    ]
    imported_modules = {
        node.module
        for node in module.body
        if isinstance(node, ast.ImportFrom) and node.module
    }

    assert len(source.splitlines()) <= 120
    assert top_level_defs == []
    assert {
        "itinerary_brief",
        "itinerary_composition_contracts",
        "itinerary_composition_routes",
        "itinerary_day_blurb_execution",
        "itinerary_day_blurb_prompt",
        "itinerary_intro",
        "itinerary_stop_reason",
    }.issubset(imported_modules)


def test_itinerary_composition_facade_preserves_contract_imports():
    from app.features.editor_assist import itinerary_composition
    from app.features.editor_assist import itinerary_composition_contracts
    from app.features.editor_assist import itinerary_composition_routes

    assert (
        itinerary_composition.ComposeItineraryBriefRequest
        is itinerary_composition_contracts.ComposeItineraryBriefRequest
    )
    assert (
        itinerary_composition.ComposeItineraryIntroResponse
        is itinerary_composition_contracts.ComposeItineraryIntroResponse
    )
    assert (
        itinerary_composition.ComposeDayBlurbsRequest
        is itinerary_composition_contracts.ComposeDayBlurbsRequest
    )
    assert (
        itinerary_composition.ComposeStopReasonResponse
        is itinerary_composition_contracts.ComposeStopReasonResponse
    )
    assert itinerary_composition.router is itinerary_composition_routes.router


def test_editor_assist_internals_do_not_depend_on_listicle_writer_facade():
    feature_path = Path(__file__).parents[1] / "app" / "features" / "editor_assist"
    facade_importers: list[str] = []
    for path in feature_path.rglob("*.py"):
        if path.name == "listicle_writer.py":
            continue
        module = ast.parse(path.read_text())
        if any(
            isinstance(node, ast.ImportFrom) and node.module == "listicle_writer"
            for node in module.body
        ):
            facade_importers.append(path.name)

    assert facade_importers == []
