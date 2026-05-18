"""
Editor Assist API routes.

Provides lightweight AI rewrite actions for staging block editors.
"""
import logging
import re
import time
from typing import Any, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .graph import (
    run_editor_assist_generate_title_graph,
    run_editor_assist_listicle_generation_graph,
    run_editor_assist_rewrite_graph,
)
from .angle_assignment import ListicleAngle as AssignmentAngle, assign_dining_angles
from .critical_fields import TierEvaluation, evaluate_tiers
from .listicle_writer import (
    ListicleArticleType,
    ListicleCategory,
    ListicleWriterTarget,
    build_fallback_research_prompt,
    build_retry_prompt,
    build_writer_prompt,
    strip_generation_fence,
    validate_generated_text,
)
from .lm_client import fetch_editorial_locations_by_payload_refs
from .writer_models import WriterModelError, invoke_writer_model

router = APIRouter(prefix="/editor-assist", tags=["editor-assist"])
logger = logging.getLogger(__name__)


def invoke_google_grounded_text(*args: Any, **kwargs: Any) -> Any:
    """Import grounding lazily so route modules stay importable under light test stubs."""
    from utils import invoke_google_grounded_text as _invoke_google_grounded_text

    return _invoke_google_grounded_text(*args, **kwargs)


DEFAULT_MODEL = "gemini-2.5-flash-lite"
MAX_PROMPT_CHARS = 10000
MAX_BLOCK_CHARS = 24000
MAX_ARTICLE_TITLE_CHARS = 300
MAX_ARTICLE_CONTEXT_CHARS = 120000
MAX_TITLE_CHARS = 200

BLOCK_REWRITE_PROMPT = """You are an expert editorial rewriting assistant.

You will receive:
1) An editor instruction.
2) The article title (reference only).
3) Optional full-article context (reference only).
4) One markdown article block that is the only section to rewrite.

Rewrite ONLY that single block according to the instruction.

Hard rules:
- Return only rewritten block content (markdown), no commentary.
- Treat the title and full-article context as reference only.
- Do not rewrite or summarize any other section.
- Preserve markdown semantics and readability.
- Do not add meta notes, explanations, or surrounding prose.
- Keep the response as one standalone block body.
- Do not wrap the result in code fences.

Return ONLY using this exact envelope:
<<<BLOCK>>>
[rewritten markdown block content]
<<<END_BLOCK>>>"""


class RewriteBlockRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=MAX_PROMPT_CHARS)
    block_content: str = Field(min_length=1, max_length=MAX_BLOCK_CHARS)
    model_name: str | None = Field(default=None, max_length=120)
    article_title: str | None = Field(
        default=None,
        max_length=MAX_ARTICLE_TITLE_CHARS,
    )
    article_context: str | None = Field(
        default=None,
        max_length=MAX_ARTICLE_CONTEXT_CHARS,
    )


class RewriteBlockResponse(BaseModel):
    rewritten_content: str
    model_used: str


def _safe_text(value: Any) -> str:
    if isinstance(value, str):
        return value.strip()
    content = getattr(value, "content", None)
    if isinstance(content, str):
        return content.strip()
    return ""


def _strip_markdown_fence(text: str) -> str:
    fenced = re.match(r"^\s*```(?:markdown|md)?\s*(.*?)\s*```\s*$", text, flags=re.S | re.I)
    if fenced:
        return fenced.group(1).strip()
    return text.strip()


def _extract_rewritten_block(raw_response: str) -> str:
    envelope_match = re.search(
        r"<<<BLOCK>>>\s*(.*?)\s*<<<END_BLOCK>>>",
        raw_response,
        flags=re.S | re.I,
    )
    if envelope_match:
        extracted = envelope_match.group(1).strip()
        return _strip_markdown_fence(extracted)

    # Fallback in case the model ignores envelope instructions.
    return _strip_markdown_fence(raw_response)


TITLE_IMPROVE_PROMPT = """You are a headline editor for a travel and lifestyle listicle publication.

You will receive an existing article title and an editor instruction for how to improve it.

Rules:
- Return only the final improved title text.
- No quotes, no markdown, no explanation, no commentary.
- Output exactly one line."""


