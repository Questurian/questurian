"""Request schemas for the Vertex content service."""

from pydantic import BaseModel, Field


SUPPORTED_FIELD_SUGGESTION_CATEGORIES = {"accommodations", "dining"}


class NeighborhoodDescriptionRequest(BaseModel):
    location_name: str | None = None
    category: str | None = None
    location_type: str | None = None
    district: str | None = None
    neighborhood: str | None = None
    city: str | None = None
    country: str | None = None
    address: str | None = None


class AccommodationsOption(BaseModel):
    value: str
    label: str
    description: str | None = None


class FieldSuggestionRequest(BaseModel):
    category: str
    field_key: str
    field_label: str
    kind: str
    allowed_options: list[AccommodationsOption] = []
    form_values: dict
    api_context: dict | None = None


class AccommodationsFieldSuggestionRequest(BaseModel):
    """Compatibility request for the accommodations-only endpoint."""

    field_key: str
    field_label: str
    kind: str
    allowed_options: list[AccommodationsOption] = Field(default_factory=list)
    form_values: dict
    api_context: dict | None = None

    def to_generic(self) -> FieldSuggestionRequest:
        return FieldSuggestionRequest(
            category="accommodations",
            field_key=self.field_key,
            field_label=self.field_label,
            kind=self.kind,
            allowed_options=self.allowed_options,
            form_values=self.form_values,
            api_context=self.api_context,
        )
