"""Prompt builders for the three generation products."""

import json

from models import (
    AccommodationsFieldSuggestionRequest,
    FieldSuggestionRequest,
    NeighborhoodDescriptionRequest,
)


def build_alt_text_prompt() -> str:
    return 'You are an accessibility expert writing HTML alt text.\n\nWrite ONE clear, concise sentence describing what is essential to understand the image.\nFocus on the main subject, any visible action, and relevant context.\nUse concrete nouns and plain language.\nAvoid filler, opinions, and unnecessary adjectives.\nDo NOT start with "Image of" or "Photo of".\nKeep the result under 125 characters.\nReturn ONLY the alt text.'


def build_neighborhood_description_prompt(
    request: NeighborhoodDescriptionRequest,
) -> str:
    area_name = request.district or request.neighborhood or request.city or "the area"
    context_lines = [
        f"Area focus: {area_name}",
        f"Neighborhood: {request.neighborhood or 'Unknown'}",
        f"District: {request.district or 'Unknown'}",
        f"City: {request.city or 'Unknown'}",
        f"Country: {request.country or 'Unknown'}",
        f"Venue name: {request.location_name or 'Unknown'}",
        f"Venue category: {request.category or 'Unknown'}",
        f"Venue type: {request.location_type or 'Unknown'}",
        f"Venue address: {request.address or 'Unknown'}",
    ]
    return (
        "You are writing a short neighborhood overview for a travel and location database.\n\nWrite exactly 2 sentences in a neutral, editorial tone.\nKeep it concise, around 45 to 80 words total.\nDescribe the surrounding area, atmosphere, and visitor context around the venue.\nDo not describe the venue itself except as light context.\nDo not invent landmarks, transit claims, safety claims, prices, or superlatives.\nIf details are uncertain, stay broad and generic rather than making specifics up.\nReturn ONLY the neighborhood description.\n\nContext:\n"
        + "\n".join(context_lines)
    )


def build_field_suggestion_prompt(request: FieldSuggestionRequest) -> str:
    if request.kind == "url":
        return build_url_field_suggestion_prompt(request)
    allowed_options = [
        {
            "value": option.value,
            "label": option.label,
            "description": option.description or "",
        }
        for option in request.allowed_options
    ]
    context = {
        "field": {
            "key": request.field_key,
            "label": request.field_label,
            "kind": request.kind,
        },
        "allowed_options": allowed_options,
        "current_form_values": request.form_values,
        "google_foursquare_prefill": request.api_context or {},
    }
    return f'You suggest one missing {request.category} form option for a location-management database.\nUse Google/Foursquare prefill evidence first. If that is insufficient, use Google Search grounding to find first-person evidence (reviews, blog posts, editorial guides) about this venue.\nReturn only JSON. Do not return markdown.\nDo not include citations or source passages in the JSON; grounding metadata is captured separately.\nThe suggestion must use exact option value strings from allowed_options only.\nFor kind=single, suggestion must be one string or null.\nFor kind=multi, suggestion must be an array of 2 to 4 distinct strings (never a single-item array), or null if the evidence does not support at least two confident tags. Choose every tag that is clearly supported by the evidence — do not stop at the first match.\nIf evidence is weak, return suggestion null and confidence below 0.6.\nDo not invent amenities. Do not use values outside allowed_options.\n\nReturn schema:\n{{ "suggestion": string | string[] | null, "confidence": number, "reason": "short evidence-backed reason" }}\n\nContext JSON:\n{json.dumps(context, ensure_ascii=False)}'


def build_url_field_suggestion_prompt(request: FieldSuggestionRequest) -> str:
    context = {
        "field": {
            "key": request.field_key,
            "label": request.field_label,
            "kind": "url",
        },
        "current_form_values": request.form_values,
        "google_foursquare_prefill": request.api_context or {},
    }
    return f"""You suggest one missing {request.category} link for a location-management database.\nFind the most likely public URL for the {request.field_label} of the venue named in current_form_values.\nUse Google Search grounding to find the canonical link. Prefer the venue's own website, an official PDF, or a well-known booking provider (OpenTable, Resy, SevenRooms, Tock) when the field is a reservation link. For menu fields, prefer the venue's own menu page over aggregators.\nReturn only JSON. Do not return markdown.\nDo not include citations or source passages in the JSON; grounding metadata is captured separately.\nThe suggestion must be a single string containing an absolute http:// or https:// URL, or null if no high-confidence link exists.\nIf evidence is weak or you cannot find a canonical link, return suggestion null and confidence below 0.6.\nDo not guess. Do not return search-result URLs. Do not return social-media profile URLs unless the venue uses them as the official menu/reservation page.\n\nReturn schema:\n{{ "suggestion": "https://..." | null, "confidence": number, "reason": "short evidence-backed reason" }}\n\nContext JSON:\n{json.dumps(context, ensure_ascii=False)}"""


def build_accommodations_field_suggestion_prompt(
    request: AccommodationsFieldSuggestionRequest,
) -> str:
    return build_field_suggestion_prompt(request.to_generic())
