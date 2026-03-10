"""Payload-backed currency reference loading for location document AI routes."""

from __future__ import annotations

import os
import re
import threading
import time
from dataclasses import dataclass
from typing import Any

import httpx

DEFAULT_PAYLOAD_API_URL = "http://localhost:4000"
CURRENCY_REFERENCE_CACHE_TTL_SECONDS = 60.0
_CACHE_LOCK = threading.Lock()
_CACHE_STATE: dict[str, Any] = {
    "expires_at": 0.0,
    "values": None,
}


@dataclass(frozen=True)
class CurrencyLatestUsdRate:
    units_per_usd: float
    provider: str
    source_updated_at: str
    next_update_at: str
    fetched_at: str


@dataclass(frozen=True)
class CurrencyReference:
    id: int
    code: str
    name: str
    symbol: str
    display_symbol: str
    default_locale: str
    decimal_places: int
    used_in: tuple[str, ...]
    notes: str
    latest_usd_rate: CurrencyLatestUsdRate | None = None


def normalize_currency_code(value: str | None) -> str:
    return value.strip().upper() if isinstance(value, str) else ""


def _normalize_lookup_token(value: str | None) -> str:
    if not isinstance(value, str):
        return ""
    return re.sub(r"[^a-z0-9]+", " ", value.strip().lower()).strip()


def _resolve_payload_api_url() -> str:
    configured_url = os.getenv("PAYLOAD_API_URL")
    if configured_url:
        return configured_url.rstrip("/")
    return DEFAULT_PAYLOAD_API_URL


def _parse_currency_reference(doc: Any) -> CurrencyReference | None:
    if not isinstance(doc, dict):
        return None

    raw_id = doc.get("id")
    if not isinstance(raw_id, int):
        return None

    code = normalize_currency_code(doc.get("code"))
    name = doc.get("name").strip() if isinstance(doc.get("name"), str) else ""
    if not code or not name:
        return None

    symbol = doc.get("symbol").strip() if isinstance(doc.get("symbol"), str) else ""
    display_symbol = (
        doc.get("displaySymbol").strip()
        if isinstance(doc.get("displaySymbol"), str)
        else symbol
    )
    default_locale = (
        doc.get("defaultLocale").strip()
        if isinstance(doc.get("defaultLocale"), str)
        else ""
    )
    decimal_places = doc.get("decimalPlaces")
    used_in_rows = doc.get("usedIn")

    used_in: list[str] = []
    if isinstance(used_in_rows, list):
        for row in used_in_rows:
            if not isinstance(row, dict):
                continue
            country = row.get("country")
            if isinstance(country, str) and country.strip():
                used_in.append(country.strip())

    latest_rate = doc.get("latestUsdRate")
    parsed_latest_rate: CurrencyLatestUsdRate | None = None
    if isinstance(latest_rate, dict):
        units_per_usd = latest_rate.get("unitsPerUsd")
        provider = latest_rate.get("provider")
        source_updated_at = latest_rate.get("sourceUpdatedAt")
        next_update_at = latest_rate.get("nextUpdateAt")
        fetched_at = latest_rate.get("fetchedAt")
        if (
            isinstance(units_per_usd, (int, float))
            and float(units_per_usd) > 0
            and isinstance(provider, str)
            and provider.strip()
            and isinstance(source_updated_at, str)
            and source_updated_at.strip()
            and isinstance(next_update_at, str)
            and next_update_at.strip()
            and isinstance(fetched_at, str)
            and fetched_at.strip()
        ):
            parsed_latest_rate = CurrencyLatestUsdRate(
                units_per_usd=float(units_per_usd),
                provider=provider.strip(),
                source_updated_at=source_updated_at.strip(),
                next_update_at=next_update_at.strip(),
                fetched_at=fetched_at.strip(),
            )

    return CurrencyReference(
        id=raw_id,
        code=code,
        name=name,
        symbol=symbol,
        display_symbol=display_symbol,
        default_locale=default_locale,
        decimal_places=decimal_places if isinstance(decimal_places, int) else 2,
        used_in=tuple(used_in),
        notes=doc.get("notes").strip() if isinstance(doc.get("notes"), str) else "",
        latest_usd_rate=parsed_latest_rate,
    )


