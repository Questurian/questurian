"""AI routes for generating structured location document drafts."""

from __future__ import annotations

import json
import logging
import re
from functools import lru_cache
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import ConfigDict, Field, ValidationError

from .graph import (
    run_location_documents_fill_document_graph,
    run_location_documents_fill_field_graph,
    run_location_documents_fill_section_graph,
)
from .models import (
    FIELD_PATHS_BY_LEVEL,
    SECTION_MODEL_BY_PATH,
    SECTION_PATHS_BY_LEVEL,
    LocationDocumentDraft,
    LocationLevel,
    StrictModel,
    is_field_path_allowed,
    is_section_path_allowed,
)

router = APIRouter(prefix="/location-documents/ai", tags=["location-documents-ai"])
logger = logging.getLogger(__name__)

DEFAULT_MODEL = "gemini-2.5-flash-lite"
MAX_INSTRUCTION_CHARS = 10000
MAX_SOURCE_NOTES_CHARS = 60000
MAX_PATH_CHARS = 160
MAX_FIELD_VALUE_CHARS = 8000


class AliasModel(StrictModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class FillDocumentRequest(AliasModel):
    draft: LocationDocumentDraft
    instruction: str | None = Field(default=None, max_length=MAX_INSTRUCTION_CHARS)
    source_notes: str | None = Field(
        default=None,
        alias="sourceNotes",
        max_length=MAX_SOURCE_NOTES_CHARS,
    )
    model_name: str | None = Field(default=None, alias="modelName", max_length=120)


class FillDocumentResponse(AliasModel):
    document: LocationDocumentDraft
    model_used: str = Field(alias="modelUsed")


class FillSectionRequest(AliasModel):
    draft: LocationDocumentDraft
    section_path: str = Field(alias="sectionPath", min_length=1, max_length=MAX_PATH_CHARS)
    current_section: dict[str, Any] | None = Field(default=None, alias="currentSection")
    instruction: str | None = Field(default=None, max_length=MAX_INSTRUCTION_CHARS)
    source_notes: str | None = Field(
        default=None,
        alias="sourceNotes",
        max_length=MAX_SOURCE_NOTES_CHARS,
    )
    model_name: str | None = Field(default=None, alias="modelName", max_length=120)


class FillSectionResponse(AliasModel):
    section_path: str = Field(alias="sectionPath")
    section: dict[str, Any]
    model_used: str = Field(alias="modelUsed")


class FillFieldRequest(AliasModel):
    draft: LocationDocumentDraft
    field_path: str = Field(alias="fieldPath", min_length=1, max_length=MAX_PATH_CHARS)
    current_value: str | None = Field(
        default=None,
        alias="currentValue",
        max_length=MAX_FIELD_VALUE_CHARS,
    )
    instruction: str | None = Field(default=None, max_length=MAX_INSTRUCTION_CHARS)
    source_notes: str | None = Field(
        default=None,
        alias="sourceNotes",
        max_length=MAX_SOURCE_NOTES_CHARS,
    )
    model_name: str | None = Field(default=None, alias="modelName", max_length=120)


class FillFieldResponse(AliasModel):
    field_path: str = Field(alias="fieldPath")
    value: str
    model_used: str = Field(alias="modelUsed")


class _GeneratedFieldValue(AliasModel):
    value: str = ""


JSON_RETRY_PROMPT = """Your previous response was not valid JSON for the requested shape.

Return only corrected JSON. Do not include markdown, commentary, or code fences.

Parse or validation error:
{parse_error}

Original prompt:
{original_prompt}

Previous response:
{previous_response}"""


DOCUMENT_FILL_RULES = """You are filling a structured JSON draft for a Payload CMS `locations` document.

Hard rules:
- Return only a single JSON object matching the requested schema.
- Do not include markdown, commentary, backticks, or code fences.
- Preserve existing user-provided values unless the instruction clearly asks for changes.
- Unknown values must stay as empty strings, nulls, or empty arrays.
- Do not invent numeric Payload IDs for relationships.
- Use the UI-only hint fields when you want to suggest media or neighborhood relationships:
  - guide.media.coverImageHint
  - guide.localShared.usefulApps.apps[].logoHint
  - guide.explore/stay/move.highlights[].relatedNeighborhoodKeys
- If a relationship ID is unknown, keep the real ID field null or [] and use the hint/key field instead.
- Level rules:
  - country documents may use only guide.media and guide.countryData
  - city and neighborhood documents may use only guide.media, guide.localShared, guide.explore, guide.stay, and guide.move"""


SECTION_FILL_RULES = """You are filling one structured section inside a Payload CMS `locations` document draft.

Hard rules:
- Return only the target section JSON object, not the whole document.
- Do not include markdown, commentary, backticks, or code fences.
- Preserve existing user-provided values unless the instruction clearly asks for changes.
- Unknown values must stay as empty strings, nulls, or empty arrays.
- Do not invent numeric Payload IDs."""


FIELD_FILL_RULES = """You are filling one scalar text field inside a Payload CMS `locations` document draft.

Hard rules:
- Return only a JSON object with exactly one key: {"value": "..."}.
- The value must be plain text only.
- Do not include markdown, commentary, or code fences.
- Preserve existing user-provided values unless the instruction clearly asks for changes.
- If the answer is unknown, return an empty string."""


def _get_vertex_llm(**kwargs):
    from utils import get_vertex_llm

    return get_vertex_llm(**kwargs)


def _safe_text(value: Any) -> str:
    if isinstance(value, str):
        return value.strip()
    content = getattr(value, "content", None)
    if isinstance(content, str):
        return content.strip()
    return ""


def _extract_json_payload(raw_text: str) -> str:
    cleaned = raw_text.strip()
    if not cleaned:
        return ""

    fenced = re.match(
        r"^\s*```(?:json)?\s*(.*?)\s*```\s*$",
        cleaned,
        flags=re.S | re.I,
    )
    if fenced:
        return fenced.group(1).strip()
    return cleaned


def _extract_first_json_object(text: str) -> str | None:
    start = text.find("{")
    if start == -1:
        return None

    depth = 0
    in_string = False
    escape = False

    for idx in range(start, len(text)):
        char = text[idx]

        if in_string:
            if escape:
                escape = False
            elif char == "\\":
                escape = True
            elif char == '"':
                in_string = False
            continue

        if char == '"':
            in_string = True
            continue

        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return text[start : idx + 1]

    return None


def _strip_trailing_commas(text: str) -> str:
    previous = None
    current = text
    while previous != current:
        previous = current
        current = re.sub(r",(\s*[}\]])", r"\1", current)
    return current


def _strict_parse_object(raw_text: str) -> tuple[dict[str, Any] | None, str | None]:
    try:
        parsed = json.loads(raw_text.strip())
    except json.JSONDecodeError as exc:
        return None, str(exc)
    if not isinstance(parsed, dict):
        return None, "Expected a JSON object in LLM response."
    return parsed, None


def _repair_parse_object(raw_text: str) -> tuple[dict[str, Any] | None, str | None]:
    cleaned = _extract_json_payload(raw_text)
    if not cleaned:
        return None, "Empty response"

    candidate = _extract_first_json_object(cleaned)
    if not candidate:
        obj_start = cleaned.find("{")
        if obj_start == -1:
            return None, "No JSON object found in response."
        candidate = cleaned[obj_start:]

    try:
        parsed = json.loads(candidate)
    except json.JSONDecodeError:
        try:
            parsed = json.loads(_strip_trailing_commas(candidate))
        except json.JSONDecodeError as exc:
            return None, str(exc)

    if not isinstance(parsed, dict):
        return None, "Expected a JSON object in LLM response."
    return parsed, None


def _build_retry_prompt(
    *,
    original_prompt: str,
    previous_response: str,
    parse_error: str,
) -> str:
    return JSON_RETRY_PROMPT.format(
        parse_error=parse_error,
        original_prompt=original_prompt,
        previous_response=previous_response,
    )


def _get_value_at_path(payload: dict[str, Any], dotted_path: str) -> Any:
    current: Any = payload
    for part in dotted_path.split("."):
        if not isinstance(current, dict):
            return None
        current = current.get(part)
        if current is None:
            return None
    return current


def _json_text(value: Any) -> str:
    return json.dumps(value, ensure_ascii=True, indent=2, sort_keys=True)


def _current_section_payload(request: FillSectionRequest) -> dict[str, Any] | None:
    if request.current_section is not None:
        return request.current_section
    draft_payload = request.draft.model_dump(by_alias=True, exclude_none=False)
    section_value = _get_value_at_path(draft_payload, request.section_path)
    return section_value if isinstance(section_value, dict) else None


def _current_field_value(request: FillFieldRequest) -> str:
    if request.current_value is not None:
        return request.current_value
    draft_payload = request.draft.model_dump(by_alias=True, exclude_none=False)
    field_value = _get_value_at_path(draft_payload, request.field_path)
    return field_value if isinstance(field_value, str) else ""


@lru_cache(maxsize=1)
def _document_schema_text() -> str:
    return _json_text(LocationDocumentDraft.model_json_schema(by_alias=True))


@lru_cache(maxsize=8)
def _section_schema_text(section_path: str) -> str:
    model = SECTION_MODEL_BY_PATH[section_path]
    return _json_text(model.model_json_schema(by_alias=True))


def _level_rules_text(level: LocationLevel) -> str:
    allowed_sections = ", ".join(sorted(SECTION_PATHS_BY_LEVEL[level]))
    allowed_fields = ", ".join(sorted(FIELD_PATHS_BY_LEVEL[level]))
    return (
        f"Draft level: {level}\n"
        f"Allowed section paths for this level: {allowed_sections}\n"
        f"Allowed field paths for this level: {allowed_fields}"
    )


def _build_document_prompt(request: FillDocumentRequest) -> str:
    parts = [
        DOCUMENT_FILL_RULES,
        _level_rules_text(request.draft.level),
        "Authoritative JSON schema:",
        _document_schema_text(),
        "Current draft JSON:",
        _json_text(request.draft.model_dump(by_alias=True, exclude_none=False)),
    ]
    if request.instruction:
        parts.extend(["Instruction:", request.instruction.strip()])
    if request.source_notes:
        parts.extend(["Source notes:", request.source_notes.strip()])
    return "\n\n".join(parts)


def _build_section_prompt(request: FillSectionRequest) -> str:
    parts = [
        SECTION_FILL_RULES,
        _level_rules_text(request.draft.level),
        f"Target section path: {request.section_path}",
        "Target section schema:",
        _section_schema_text(request.section_path),
        "Current draft JSON:",
        _json_text(request.draft.model_dump(by_alias=True, exclude_none=False)),
        "Current target section JSON:",
        _json_text(_current_section_payload(request) or {}),
    ]
    if request.instruction:
        parts.extend(["Instruction:", request.instruction.strip()])
    if request.source_notes:
        parts.extend(["Source notes:", request.source_notes.strip()])
    return "\n\n".join(parts)


def _build_field_prompt(request: FillFieldRequest) -> str:
    parts = [
        FIELD_FILL_RULES,
        _level_rules_text(request.draft.level),
        f"Target field path: {request.field_path}",
        "Current draft JSON:",
        _json_text(request.draft.model_dump(by_alias=True, exclude_none=False)),
        f"Current field value: {_json_text(_current_field_value(request))}",
    ]
    if request.instruction:
        parts.extend(["Instruction:", request.instruction.strip()])
    if request.source_notes:
        parts.extend(["Source notes:", request.source_notes.strip()])
    return "\n\n".join(parts)


def _invoke_json_llm_with_retry(
    *,
    prompt: str,
    model_used: str,
    temperature: float,
    max_tokens: int,
    validator,
    label: str,
):
    llm = _get_vertex_llm(
        temperature=temperature,
        max_tokens=max_tokens,
        model_name=model_used,
    )

    last_raw = ""
    last_error = "Unknown parse error"

    for attempt in range(2):
        current_prompt = (
            prompt
            if attempt == 0
            else _build_retry_prompt(
                original_prompt=prompt,
                previous_response=last_raw,
                parse_error=last_error,
            )
        )
        result = llm.invoke(current_prompt)
        raw_text = _safe_text(result)
        if not raw_text:
            raise RuntimeError(f"{label} returned empty output")
        last_raw = raw_text
        parsed, parse_error = _strict_parse_object(raw_text)
        if parsed is not None:
            try:
                return validator(parsed)
            except ValidationError as exc:
                last_error = str(exc)
                continue
        last_error = parse_error or "Strict parse failed"

    repaired, repair_error = _repair_parse_object(last_raw)
    if repaired is not None:
        return validator(repaired)

    raise RuntimeError(
        f"{label} parse failed after retry and repair: {last_error}; repair error: {repair_error}"
    )


def _validate_section_path(level: LocationLevel, section_path: str) -> None:
    if not is_section_path_allowed(level, section_path):
        allowed = ", ".join(sorted(SECTION_PATHS_BY_LEVEL[level]))
        raise HTTPException(
            status_code=400,
            detail=f"sectionPath must be one of: {allowed}",
        )


def _validate_field_path(level: LocationLevel, field_path: str) -> None:
    if not is_field_path_allowed(level, field_path):
        allowed = ", ".join(sorted(FIELD_PATHS_BY_LEVEL[level]))
        raise HTTPException(
            status_code=400,
            detail=f"fieldPath must be one of: {allowed}",
        )


def _fill_document_impl(request: FillDocumentRequest) -> FillDocumentResponse:
    model_used = (request.model_name or DEFAULT_MODEL).strip() or DEFAULT_MODEL
    prompt = _build_document_prompt(request)

    try:
        document = _invoke_json_llm_with_retry(
            prompt=prompt,
            model_used=model_used,
            temperature=0.2,
            max_tokens=8192,
            validator=LocationDocumentDraft.model_validate,
            label="Location document fill",
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("Location documents fill-document failed: %s", exc)
        raise HTTPException(
            status_code=502,
            detail="AI location document generation failed",
        ) from exc

    return FillDocumentResponse(document=document, model_used=model_used)


def _fill_section_impl(request: FillSectionRequest) -> FillSectionResponse:
    _validate_section_path(request.draft.level, request.section_path)
    model_used = (request.model_name or DEFAULT_MODEL).strip() or DEFAULT_MODEL
    prompt = _build_section_prompt(request)
    section_model = SECTION_MODEL_BY_PATH[request.section_path]

    try:
        section = _invoke_json_llm_with_retry(
            prompt=prompt,
            model_used=model_used,
            temperature=0.2,
            max_tokens=8192,
            validator=section_model.model_validate,
            label=f"Location section fill for {request.section_path}",
        )
    except ValidationError as exc:
        logger.exception("Location documents fill-section validation failed: %s", exc)
        raise HTTPException(
            status_code=502,
            detail="AI location section generation returned invalid data",
        ) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Location documents fill-section failed: %s", exc)
        raise HTTPException(
            status_code=502,
            detail="AI location section generation failed",
        ) from exc

    return FillSectionResponse(
        section_path=request.section_path,
        section=section.model_dump(by_alias=True, exclude_none=False),
        model_used=model_used,
    )


def _fill_field_impl(request: FillFieldRequest) -> FillFieldResponse:
    _validate_field_path(request.draft.level, request.field_path)
    model_used = (request.model_name or DEFAULT_MODEL).strip() or DEFAULT_MODEL
    prompt = _build_field_prompt(request)

    try:
        payload = _invoke_json_llm_with_retry(
            prompt=prompt,
            model_used=model_used,
            temperature=0.3,
            max_tokens=2048,
            validator=_GeneratedFieldValue.model_validate,
            label=f"Location field fill for {request.field_path}",
        )
    except ValidationError as exc:
        logger.exception("Location documents fill-field validation failed: %s", exc)
        raise HTTPException(
            status_code=502,
            detail="AI location field generation returned invalid data",
        ) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Location documents fill-field failed: %s", exc)
        raise HTTPException(
            status_code=502,
            detail="AI location field generation failed",
        ) from exc

    return FillFieldResponse(
        field_path=request.field_path,
        value=payload.value,
        model_used=model_used,
    )


@router.post("/fill-document", response_model=FillDocumentResponse)
async def fill_document(request: FillDocumentRequest) -> FillDocumentResponse:
    try:
        return run_location_documents_fill_document_graph(
            step_runner=lambda: _fill_document_impl(request),
        )
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception("Location documents graph fill-document failed: %s", exc)
        raise HTTPException(
            status_code=502,
            detail="AI location document generation graph failed",
        ) from exc


@router.post("/fill-section", response_model=FillSectionResponse)
async def fill_section(request: FillSectionRequest) -> FillSectionResponse:
    try:
        return run_location_documents_fill_section_graph(
            step_runner=lambda: _fill_section_impl(request),
        )
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception("Location documents graph fill-section failed: %s", exc)
        raise HTTPException(
            status_code=502,
            detail="AI location section generation graph failed",
        ) from exc


@router.post("/fill-field", response_model=FillFieldResponse)
async def fill_field(request: FillFieldRequest) -> FillFieldResponse:
    try:
        return run_location_documents_fill_field_graph(
            step_runner=lambda: _fill_field_impl(request),
        )
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception("Location documents graph fill-field failed: %s", exc)
        raise HTTPException(
            status_code=502,
            detail="AI location field generation graph failed",
        ) from exc
