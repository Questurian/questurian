from pathlib import Path


FEATURE_ROOT = Path(__file__).parents[1] / "app" / "features" / "url2blog"


def _production_sources() -> dict[Path, str]:
    return {
        path: path.read_text(encoding="utf-8") for path in FEATURE_ROOT.rglob("*.py")
    }


def test_url2blog_has_no_route_facade_or_sequential_pipeline() -> None:
    sources = _production_sources()

    assert not (FEATURE_ROOT / "routes.py").exists()
    assert not (FEATURE_ROOT / "pipeline_v2" / "phases.py").exists()
    assert all("_pipeline_v2_core" not in source for source in sources.values())
    assert all(
        "url2blog import routes" not in source and "url2blog.routes" not in source
        for source in sources.values()
    )


def test_run_recorder_owns_lifecycle_mutation() -> None:
    lifecycle_symbols = (
        "write_status",
        "write_stage_result",
        "write_artifact",
    )
    owners = {
        path.relative_to(FEATURE_ROOT)
        for path, source in _production_sources().items()
        if any(symbol in source for symbol in lifecycle_symbols)
    }

    assert owners == {Path("run_recorder.py")}
