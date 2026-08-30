"""Prompt2Blog v3 intake.

Turns an approved brief and its work order plus verified evidence into the runtime
request a v3 run will execute, and into the versioned run-input artifact a
finished run has to be able to show. Nothing here calls a model, and nothing
here flattens the brief, the work order or the evidence: preserving all three
whole is the point of the migration.
"""

from __future__ import annotations

from typing import Any

from .contracts_v4 import Prompt2BlogV4Request
from .editorial_catalog import EditorialCatalog
from .evidence_v3 import NormalizedEvidence, normalize_evidence
from .instructions_v3 import INSTRUCTION_SCHEMA_VERSION, assemble_v3_instructions
from .models import PipelineV4RuntimeRequest
from .research_readiness_v3 import (
    ResearchReadiness,
    assess_research_readiness,
    needs_research_payload,
)
from .options import (
    _default_option,
    _find_option_or_raise,
    _load_prompt2blog_option_catalog,
)
from .config import PROMPT2BLOG_CREATIVITY_LEVELS
from .support import _safe_str

RUN_INPUT_STAGE = "pipeline_input_v3"


def resolve_v3_option_context(request: Prompt2BlogV4Request) -> dict[str, Any]:
    """Resolves what is still selectable about the writing, or fails by name.

    The voice is no longer among it. There is one Questurian voice and one set
    of writing conventions, both always sent (ADR 0032), so they are loaded
    rather than chosen -- nothing here can select the wrong one.
    """
    catalog = _load_prompt2blog_option_catalog()
    profiles = request.profiles

    voice = _default_option(catalog.get("tones", []))
    if not voice:
        raise RuntimeError("The Questurian voice is not configured.")
    conventions = _default_option(catalog.get("brand_voices", []))
    if not conventions:
        raise RuntimeError("The writing conventions are not configured.")
    length = _find_option_or_raise(
        catalog.get("lengths", []), profiles.length_id, field_name="length_id"
    )

    creativity_level = _safe_str(profiles.creativity_level).lower() or "medium"
    if creativity_level not in PROMPT2BLOG_CREATIVITY_LEVELS:
        raise RuntimeError(
            "creativity_level must be one of: "
            f"{', '.join(sorted(PROMPT2BLOG_CREATIVITY_LEVELS))}"
        )

    return {
        # Kept under their old keys so every stage that reads a style directive
        # keeps working; there is simply only ever one of each now.
        "tone": voice,
        "length": length,
        "brand_voice": conventions,
        "creativity_level": creativity_level,
    }


def prepare_v3_runtime_request(
    request: Prompt2BlogV4Request,
    *,
    catalog: EditorialCatalog | None = None,
) -> PipelineV4RuntimeRequest:
    """Assembles one v3 runtime request without running or recording anything."""
    option_context = resolve_v3_option_context(request)
    instructions = assemble_v3_instructions(request, catalog=catalog)
    evidence = normalize_evidence(request.work_order, request.evidence_package)

    return PipelineV4RuntimeRequest(
        brief=request.brief.model_dump(mode="json"),
        work_order=request.work_order.model_dump(mode="json"),
        evidence=evidence.model_dump(mode="json"),
        instructions=instructions.model_dump(mode="json"),
        option_context=option_context,
        include_debug=request.include_debug,
        enable_editorial_augmentation=request.enable_editorial_augmentation,
        model_name=request.model_routing.model_name,
        writing_model=request.model_routing.writing_model,
        repair_model=request.model_routing.repair_model,
        audit_model=request.model_routing.audit_model,
        outline_model=request.model_routing.outline_model,
        groundedness_model=request.model_routing.groundedness_model,
        title_model=request.model_routing.title_model,
        model_stack_id=request.model_routing.model_stack_id,
    )


def v3_run_input_artifact(runtime: PipelineV4RuntimeRequest) -> dict[str, Any]:
    """The versioned run-input record; readable without replaying the run."""
    brief = runtime.brief
    work_order = runtime.work_order
    instructions = runtime.instructions
    evidence = runtime.evidence
    instruction_meta = instructions.get("instruction_meta", {})
    return {
        "schema_version": runtime.schema_version,
        "instruction_schema_version": INSTRUCTION_SCHEMA_VERSION,
        "brief_fingerprint": brief["brief_fingerprint"],
        "work_order_fingerprint": work_order["work_order_fingerprint"],
        "seed": brief["seed"],
        "location": brief["location"],
        "form_id": brief["form_id"],
        "topic_module_ids": list(brief["topic_module_ids"]),
        "reader": brief["reader"],
        "spine": brief["spine"],
        "fails_if": brief["fails_if"],
        "scope_mode": work_order["scope"]["mode"],
        "requirement_ids": [
            requirement["requirement_id"] for requirement in work_order["requirements"]
        ],
        "precedence": list(instructions.get("precedence", [])),
        "instruction_meta": instruction_meta,
        "evidence_receipt": instruction_meta.get("evidence_receipt", {}),
        "source_ids": [source["source_id"] for source in evidence["sources"]],
        "profiles": {
            "length_id": runtime.option_context["length"]["id"],
            "creativity_level": runtime.option_context["creativity_level"],
        },
        "model_routing": {
            "model_name": runtime.model_name,
            "writing_model": runtime.writing_model,
            "repair_model": runtime.repair_model,
            "audit_model": runtime.audit_model,
            "outline_model": runtime.outline_model,
            "groundedness_model": runtime.groundedness_model,
            "title_model": runtime.title_model,
            "model_stack_id": runtime.model_stack_id,
        },
        "include_debug": runtime.include_debug,
        "enable_editorial_augmentation": runtime.enable_editorial_augmentation,
    }


def v3_readiness(
    request: Prompt2BlogV4Request,
    *,
    catalog: EditorialCatalog | None = None,
) -> tuple[NormalizedEvidence, ResearchReadiness]:
    """Runs the research gate for one request without touching a model."""
    evidence = normalize_evidence(request.work_order, request.evidence_package)
    return evidence, assess_research_readiness(
        request.brief, request.work_order, evidence, catalog=catalog
    )


def v3_intake_result(
    request: Prompt2BlogV4Request,
    *,
    catalog: EditorialCatalog | None = None,
) -> dict[str, Any]:
    """Assembles a run input, or reports the research that has to happen first.

    Insufficient research is a product state, not an error: it terminates here,
    before any instruction assembly or writing work, and reports exactly what
    is missing plus the prompt that closes it.
    """
    evidence, readiness = v3_readiness(request, catalog=catalog)
    if not readiness.ready:
        return needs_research_payload(
            request.brief, request.work_order, evidence, readiness, catalog=catalog
        )

    runtime = prepare_v3_runtime_request(request, catalog=catalog)
    return {
        "status": "ready",
        "run_input": v3_run_input_artifact(runtime),
    }
