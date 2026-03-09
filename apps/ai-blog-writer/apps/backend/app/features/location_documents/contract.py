"""Shared location guide contract loader for location document AI routes."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any


CONTRACT_PATH = Path(__file__).resolve().parents[7] / "location-guide-contract.json"


@lru_cache(maxsize=1)
def load_location_guide_contract() -> dict[str, Any]:
    return json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))


LOCATION_GUIDE_CONTRACT = load_location_guide_contract()
SECTION_PATHS_BY_LEVEL = LOCATION_GUIDE_CONTRACT["sectionPathsByLevel"]
FIELD_PATHS_BY_LEVEL = LOCATION_GUIDE_CONTRACT["fieldPathsByLevel"]
HIGHLIGHT_SECTION_PATHS = tuple(LOCATION_GUIDE_CONTRACT["highlightRules"]["sectionPaths"])
HIGHLIGHT_MIN = int(LOCATION_GUIDE_CONTRACT["highlightRules"]["min"])
HIGHLIGHT_MAX = int(LOCATION_GUIDE_CONTRACT["highlightRules"]["max"])
