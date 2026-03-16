"""DataForSEO client helpers for keyword-intel collection."""

from __future__ import annotations

import os
import re
import unicodedata
from dataclasses import dataclass
from typing import Any

import httpx

DEFAULT_DATAFORSEO_BASE_URL = "https://api.dataforseo.com"
DEFAULT_TIMEOUT_SECONDS = 30.0
AUTOCOMPLETE_PATH = "/v3/serp/google/autocomplete/live/advanced"
ORGANIC_PATH = "/v3/serp/google/organic/live/advanced"
GOOGLE_LANGUAGES_PATH = "/v3/serp/google/languages"
GOOGLE_LOCATIONS_PATH_TEMPLATE = "/v3/serp/google/locations/{country_code}"


class DataForSEOError(RuntimeError):
    """Raised when the DataForSEO API returns an error."""


@dataclass(frozen=True)
class DataForSEOLanguage:
    language_code: str
    language_name: str


@dataclass(frozen=True)
class DataForSEOLocation:
    location_code: int
    location_name: str
    country_iso_code: str
    location_type: str


@dataclass(frozen=True)
class DataForSEORequestResult:
    method: str
    path: str
    request_payload: list[dict[str, Any]] | None
    response_payload: dict[str, Any]
    task_payload: dict[str, Any]


def _normalize_lookup_text(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value or "")
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii")
    ascii_text = ascii_text.lower()
    ascii_text = re.sub(r"[^a-z0-9]+", " ", ascii_text)
    return re.sub(r"\s+", " ", ascii_text).strip()


