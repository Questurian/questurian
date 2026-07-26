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