class GenerateTitleRequest(BaseModel):
    current_title: str = Field(min_length=1, max_length=MAX_TITLE_CHARS)
    prompt: str = Field(min_length=1, max_length=MAX_PROMPT_CHARS)
    model_name: str | None = Field(default=None, max_length=120)


class GenerateTitleResponse(BaseModel):
    title: str


PayloadCollectionSlug = Literal[
    "dining", "accommodations", "attractions", "nightlife", "key-locations"
]
ListicleAngleRequest = Literal[
    "signature-dish", "atmosphere", "founders-backstory",
    "insider-tip", "best-for", "whats-different",
]


class GenerateListicleTargetRequest(BaseModel):
    target_id: str = Field(min_length=1, max_length=200)
    field_type: Literal["intro", "blurb"]
    category: ListicleCategory | None = None
    display_name: str | None = Field(default=None, max_length=240)
    research_subject: str | None = Field(default=None, max_length=240)
    location_label: str | None = Field(default=None, max_length=300)
    current_content: str = Field(default="", max_length=MAX_BLOCK_CHARS)
    supporting_context: str | None = Field(default=None, max_length=12000)
    payload_doc_id: str | None = Field(default=None, max_length=64)
    payload_collection: PayloadCollectionSlug | None = None
    angle: ListicleAngleRequest | None = None


ListTone = Literal[
    "elevated", "casual", "hidden-gem", "family-friendly", "date-night", "budget"
]


class GenerateListicleContentRequest(BaseModel):
    article_title: str = Field(min_length=1, max_length=MAX_ARTICLE_TITLE_CHARS)
    article_type: ListicleArticleType
    location_label: str = Field(min_length=1, max_length=300)
    article_context: str | None = Field(default=None, max_length=MAX_ARTICLE_CONTEXT_CHARS)
    model_name: str | None = Field(default=None, max_length=120)
    custom_instruction: str | None = Field(default=None, max_length=MAX_PROMPT_CHARS)
    skip_existing: bool = False
    list_tone: ListTone | None = None
    targets: list[GenerateListicleTargetRequest] = Field(default_factory=list)


StepEventName = Literal[
    "critical_fields_evaluated",
    "fallback_research_called",
    "writer_called",
    "validated",
    "retry_called",
    "finalized",
]
StepEventStatus = Literal["ok", "skipped", "failed"]


class StepEvent(BaseModel):
    name: StepEventName
    status: StepEventStatus
    prompt: str | None = None
    output: str | None = None
    model: str | None = None
    details: dict[str, Any] = Field(default_factory=dict)
    duration_ms: int = 0


class GenerateListicleTargetResponse(BaseModel):
    target_id: str
    status: Literal["generated", "skipped", "error"]
    markdown: str | None = None
    model_used: str
    source_urls: list[str] = Field(default_factory=list)
    validation_errors: list[str] = Field(default_factory=list)
    error_message: str | None = None
    steps: list[StepEvent] = Field(default_factory=list)


class GenerateListicleContentResponse(BaseModel):
    results: dict[str, GenerateListicleTargetResponse]


def _extract_generated_title(raw_response: str) -> str:
    # Strip any stray envelope tags the model may have included
    cleaned = re.sub(r"<<<[A-Z_]+>>>", "", raw_response, flags=re.I).strip()
    # Take the first non-empty line (titles should be one line)
    for line in cleaned.splitlines():
        line = line.strip()
        if line:
            return line
    return cleaned


def _generate_title_impl(request: GenerateTitleRequest) -> GenerateTitleResponse:
    current_title = request.current_title.strip()
    prompt = request.prompt.strip()

    if not current_title:
        raise HTTPException(status_code=400, detail="current_title is required")
    if not prompt:
        raise HTTPException(status_code=400, detail="prompt is required")

    model_used = (request.model_name or DEFAULT_MODEL).strip() or DEFAULT_MODEL
    llm_prompt = (
        f"{TITLE_IMPROVE_PROMPT}\n\n"
        f"Current title: {current_title}\n\n"
        f"Editor instruction: {prompt}"
    )

    try:
        writer_result = invoke_writer_model(
            prompt=llm_prompt,
            model_name=model_used,
            max_tokens=2048,
            temperature=0.4,
        )
    except WriterModelError as exc:
        logger.exception("Editor assist generate-title failed: %s", exc)
        raise HTTPException(
            status_code=502,
            detail="AI title generation request failed",
        ) from exc

    raw_text = writer_result.text
    if not raw_text:
        raise HTTPException(status_code=502, detail="AI title generation returned empty output")

    title = _extract_generated_title(raw_text)
    if not title:
        raise HTTPException(status_code=502, detail="AI title generation returned empty title")

    return GenerateTitleResponse(title=title)