class DataForSEOClient:
    """Thin wrapper around the DataForSEO REST API."""

    def __init__(
        self,
        *,
        login: str | None = None,
        password: str | None = None,
        base_url: str | None = None,
        timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
    ) -> None:
        self._login = (login or os.getenv("DATAFORSEO_LOGIN") or "").strip()
        self._password = (password or os.getenv("DATAFORSEO_PASSWORD") or "").strip()
        self._base_url = (
            (base_url or os.getenv("DATAFORSEO_BASE_URL") or DEFAULT_DATAFORSEO_BASE_URL)
            .strip()
            .rstrip("/")
        )
        self._timeout_seconds = timeout_seconds

        if not self._login or not self._password:
            raise RuntimeError(
                "DataForSEO credentials are missing. Set DATAFORSEO_LOGIN and "
                "DATAFORSEO_PASSWORD in apps/backend/.env."
            )

    def resolve_language(self, language_code: str) -> DataForSEOLanguage:
        requested_code = (language_code or "").strip().lower()
        for item in self.get_google_languages():
            if item.language_code.lower() == requested_code:
                return item
        raise ValueError(f"Unsupported language code: {language_code}")

    def resolve_location(
        self,
        *,
        geo: str,
        region: str | None = None,
        city: str | None = None,
    ) -> DataForSEOLocation:
        country_code = (geo or "").strip().upper()
        locations = self.get_google_locations(country_code)
        if not locations:
            raise ValueError(f"Unsupported geo code: {geo}")

        if city:
            candidate = self._match_location(
                locations,
                target=city,
                secondary_target=region,
                preferred_types=("city", "county", "district", "borough"),
            )
            if candidate is None:
                raise ValueError(f"Could not resolve city '{city}' for geo '{geo}'.")
            return candidate

        if region:
            candidate = self._match_location(
                locations,
                target=region,
                secondary_target=None,
                preferred_types=("state", "province", "region", "county"),
            )
            if candidate is None:
                raise ValueError(f"Could not resolve region '{region}' for geo '{geo}'.")
            return candidate

        country_matches = [
            item
            for item in locations
            if item.country_iso_code.upper() == country_code
            and item.location_type.strip().lower() == "country"
        ]
        if country_matches:
            return country_matches[0]
        return locations[0]

    def get_google_languages(self) -> list[DataForSEOLanguage]:
        task = self._request("GET", GOOGLE_LANGUAGES_PATH).task_payload
        results = task.get("result") or []
        languages: list[DataForSEOLanguage] = []
        for item in results:
            if not isinstance(item, dict):
                continue
            code = str(item.get("language_code") or "").strip().lower()
            name = str(item.get("language_name") or "").strip()
            if not code or not name:
                continue
            languages.append(
                DataForSEOLanguage(language_code=code, language_name=name)
            )
        return languages

    def get_google_locations(self, country_code: str) -> list[DataForSEOLocation]:
        task = self._request(
            "GET",
            GOOGLE_LOCATIONS_PATH_TEMPLATE.format(
                country_code=(country_code or "").strip().lower()
            ),
        ).task_payload
        results = task.get("result") or []
        locations: list[DataForSEOLocation] = []
        for item in results:
            if not isinstance(item, dict):
                continue
            raw_location_code = item.get("location_code")
            if not isinstance(raw_location_code, int):
                continue
            location_name = str(item.get("location_name") or "").strip()
            country_iso_code = str(item.get("country_iso_code") or "").strip().upper()
            location_type = str(item.get("location_type") or "").strip()
            if not location_name or not country_iso_code:
                continue
            locations.append(
                DataForSEOLocation(
                    location_code=raw_location_code,
                    location_name=location_name,
                    country_iso_code=country_iso_code,
                    location_type=location_type,
                )
            )
        return locations

    def build_autocomplete_task(
        self,
        *,
        keyword: str,
        location_code: int,
        language_code: str,
        device: str = "desktop",
        search_domain: str | None = None,
    ) -> dict[str, Any]:
        task: dict[str, Any] = {
            "keyword": keyword,
            "location_code": location_code,
            "language_code": language_code,
            "client": "chrome" if device == "desktop" else "android",
        }
        if search_domain:
            task["se_domain"] = search_domain
        return task

    def build_organic_task(
        self,
        *,
        keyword: str,
        location_code: int,
        language_code: str,
        device: str = "desktop",
        search_domain: str | None = None,
    ) -> dict[str, Any]:
        task: dict[str, Any] = {
            "keyword": keyword,
            "location_code": location_code,
            "language_code": language_code,
            "device": device,
            "depth": 10,
        }
        if search_domain:
            task["se_domain"] = search_domain
        return task

    def execute_autocomplete_request(
        self,
        *,
        keyword: str,
        location_code: int,
        language_code: str,
        device: str = "desktop",
        search_domain: str | None = None,
    ) -> DataForSEORequestResult:
        request_payload = [
            self.build_autocomplete_task(
                keyword=keyword,
                location_code=location_code,
                language_code=language_code,
                device=device,
                search_domain=search_domain,
            )
        ]
        return self._request("POST", AUTOCOMPLETE_PATH, json_body=request_payload)

    def execute_organic_request(
        self,
        *,
        keyword: str,
        location_code: int,
        language_code: str,
        device: str = "desktop",
        search_domain: str | None = None,
    ) -> DataForSEORequestResult:
        request_payload = [
            self.build_organic_task(
                keyword=keyword,
                location_code=location_code,
                language_code=language_code,
                device=device,
                search_domain=search_domain,
            )
        ]
        return self._request("POST", ORGANIC_PATH, json_body=request_payload)

    @staticmethod
    def extract_autocomplete_suggestions(task_payload: dict[str, Any]) -> list[str]:
        phrases: list[str] = []
        for result in task_payload.get("result") or []:
            if not isinstance(result, dict):
                continue
            for item in result.get("items") or []:
                if not isinstance(item, dict):
                    continue
                suggestion = str(item.get("suggestion") or "")
                if suggestion.strip():
                    phrases.append(suggestion)
        return phrases

    @staticmethod
    def extract_organic_items(task_payload: dict[str, Any]) -> list[dict[str, Any]]:
        organic_items: list[dict[str, Any]] = []
        for result in task_payload.get("result") or []:
            if not isinstance(result, dict):
                continue
            for item in result.get("items") or []:
                if isinstance(item, dict):
                    organic_items.append(item)
        return organic_items

    def fetch_autocomplete_suggestions(
        self,
        *,
        keyword: str,
        location_code: int,
        language_code: str,
        device: str = "desktop",
        search_domain: str | None = None,
    ) -> list[str]:
        task_result = self.execute_autocomplete_request(
            keyword=keyword,
            location_code=location_code,
            language_code=language_code,
            device=device,
            search_domain=search_domain,
        )
        return self.extract_autocomplete_suggestions(task_result.task_payload)

    def fetch_organic_items(
        self,
        *,
        keyword: str,
        location_code: int,
        language_code: str,
        device: str = "desktop",
        search_domain: str | None = None,
    ) -> list[dict[str, Any]]:
        task_result = self.execute_organic_request(
            keyword=keyword,
            location_code=location_code,
            language_code=language_code,
            device=device,
            search_domain=search_domain,
        )
        return self.extract_organic_items(task_result.task_payload)

    def _match_location(
        self,
        locations: list[DataForSEOLocation],
        *,
        target: str,
        secondary_target: str | None,
        preferred_types: tuple[str, ...],
    ) -> DataForSEOLocation | None:
        normalized_target = _normalize_lookup_text(target)
        normalized_secondary = _normalize_lookup_text(secondary_target or "")
        if not normalized_target:
            return None

        scored_candidates: list[tuple[int, DataForSEOLocation]] = []
        for item in locations:
            normalized_name = _normalize_lookup_text(item.location_name)
            if not normalized_name:
                continue

            score = 0
            name_parts = [
                part.strip() for part in normalized_name.split(",") if part.strip()
            ]
            if normalized_target == normalized_name:
                score += 14
            elif any(part == normalized_target for part in name_parts):
                score += 12
            elif normalized_target in normalized_name:
                score += 8
            else:
                continue

            normalized_type = item.location_type.lower()
            if any(preferred_type in normalized_type for preferred_type in preferred_types):
                score += 4

            if normalized_secondary:
                if any(part == normalized_secondary for part in name_parts):
                    score += 6
                elif normalized_secondary in normalized_name:
                    score += 3

            scored_candidates.append((score, item))

        if not scored_candidates:
            return None

        scored_candidates.sort(
            key=lambda candidate: (
                candidate[0],
                "country" not in candidate[1].location_type.lower(),
                -len(candidate[1].location_name),
            ),
            reverse=True,
        )
        return scored_candidates[0][1]

    def _request(
        self,
        method: str,
        path: str,
        *,
        json_body: list[dict[str, Any]] | None = None,
    ) -> DataForSEORequestResult:
        try:
            with httpx.Client(
                base_url=self._base_url,
                auth=httpx.BasicAuth(self._login, self._password),
                timeout=self._timeout_seconds,
            ) as client:
                response = client.request(method, path, json=json_body)
            response.raise_for_status()
            payload = response.json()
        except httpx.HTTPError as exc:
            raise DataForSEOError(f"DataForSEO HTTP request failed: {exc}") from exc

        status_code = int(payload.get("status_code") or 0)
        if status_code != 20000:
            status_message = str(payload.get("status_message") or "Unknown DataForSEO error")
            raise DataForSEOError(
                f"DataForSEO request failed ({status_code}): {status_message}"
            )

        tasks = payload.get("tasks") or []
        if not tasks:
            raise DataForSEOError("DataForSEO response did not include any tasks.")

        task = tasks[0]
        if not isinstance(task, dict):
            raise DataForSEOError("DataForSEO task payload had an unexpected shape.")

        task_status_code = int(task.get("status_code") or 0)
        if task_status_code != 20000:
            task_status_message = str(
                task.get("status_message") or "Unknown DataForSEO task error"
            )
            raise DataForSEOError(
                f"DataForSEO task failed ({task_status_code}): {task_status_message}"
            )

        return DataForSEORequestResult(
            method=method,
            path=path,
            request_payload=json_body,
            response_payload=payload,
            task_payload=task,
        )
