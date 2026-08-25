"""Prompt2Blog v3 intake.

Turns an approved commission plus its verified evidence into the runtime
request a v3 run will execute, and into the versioned run-input artifact a
finished run has to be able to show. Nothing here calls a model, and nothing
here flattens the commission or the evidence into v2 shapes: preserving both
whole is the point of the migration.
"""

from __future__ import annotations

from typing import Any

from .contracts_v3 import Prompt2BlogV3Request
from .editorial_catalog import EditorialCatalog
from .evidence_v3 import normalize_evidence
from .instructions_v3 import INSTRUCTION_SCHEMA_VERSION, assemble_v3_instructions
from .models import PipelineV3RuntimeRequest
from .options import (
    _default_option,
    _find_option_or_raise,
    _load_prompt2blog_option_catalog,
)
from .config import PROMPT2BLOG_CREATIVITY_LEVELS
from .support import _safe_str

RUN_INPUT_STAGE = "pipeline_input_v3"


def resolve_v3_option_context(request: Prompt2BlogV3Request) -> dict[str, Any]:
    """Resolves the writing profiles a v3 request names, or fails by name."""
    catalog = _load_prompt2blog_option_catalog()
    profiles = request.profiles

    tone = _find_option_or_raise(
        catalog.get("tones", []), profiles.tone_id, field_name="tone_id"
    )
    length = _find_option_or_raise(
        catalog.get("lengths", []), profiles.length_id, field_name="length_id"
    )
    brand_voices = catalog.get("brand_voices", [])
    if profiles.brand_voice_id:
        brand_voice = _find_option_or_raise(
            brand_voices, profiles.brand_voice_id, field_name="brand_voice_id"
        )
    else:
        brand_voice = _default_option(brand_voices)
        if not brand_voice:
            raise RuntimeError("No brand voice options are configured.")

    creativity_level = _safe_str(profiles.creativity_level).lower() or "medium"
    if creativity_level not in PROMPT2BLOG_CREATIVITY_LEVELS:
        raise RuntimeError(
            "creativity_level must be one of: "
            f"{', '.join(sorted(PROMPT2BLOG_CREATIVITY_LEVELS))}"
        )

    return {
        "tone": tone,
        "length": length,
        "brand_voice": brand_voice,
        "creativity_level": creativity_level,
    }


def prepare_v3_runtime_request(
    request: Prompt2BlogV3Request,
    *,
    catalog: EditorialCatalog | None = None,
) -> PipelineV3RuntimeRequest:
    """Assembles one v3 runtime request without running or recording anything."""
    option_context = resolve_v3_option_context(request)
    instructions = assemble_v3_instructions(request, catalog=catalog)
    evidence = normalize_evidence(request.commission, request.evidence_package)

    return PipelineV3RuntimeRequest(
        commission=request.commission.model_dump(mode="json"),
        evidence=evidence.model_dump(mode="json"),
        instructions=instructions.model_dump(mode="json"),
        option_context=option_context,
        include_debug=request.include_debug,
        enable_editorial_augmentation=request.enable_editorial_augmentation,
        model_name=request.model_routing.model_name,
        writing_model=request.model_routing.writing_model,
        audit_model=request.model_routing.audit_model,
        model_stack_id=request.model_routing.model_stack_id,
    )


def v3_run_input_artifact(runtime: PipelineV3RuntimeRequest) -> dict[str, Any]:
    """The versioned run-input record; readable without replaying the run."""
    commission = runtime.commission
    instructions = runtime.instructions
    evidence = runtime.evidence
    instruction_meta = instructions.get("instruction_meta", {})
    return {
        "schema_version": runtime.schema_version,
        "instruction_schema_version": INSTRUCTION_SCHEMA_VERSION,
        "commission_fingerprint": commission["commission_fingerprint"],
        "original_title": commission["original_title"],
        "location": commission["location"],
        "form_id": commission["form_id"],
        "topic_module_ids": list(commission["topic_module_ids"]),
        "audience": commission["audience"],
        "scope_mode": commission["scope"]["mode"],
        "requirement_ids": [
            requirement["requirement_id"] for requirement in commission["requirements"]
        ],
        "precedence": list(instructions.get("precedence", [])),
        "instruction_meta": instruction_meta,
        "evidence_receipt": instruction_meta.get("evidence_receipt", {}),
        "source_ids": [source["source_id"] for source in evidence["sources"]],
        "profiles": {
            "tone_id": runtime.option_context["tone"]["id"],
            "length_id": runtime.option_context["length"]["id"],
            "brand_voice_id": runtime.option_context["brand_voice"]["id"],
            "creativity_level": runtime.option_context["creativity_level"],
        },
        "model_routing": {
            "model_name": runtime.model_name,
            "writing_model": runtime.writing_model,
            "audit_model": runtime.audit_model,
            "model_stack_id": runtime.model_stack_id,
        },
        "include_debug": runtime.include_debug,
        "enable_editorial_augmentation": runtime.enable_editorial_augmentation,
    }