@router.post("/generate-title", response_model=GenerateTitleResponse)
async def generate_title(request: GenerateTitleRequest) -> GenerateTitleResponse:
    try:
        return run_editor_assist_generate_title_graph(
            step_runner=lambda: _generate_title_impl(request),
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("Editor Assist graph generate-title failed: %s", exc)
        raise HTTPException(
            status_code=502,
            detail="AI title generation graph failed",
        ) from exc


def _resolve_grounded_model(model_name: str) -> str:
    resolved = model_name.strip()
    if resolved in {"gemini-2.5-flash-lite", "gemini-2.5-flash", "gemini-2.5-pro"}:
        return resolved
    return "gemini-2.5-flash"


def _merge_urls(*groups: list[str]) -> list[str]:
    merged: list[str] = []
    seen: set[str] = set()
    for group in groups:
        for url in group:
            if url in seen:
                continue
            seen.add(url)
            merged.append(url)
    return merged


def _format_lm_facts(location: dict[str, Any]) -> str:
    """Render an EditorialLocation dict as a labeled facts block to splice
    into the writer prompt's BUILDER CONTEXT. Empty/null fields are skipped."""
    lines: list[str] = []

    def _list_line(label: str, value: Any) -> None:
        if isinstance(value, list) and value:
            lines.append(f"{label}: {', '.join(str(v) for v in value)}")

    def _str_line(label: str, value: Any) -> None:
        if isinstance(value, str) and value.strip():
            lines.append(f"{label}: {value.strip()}")

    _str_line("Type", location.get("type"))
    _str_line("Price level", location.get("priceLevel"))
    _list_line("Cuisines", location.get("cuisines"))
    _list_line("Meal types", location.get("mealTypes"))
    _list_line("Ideal for", location.get("idealFor"))
    _list_line("Features", location.get("features"))
    _str_line("Address", location.get("address"))
    _str_line("Neighborhood description", location.get("neighborhoodDescription"))

    hours = location.get("operationHours")
    if isinstance(hours, dict) and hours:
        rendered = "; ".join(f"{k}: {v}" for k, v in hours.items())
        lines.append(f"Operation hours: {rendered}")

    facts_block = (
        "LOCATION FACTS (from Location Manager)\n" + "\n".join(lines) if lines else ""
    )

    digest_block = _format_reviews_digest(location.get("_reviewsDigest"))
    if facts_block and digest_block:
        return f"{facts_block}\n\n{digest_block}"
    return facts_block or digest_block


def _format_reviews_digest(digest: Any) -> str:
    if not isinstance(digest, dict):
        return ""

    def _list(label: str, value: Any) -> str | None:
        if isinstance(value, list) and value:
            return f"{label}: {', '.join(str(v) for v in value)}"
        return None

    lines: list[str] = []
    summary = digest.get("summary")
    if isinstance(summary, str) and summary.strip():
        lines.append(f"Summary: {summary.strip()}")
    for entry in (
        _list("Known for", digest.get("knownFor")),
        _list("Common positives", digest.get("commonPositives")),
        _list("Common gripes", digest.get("commonGripes")),
        _list("Named dishes", digest.get("namedDishes")),
    ):
        if entry:
            lines.append(entry)

    if not lines:
        return ""
    return (
        "REVIEWS DIGEST (cached, from aggregated Google + TripAdvisor reviews)\n"
        + "\n".join(lines)
    )


def _collect_payload_refs(
    targets: list[GenerateListicleTargetRequest],
) -> list[dict[str, str]]:
    """Collect unique (collection, docId) refs from blurb targets that carry them."""
    seen: set[tuple[str, str]] = set()
    refs: list[dict[str, str]] = []
    for t in targets:
        if t.field_type != "blurb":
            continue
        if not t.payload_doc_id or not t.payload_collection:
            continue
        key = (t.payload_collection, t.payload_doc_id)
        if key in seen:
            continue
        seen.add(key)
        refs.append({"collection": t.payload_collection, "docId": t.payload_doc_id})
    return refs


def _to_listicle_writer_target(
    request_target: GenerateListicleTargetRequest,
    *,
    lm_facts_block: str = "",
) -> ListicleWriterTarget:
    base_context = request_target.supporting_context or ""
    if lm_facts_block:
        supporting_context = (
            f"{base_context}\n\n{lm_facts_block}".strip()
            if base_context.strip()
            else lm_facts_block
        )
    else:
        supporting_context = base_context

    return ListicleWriterTarget(
        target_id=request_target.target_id,
        field_type=request_target.field_type,
        category=request_target.category,
        display_name=request_target.display_name,
        research_subject=request_target.research_subject,
        location_label=request_target.location_label,
        current_content=request_target.current_content or "",
        supporting_context=supporting_context,
    )


def _run_fallback_research(
    *,
    target: ListicleWriterTarget,
    evaluation: TierEvaluation,
    article_location: str,
    grounded_model: str,
) -> tuple[str, list[str]]:
    """Single Gemini-grounded call to fill Tier-2 gaps. Returns (findings_block, source_urls).
    Degrades to empty findings on failure — the writer still runs without research.
    """
    if target.field_type != "blurb" or target.category is None:
        return "", []
    subject_name = (target.research_subject or target.display_name or "").strip()
    if not subject_name:
        return "", []

    prompt = build_fallback_research_prompt(
        subject_name=subject_name,
        subject_location=(target.location_label or article_location).strip(),
        category=target.category,
        gap_descriptions=evaluation.gap_descriptions,
    )
    grounded = invoke_google_grounded_text(
        prompt,
        model_name=grounded_model,
        fallback_model_name="gemini-2.5-flash",
        max_tokens=768,
        temperature=0.05,
    )
    if grounded is None or not grounded.text.strip():
        logger.warning(
            "Fallback Research returned no findings for target %s", target.target_id
        )
        return "", []
    findings = grounded.text.strip()
    block = f"RESEARCH FINDINGS (web, scoped to gaps)\n{findings}"
    return block, list(grounded.source_urls or [])


def _augment_target_with_research(
    target: ListicleWriterTarget,
    research_block: str,
) -> ListicleWriterTarget:
    if not research_block:
        return target
    base = target.supporting_context or ""
    augmented = (
        f"{base}\n\n{research_block}".strip() if base.strip() else research_block
    )
    return ListicleWriterTarget(
        target_id=target.target_id,
        field_type=target.field_type,
        category=target.category,
        display_name=target.display_name,
        research_subject=target.research_subject,
        location_label=target.location_label,
        current_content=target.current_content,
        supporting_context=augmented,
    )


def _generate_single_listicle_target(
    *,
    article_title: str,
    article_type: ListicleArticleType,
    article_location: str,
    article_context: str,
    target: ListicleWriterTarget,
    custom_instruction: str,
    model_name: str,
    lm_location: dict[str, Any] | None = None,
    list_tone: ListTone | None = None,
    listicle_angle: AssignmentAngle | None = None,
) -> GenerateListicleTargetResponse:
    grounded_model = _resolve_grounded_model(model_name)
    source_urls: list[str] = []
    steps: list[StepEvent] = []

    def _elapsed_ms(start: float) -> int:
        return int((time.perf_counter() - start) * 1000)

    # 1) critical_fields_evaluated
    cf_start = time.perf_counter()
    evaluation = evaluate_tiers(target.category, lm_location)
    if evaluation.has_tier1_gaps:
        logger.warning(
            "Tier-1 gaps for target %s (%s): missing %s — generation will proceed but quality is at risk",
            target.target_id,
            target.research_subject or target.display_name,
            ", ".join(evaluation.tier1_missing),
        )
    steps.append(StepEvent(
        name="critical_fields_evaluated",
        status="ok",
        details={
            "category": target.category,
            "has_lm_data": lm_location is not None,
            "tier1_missing": list(evaluation.tier1_missing),
            "tier2_gap_descriptions": list(evaluation.gap_descriptions),
            "needs_fallback_research": evaluation.needs_fallback_research,
            "has_tier1_gaps": evaluation.has_tier1_gaps,
        },
        duration_ms=_elapsed_ms(cf_start),
    ))

    # 2) fallback_research_called (only when LM data leaves Tier-2 gaps)
    if evaluation.needs_fallback_research and lm_location is not None:
        fr_start = time.perf_counter()
        research_prompt = build_fallback_research_prompt(
            subject_name=(target.research_subject or target.display_name or "").strip(),
            subject_location=(target.location_label or article_location).strip(),
            category=target.category or "dining",
            gap_descriptions=evaluation.gap_descriptions,
        )
        try:
            research_block, research_urls = _run_fallback_research(
                target=target,
                evaluation=evaluation,
                article_location=article_location,
                grounded_model=grounded_model,
            )
        except Exception as exc:  # noqa: BLE001
            steps.append(StepEvent(
                name="fallback_research_called",
                status="failed",
                prompt=research_prompt,
                model=grounded_model,
                details={"error": str(exc)},
                duration_ms=_elapsed_ms(fr_start),
            ))
            research_block, research_urls = "", []
        else:
            target = _augment_target_with_research(target, research_block)
            source_urls = _merge_urls(source_urls, research_urls)
            steps.append(StepEvent(
                name="fallback_research_called",
                status="ok" if research_block else "failed",
                prompt=research_prompt,
                output=research_block or None,
                model=grounded_model,
                details={
                    "gap_descriptions": list(evaluation.gap_descriptions),
                    "source_urls": list(research_urls),
                },
                duration_ms=_elapsed_ms(fr_start),
            ))

    # 3) writer_called
    wr_start = time.perf_counter()
    prompt = build_writer_prompt(
        article_title=article_title,
        article_type=article_type,
        article_location=article_location,
        target=target,
        article_context=article_context,
        custom_instruction=custom_instruction,
        list_tone=list_tone,
        listicle_angle=listicle_angle,
    )
    try:
        writer_result = invoke_writer_model(
            prompt=prompt,
            model_name=model_name,
            max_tokens=1536,
            temperature=0.15,
        )
    except WriterModelError as exc:
        steps.append(StepEvent(
            name="writer_called",
            status="failed",
            prompt=prompt,
            model=model_name,
            details={
                "error": str(exc),
                "custom_instruction": custom_instruction or None,
                "list_tone": list_tone,
                "listicle_angle": listicle_angle,
            },
            duration_ms=_elapsed_ms(wr_start),
        ))
        logger.exception("Writer model call failed for target %s", target.target_id)
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    candidate = strip_generation_fence(writer_result.text)
    model_used = writer_result.model_name
    steps.append(StepEvent(
        name="writer_called",
        status="ok",
        prompt=prompt,
        output=candidate,
        model=model_used,
        details={
            "raw_output": writer_result.text,
            "custom_instruction": custom_instruction or None,
            "list_tone": list_tone,
            "listicle_angle": listicle_angle,
        },
        duration_ms=_elapsed_ms(wr_start),
    ))

    # 4) validated
    val_start = time.perf_counter()
    validation_errors = validate_generated_text(
        field_type=target.field_type,
        text=candidate,
    )
    steps.append(StepEvent(
        name="validated",
        status="ok" if not validation_errors else "failed",
        details={
            "validation_errors": list(validation_errors),
            "passed": not validation_errors,
            "field_type": target.field_type,
        },
        duration_ms=_elapsed_ms(val_start),
    ))

    # 5) retry_called (only when first validation failed)
    if validation_errors:
        rt_start = time.perf_counter()
        retry_prompt = build_retry_prompt(
            article_title=article_title,
            article_type=article_type,
            article_location=article_location,
            target=target,
            article_context=article_context,
            custom_instruction=custom_instruction,
            current_output=candidate,
            validation_errors=validation_errors,
            list_tone=list_tone,
            listicle_angle=listicle_angle,
        )
        try:
            retry_result = invoke_writer_model(
                prompt=retry_prompt,
                model_name=model_name,
                max_tokens=1536,
                temperature=0.1,
            )
        except WriterModelError as exc:
            steps.append(StepEvent(
                name="retry_called",
                status="failed",
                prompt=retry_prompt,
                model=model_name,
                details={"error": str(exc)},
                duration_ms=_elapsed_ms(rt_start),
            ))
            logger.exception("Writer model retry failed for target %s", target.target_id)
            raise HTTPException(status_code=502, detail=str(exc)) from exc

        candidate = strip_generation_fence(retry_result.text)
        validation_errors = validate_generated_text(
            field_type=target.field_type,
            text=candidate,
        )
        model_used = retry_result.model_name
        steps.append(StepEvent(
            name="retry_called",
            status="ok" if not validation_errors else "failed",
            prompt=retry_prompt,
            output=candidate,
            model=model_used,
            details={
                "raw_output": retry_result.text,
                "post_retry_validation_errors": list(validation_errors),
                "passed": not validation_errors,
            },
            duration_ms=_elapsed_ms(rt_start),
        ))

    # 6) finalized
    fn_start = time.perf_counter()
    if validation_errors:
        steps.append(StepEvent(
            name="finalized",
            status="failed",
            output=candidate,
            model=model_used,
            details={
                "final_status": "error",
                "validation_errors": list(validation_errors),
                "source_urls": list(source_urls),
            },
            duration_ms=_elapsed_ms(fn_start),
        ))
        return GenerateListicleTargetResponse(
            target_id=target.target_id,
            status="error",
            model_used=model_used,
            source_urls=source_urls,
            validation_errors=validation_errors,
            error_message="Generated content failed validation after retry.",
            steps=steps,
        )

    steps.append(StepEvent(
        name="finalized",
        status="ok",
        output=candidate,
        model=model_used,
        details={
            "final_status": "generated",
            "source_urls": list(source_urls),
        },
        duration_ms=_elapsed_ms(fn_start),
    ))
    return GenerateListicleTargetResponse(
        target_id=target.target_id,
        status="generated",
        markdown=candidate,
        model_used=model_used,
        source_urls=source_urls,
        steps=steps,
    )


def _generate_listicle_content_impl(
    request: GenerateListicleContentRequest,
) -> GenerateListicleContentResponse:
    article_title = request.article_title.strip()
    article_location = request.location_label.strip()
    article_context = request.article_context.strip() if request.article_context else ""
    custom_instruction = request.custom_instruction.strip() if request.custom_instruction else ""

    if not article_title:
        raise HTTPException(status_code=400, detail="article_title is required")
    if not article_location:
        raise HTTPException(status_code=400, detail="location_label is required")
    if not request.targets:
        raise HTTPException(status_code=400, detail="At least one target is required")

    model_used = (request.model_name or DEFAULT_MODEL).strip() or DEFAULT_MODEL
    results: dict[str, GenerateListicleTargetResponse] = {}

    payload_refs = _collect_payload_refs(request.targets)
    lm_locations_by_doc_id = (
        fetch_editorial_locations_by_payload_refs(payload_refs) if payload_refs else {}
    )

    # Angle assignment pass: order-sensitive (rotation looks at preceding picks),
    # so we walk blurb targets in their original sequence.
    angle_inputs: list[tuple[str, dict[str, Any] | None, AssignmentAngle | None]] = []
    for t in request.targets:
        if t.field_type != "blurb" or t.category != "dining":
            continue
        loc = lm_locations_by_doc_id.get(t.payload_doc_id) if t.payload_doc_id else None
        angle_inputs.append((t.target_id, loc, t.angle))
    angle_by_target_id = assign_dining_angles(angle_inputs) if angle_inputs else {}

    for request_target in request.targets:
        lm_location = (
            lm_locations_by_doc_id.get(request_target.payload_doc_id)
            if request_target.payload_doc_id
            else None
        )
        lm_facts_block = _format_lm_facts(lm_location) if lm_location else ""
        target = _to_listicle_writer_target(request_target, lm_facts_block=lm_facts_block)
        resolved_angle = angle_by_target_id.get(request_target.target_id)
        current_content = target.current_content.strip()
        if request.skip_existing and current_content:
            results[target.target_id] = GenerateListicleTargetResponse(
                target_id=target.target_id,
                status="skipped",
                model_used=model_used,
                markdown=current_content,
            )
            continue

        try:
            results[target.target_id] = _generate_single_listicle_target(
                article_title=article_title,
                article_type=request.article_type,
                article_location=article_location,
                article_context=article_context,
                target=target,
                custom_instruction=custom_instruction,
                model_name=model_used,
                lm_location=lm_location,
                list_tone=request.list_tone,
                listicle_angle=resolved_angle,
            )
        except HTTPException:
            raise
        except Exception as exc:  # noqa: BLE001
            logger.exception(
                "Listicle generation failed for target %s: %s",
                target.target_id,
                exc,
            )
            results[target.target_id] = GenerateListicleTargetResponse(
                target_id=target.target_id,
                status="error",
                model_used=model_used,
                error_message=str(exc),
            )

    return GenerateListicleContentResponse(results=results)


def _rewrite_block_impl(request: RewriteBlockRequest) -> RewriteBlockResponse:
    prompt = request.prompt.strip()
    block_content = request.block_content.strip()
    article_title = (
        request.article_title.strip() if request.article_title else "Untitled article"
    )
    article_context = request.article_context.strip() if request.article_context else ""

    if not prompt:
        raise HTTPException(status_code=400, detail="prompt is required")
    if not block_content:
        raise HTTPException(status_code=400, detail="block_content is required")

    model_used = (request.model_name or DEFAULT_MODEL).strip() or DEFAULT_MODEL
    llm_prompt = (
        f"{BLOCK_REWRITE_PROMPT}\n\n"
        f"Editor instruction:\n{prompt}\n\n"
        f"Article title (reference only):\n{article_title}\n\n"
    )

    if article_context:
        llm_prompt += (
            "Full article context for reference only. "
            "Do not rewrite this context. Rewrite only the current markdown block.\n"
            "<<<ARTICLE_CONTEXT>>>\n"
            f"{article_context}\n"
            "<<<END_ARTICLE_CONTEXT>>>\n\n"
        )

    llm_prompt += (
        "Current markdown block to rewrite:\n"
        "<<<CURRENT_BLOCK>>>\n"
        f"{block_content}\n"
        "<<<END_CURRENT_BLOCK>>>"
    )

    try:
        writer_result = invoke_writer_model(
            prompt=llm_prompt,
            model_name=model_used,
            max_tokens=8192,
            temperature=0.1,
        )
    except WriterModelError as exc:
        logger.exception("Editor assist rewrite failed: %s", exc)
        raise HTTPException(
            status_code=502,
            detail="AI rewrite request failed",
        ) from exc

    raw_text = writer_result.text
    if not raw_text:
        raise HTTPException(status_code=502, detail="AI rewrite returned empty output")

    rewritten_content = _extract_rewritten_block(raw_text)
    if not rewritten_content:
        raise HTTPException(status_code=502, detail="AI rewrite returned empty block content")

    return RewriteBlockResponse(
        rewritten_content=rewritten_content,
        model_used=writer_result.model_name,
    )


@router.post("/rewrite-block", response_model=RewriteBlockResponse)
async def rewrite_block(request: RewriteBlockRequest) -> RewriteBlockResponse:
    try:
        return run_editor_assist_rewrite_graph(
            step_runner=lambda: _rewrite_block_impl(request),
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("Editor Assist graph rewrite failed: %s", exc)
        raise HTTPException(
            status_code=502,
            detail="AI rewrite graph failed",
        ) from exc


@router.post("/generate-listicle-content", response_model=GenerateListicleContentResponse)
async def generate_listicle_content(
    request: GenerateListicleContentRequest,
) -> GenerateListicleContentResponse:
    try:
        return run_editor_assist_listicle_generation_graph(
            step_runner=lambda: _generate_listicle_content_impl(request),
        )
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception("Editor Assist graph generate-listicle-content failed: %s", exc)
        raise HTTPException(
            status_code=502,
            detail="AI listicle generation graph failed",
        ) from exc