def _fetch_active_currency_references() -> list[CurrencyReference]:
    docs: list[CurrencyReference] = []
    page = 1
    total_pages = 1
    api_url = _resolve_payload_api_url()

    while page <= total_pages:
        params = {
            "depth": "0",
            "limit": "200",
            "page": str(page),
            "sort": "code",
            "where[status][equals]": "active",
            "select[id]": "true",
            "select[code]": "true",
            "select[name]": "true",
            "select[symbol]": "true",
            "select[displaySymbol]": "true",
            "select[defaultLocale]": "true",
            "select[decimalPlaces]": "true",
            "select[latestUsdRate]": "true",
            "select[usedIn]": "true",
            "select[notes]": "true",
        }
        response = httpx.get(
            f"{api_url}/api/currencies",
            params=params,
            headers={"Accept": "application/json"},
            timeout=6.0,
        )
        response.raise_for_status()
        payload = response.json()
        raw_docs = payload.get("docs")
        if isinstance(raw_docs, list):
            for raw_doc in raw_docs:
                parsed = _parse_currency_reference(raw_doc)
                if parsed is not None:
                    docs.append(parsed)
        total_pages = payload.get("totalPages", 1)
        total_pages = total_pages if isinstance(total_pages, int) and total_pages > 0 else 1
        page += 1

    return docs


def get_active_currency_references(*, force_refresh: bool = False) -> list[CurrencyReference]:
    now = time.monotonic()

    with _CACHE_LOCK:
        cached_values = _CACHE_STATE.get("values")
        cached_expiry = _CACHE_STATE.get("expires_at", 0.0)
        if (
            not force_refresh
            and isinstance(cached_values, list)
            and isinstance(cached_expiry, float)
            and cached_expiry > now
        ):
            return cached_values

    fresh_values = _fetch_active_currency_references()

    with _CACHE_LOCK:
        _CACHE_STATE["values"] = fresh_values
        _CACHE_STATE["expires_at"] = now + CURRENCY_REFERENCE_CACHE_TTL_SECONDS

    return fresh_values


def clear_currency_reference_cache() -> None:
    with _CACHE_LOCK:
        _CACHE_STATE["values"] = None
        _CACHE_STATE["expires_at"] = 0.0


def find_currency_reference_by_id(
    currency_id: int | None,
    currencies: list[CurrencyReference],
) -> CurrencyReference | None:
    if not isinstance(currency_id, int):
        return None
    for currency in currencies:
        if currency.id == currency_id:
            return currency
    return None


def find_currency_reference_by_code(
    currency_code: str | None,
    currencies: list[CurrencyReference],
) -> CurrencyReference | None:
    normalized_code = normalize_currency_code(currency_code)
    if not normalized_code:
        return None
    matches = [currency for currency in currencies if currency.code == normalized_code]
    return matches[0] if len(matches) == 1 else None


def find_currency_reference_by_country(
    country_values: list[str],
    currencies: list[CurrencyReference],
) -> CurrencyReference | None:
    country_tokens = {
        token
        for token in (_normalize_lookup_token(value) for value in country_values)
        if token
    }
    if not country_tokens:
        return None

    matches = [
        currency
        for currency in currencies
        if any(_normalize_lookup_token(country) in country_tokens for country in currency.used_in)
    ]
    return matches[0] if len(matches) == 1 else None


def build_currency_prompt_payload(
    currencies: list[CurrencyReference],
) -> list[dict[str, Any]]:
    return [
        {
            "code": currency.code,
            "name": currency.name,
            "symbol": currency.symbol,
            "displaySymbol": currency.display_symbol,
            "defaultLocale": currency.default_locale,
            "decimalPlaces": currency.decimal_places,
            "latestUsdRate": (
                {
                    "unitsPerUsd": currency.latest_usd_rate.units_per_usd,
                    "provider": currency.latest_usd_rate.provider,
                    "sourceUpdatedAt": currency.latest_usd_rate.source_updated_at,
                    "nextUpdateAt": currency.latest_usd_rate.next_update_at,
                    "fetchedAt": currency.latest_usd_rate.fetched_at,
                }
                if currency.latest_usd_rate is not None
                else None
            ),
            "usedIn": list(currency.used_in),
            "notes": currency.notes,
        }
        for currency in currencies
    ]
