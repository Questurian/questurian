"""HTTP client for the Location Manager server.

Used to enrich listicle blurb prompts with canonical venue facts (cuisines,
price level, hours, features, reviews metadata) keyed by the Payload doc the
operator selected for each item. Phase 1 — facts only; Reviews Digest is
deferred to Phase 2.
"""

from __future__ import annotations

import logging
from typing import Any, Literal

import httpx

from app.config import LM_API_URL

logger = logging.getLogger(__name__)

LMCollection = Literal[
    "dining", "accommodations", "attractions", "nightlife", "key-locations"
]

LM_LOCATIONS_BY_REFS_PATH = "/api/payload/locations/by-refs"
LM_REQUEST_TIMEOUT_SECONDS = 5.0


def fetch_editorial_locations_by_payload_refs(
    refs: list[dict[str, str]],
) -> dict[str, dict[str, Any]]:
    """POST refs to LM and return a {docId: location_dict} map for hits only.

    Misses (no_sync_state / entity_missing) are omitted; the caller proceeds
    without enrichment for those items rather than blocking the whole run.
    Network or HTTP errors are logged and produce an empty dict — degraded mode
    keeps the existing generation path working.
    """
    if not refs:
        return {}

    url = f"{LM_API_URL.rstrip('/')}{LM_LOCATIONS_BY_REFS_PATH}"
    try:
        response = httpx.post(
            url,
            json={"refs": refs},
            timeout=LM_REQUEST_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
    except httpx.HTTPError as exc:
        logger.warning("LM enrichment request failed: %s", exc)
        return {}

    try:
        body = response.json()
    except ValueError as exc:
        logger.warning("LM enrichment returned non-JSON: %s", exc)
        return {}

    data = body.get("data") if isinstance(body, dict) else None
    results = data.get("results") if isinstance(data, dict) else None
    if not isinstance(results, list):
        return {}

    by_doc_id: dict[str, dict[str, Any]] = {}
    for result in results:
        if not isinstance(result, dict):
            continue
        if not result.get("found"):
            continue
        doc_id = result.get("docId")
        location = result.get("location")
        if not (isinstance(doc_id, str) and isinstance(location, dict)):
            continue
        # Attach the digest sibling onto the location dict for a simple
        # downstream contract: consumers see one object per docId.
        digest = result.get("reviewsDigest")
        if isinstance(digest, dict):
            location = {**location, "_reviewsDigest": digest}
        by_doc_id[doc_id] = location
    return by_doc_id
