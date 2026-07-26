import ast
from pathlib import Path

from fastapi import FastAPI

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
