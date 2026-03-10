"""Pydantic models and schema helpers for location document AI drafting."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .contract import FIELD_PATHS_BY_LEVEL as CONTRACT_FIELD_PATHS_BY_LEVEL
from .contract import SECTION_PATHS_BY_LEVEL as CONTRACT_SECTION_PATHS_BY_LEVEL

LocationLevel = Literal["country", "city", "neighborhood"]
MonthValue = Literal[
    "jan",
    "feb",
    "mar",
    "apr",
    "may",
    "jun",
    "jul",
    "aug",
    "sep",
    "oct",
    "nov",
    "dec",
]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)


def _has_meaningful_value(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, (int, float, bool)):
        return True
    if isinstance(value, BaseModel):
        return _has_meaningful_value(value.model_dump())
    if isinstance(value, list):
        return any(_has_meaningful_value(item) for item in value)
    if isinstance(value, dict):
        return any(_has_meaningful_value(item) for item in value.values())
    return False


class EmergencyNumberDraft(StrictModel):
    service: str = ""
    number: str = ""
    notes: str = ""


class GuideMediaDraft(StrictModel):
    coverImage: int | None = None


class HealthSafetyDraft(StrictModel):
    emergencyNumbers: list[EmergencyNumberDraft] = Field(default_factory=list)


class MoneyHandlingDraft(StrictModel):
    currency: int | None = None
    currencyCode: str = ""
    exchangeRateNotes: str = ""
    atmAvailability: str = ""
    maxWithdrawal: str = ""
    withdrawalFee: str = ""
    cardUsage: str = ""


class WeatherMonthlyStatDraft(StrictModel):
    month: MonthValue | None = None
    avgHighC: float | None = None
    avgLowC: float | None = None
    rainfallMm: float | None = None
    rainDays: float | None = None
    sunshineHours: float | None = None

    @field_validator("month", mode="before")
    @classmethod
    def normalize_empty_month(cls, value: Any) -> Any:
        if value == "":
            return None
        return value


class WeatherDraft(StrictModel):
    summary: str = ""
    monthlyStats: list[WeatherMonthlyStatDraft] = Field(default_factory=list)


class LocalContextDraft(StrictModel):
    vibe: str = ""
    walkability: str = ""


class LocalTimezoneDraft(StrictModel):
    label: str = ""
    notes: str = ""


class SafetyDraft(StrictModel):
    status: str = ""
    notes: str = ""


class CoreDraft(StrictModel):
    headline: str = ""
    subheadline: str = ""
    timezone: LocalTimezoneDraft = Field(default_factory=LocalTimezoneDraft)
    safety: SafetyDraft = Field(default_factory=SafetyDraft)
    healthSafety: HealthSafetyDraft = Field(default_factory=HealthSafetyDraft)
    moneyHandling: MoneyHandlingDraft = Field(default_factory=MoneyHandlingDraft)
    weather: WeatherDraft = Field(default_factory=WeatherDraft)
    localContext: LocalContextDraft = Field(default_factory=LocalContextDraft)


class HighlightDraft(StrictModel):
    title: str = ""
    description: str = ""
    relatedNeighborhoods: list[int] = Field(default_factory=list)
    relatedNeighborhoodKeys: list[str] = Field(default_factory=list)


class ExploreDraft(StrictModel):
    intro: str = ""
    touristVisaStatus: str = ""
    touristVisaNotes: str = ""
    exchangeRateInfo: str = ""
    costOfLivingSummary: str = ""
    highlights: list[HighlightDraft] = Field(default_factory=list)


class CoworkingDraft(StrictModel):
    summary: str = ""
    notes: str = ""


class StayDraft(StrictModel):
    intro: str = ""
    touristVisaDuration: str = ""
    touristVisaExtensionNotes: str = ""
    timezoneOverlapNote: str = ""
    monthlyBudgetRange: str = ""
    internetSpeed: str = ""
    coworking: CoworkingDraft = Field(default_factory=CoworkingDraft)
    shortTermRent: str = ""
    highlights: list[HighlightDraft] = Field(default_factory=list)


class MoveDraft(StrictModel):
    intro: str = ""
    residencyVisa: str = ""
    residencyNotes: str = ""
    processingTime: str = ""
    familyCostOfLivingRange: str = ""
    propertyPricesPerSqm: str = ""
    incomeRequirements: str = ""
    safestDistricts: str = ""
    workPermits: str = ""
    highlights: list[HighlightDraft] = Field(default_factory=list)


class GuideDraft(StrictModel):
    media: GuideMediaDraft = Field(default_factory=GuideMediaDraft)
    core: CoreDraft = Field(default_factory=CoreDraft)
    explore: ExploreDraft = Field(default_factory=ExploreDraft)
    stay: StayDraft = Field(default_factory=StayDraft)
    move: MoveDraft = Field(default_factory=MoveDraft)


def _strip_neighborhood_only_city_fields(guide: GuideDraft) -> None:
    guide.core.timezone = LocalTimezoneDraft()
    guide.core.healthSafety = HealthSafetyDraft()
    guide.core.moneyHandling = MoneyHandlingDraft()
    guide.core.weather = WeatherDraft()

    guide.explore.touristVisaStatus = ""
    guide.explore.touristVisaNotes = ""
    guide.explore.exchangeRateInfo = ""
    guide.explore.costOfLivingSummary = ""

    guide.stay.touristVisaDuration = ""
    guide.stay.touristVisaExtensionNotes = ""
    guide.stay.timezoneOverlapNote = ""

    guide.move.residencyVisa = ""
    guide.move.residencyNotes = ""
    guide.move.processingTime = ""
    guide.move.incomeRequirements = ""
    guide.move.safestDistricts = ""
    guide.move.workPermits = ""

    for highlights in (
        guide.explore.highlights,
        guide.stay.highlights,
        guide.move.highlights,
    ):
        for highlight in highlights:
            highlight.relatedNeighborhoods = []
            highlight.relatedNeighborhoodKeys = []


class LocationDocumentDraft(StrictModel):
    level: LocationLevel
    country: str | None = None
    city: str | None = None
    neighborhood: str | None = None
    locationKey: str | None = None
    parentKey: str | None = None
    countryName: str | None = None
    cityName: str | None = None
    neighborhoodName: str | None = None
    guide: GuideDraft = Field(default_factory=GuideDraft)

    @model_validator(mode="after")
    def validate_level_sections(self) -> "LocationDocumentDraft":
        if self.level == "country":
            if _has_meaningful_value(self.guide.core) or _has_meaningful_value(
                self.guide.explore
            ) or _has_meaningful_value(self.guide.stay) or _has_meaningful_value(
                self.guide.move
            ):
                raise ValueError(
                    "country locations cannot store core, explore, stay, or move guide data"
                )
        if self.level == "neighborhood":
            _strip_neighborhood_only_city_fields(self.guide)
        return self


SECTION_MODEL_BY_PATH = {
    "guide.media": GuideMediaDraft,
    "guide.core": CoreDraft,
    "guide.explore": ExploreDraft,
    "guide.stay": StayDraft,
    "guide.move": MoveDraft,
}

SECTION_PATHS_BY_LEVEL: dict[LocationLevel, set[str]] = {
    level: {path for path in paths if path != "identity"}
    for level, paths in CONTRACT_SECTION_PATHS_BY_LEVEL.items()
}

FIELD_PATHS_BY_LEVEL: dict[LocationLevel, set[str]] = {
    level: set(paths)
    for level, paths in CONTRACT_FIELD_PATHS_BY_LEVEL.items()
}


def is_section_path_allowed(level: LocationLevel, section_path: str) -> bool:
    return section_path in SECTION_PATHS_BY_LEVEL[level]


def is_field_path_allowed(level: LocationLevel, field_path: str) -> bool:
    return field_path in FIELD_PATHS_BY_LEVEL[level]
