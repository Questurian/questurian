"""Shared request builders for image route tests."""


def _auth_headers() -> dict[str, str]:
    return {"Authorization": "Bearer test-token"}


def _variant_files() -> list[tuple[str, tuple[str, bytes, str]]]:
    return [
        ("variants", ("thumbnail.webp", b"thumbnail", "image/webp")),
        ("variants", ("square.webp", b"square", "image/webp")),
        ("variants", ("wide.webp", b"wide", "image/webp")),
        ("variants", ("portrait.webp", b"portrait", "image/webp")),
        ("variants", ("hero.webp", b"hero", "image/webp")),
        ("variants", ("open_graph.webp", b"open-graph", "image/webp")),
        ("variants", ("editorial.webp", b"editorial", "image/webp")),
    ]


def _variant_form_parts(
    variant_types: list[str],
    external_ref: str,
    alt_text: str,
    location_ref: int,
    photographer_credit: str = "Photo by Test",
) -> list[tuple[str, tuple[None, str]]]:
    return [
        ("variant_types", (None, variant_type)) for variant_type in variant_types
    ] + [
        ("external_ref", (None, external_ref)),
        ("alt_text", (None, alt_text)),
        ("photographer_credit", (None, photographer_credit)),
        ("location_ref", (None, str(location_ref))),
    ]
