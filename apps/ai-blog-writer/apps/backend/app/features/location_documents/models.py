"""Pydantic models and schema helpers for location document AI drafting."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

LocationLevel = Literal["country", "city", "neighborhood"]
TapWaterStatus = Literal["drinkable", "not_drinkable", "varies_by_region"]
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


class VaccinationDraft(StrictModel):
    name: str = ""
    notes: str = ""


class RecommendedVaccinationDraft(VaccinationDraft):
    recommended: str = ""


class ResidencyPathwayDraft(StrictModel):
    type: str = ""
    summary: str = ""


class TapWaterDraft(StrictModel):
    status: TapWaterStatus | None = None
    notes: str = ""

    @field_validator("status", mode="before")
    @classmethod
    def normalize_empty_status(cls, value: Any) -> Any:
        if value == "":
            return None
        return value


class CurrencyDraft(StrictModel):
    code: str = ""
    name: str = ""
    symbol: str = ""
    cardUsageSummary: str = ""


class CountryTimezoneDraft(StrictModel):
    primary: str = ""
    notes: str = ""


class VisaPolicyDraft(StrictModel):
    touristVisaRequired: str = ""
    touristVisaNotes: str = ""
    residencyPathways: list[ResidencyPathwayDraft] = Field(default_factory=list)
    residencyNotes: str = ""


class CountryDataDraft(StrictModel):
    currency: CurrencyDraft = Field(default_factory=CurrencyDraft)
    timezone: CountryTimezoneDraft = Field(default_factory=CountryTimezoneDraft)
    emergencyNumbers: list[EmergencyNumberDraft] = Field(default_factory=list)
    vaccinations: list[RecommendedVaccinationDraft] = Field(default_factory=list)
    tapWater: TapWaterDraft = Field(default_factory=TapWaterDraft)
    visaPolicy: VisaPolicyDraft = Field(default_factory=VisaPolicyDraft)
    entryRequirements: str = ""
    healthNotes: str = ""
    moneyNotes: str = ""


class MapBoundsDraft(StrictModel):
    north: float | None = None
    south: float | None = None
    east: float | None = None
    west: float | None = None


class GuideMediaDraft(StrictModel):
    coverImage: int | None = None
    coverImageHint: str = ""
    mapCenterLat: float | None = None
    mapCenterLng: float | None = None
    mapZoom: float | None = None
    mapBounds: MapBoundsDraft = Field(default_factory=MapBoundsDraft)


class CostItemDraft(StrictModel):
    label: str = ""
    amount: str = ""
    notes: str = ""


class CostsDraft(StrictModel):
    items: list[CostItemDraft] = Field(default_factory=list)


class PrecautionDraft(StrictModel):
    label: str = ""
    value: str = ""
    notes: str = ""


class MustHaveItemDraft(StrictModel):
    name: str = ""
    notes: str = ""


class HealthSafetyDraft(StrictModel):
    emergencyNumbers: list[EmergencyNumberDraft] = Field(default_factory=list)
    precautions: list[PrecautionDraft] = Field(default_factory=list)
    vaccinations: list[VaccinationDraft] = Field(default_factory=list)
    hospitalsEmbed: str = ""
    airQualitySummary: str = ""
    mustHaveItems: list[MustHaveItemDraft] = Field(default_factory=list)


class MoneyHandlingDraft(StrictModel):
    currencyDisplay: str = ""
    exchangeRateDisplay: str = ""
    exchangeEmbed: str = ""
    atmAvailability: str = ""
    maxWithdrawal: str = ""
    withdrawalFee: str = ""
    cardUsage: str = ""


class UsefulAppDraft(StrictModel):
    category: str = ""
    name: str = ""
    logo: int | None = None
    logoHint: str = ""
    description: str = ""
    url: str = ""


class UsefulAppsDraft(StrictModel):
    apps: list[UsefulAppDraft] = Field(default_factory=list)


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


class BestForDraft(StrictModel):
    label: str = ""


class LocalContextDraft(StrictModel):
    vibe: str = ""
    walkability: str = ""
    bestFor: list[BestForDraft] = Field(default_factory=list)


class LocalTimezoneDraft(StrictModel):
    label: str = ""
    notes: str = ""


class LocalSharedDraft(StrictModel):
    headline: str = ""
    subheadline: str = ""
    timezone: LocalTimezoneDraft = Field(default_factory=LocalTimezoneDraft)
    costs: CostsDraft = Field(default_factory=CostsDraft)
    healthSafety: HealthSafetyDraft = Field(default_factory=HealthSafetyDraft)
    moneyHandling: MoneyHandlingDraft = Field(default_factory=MoneyHandlingDraft)
    usefulApps: UsefulAppsDraft = Field(default_factory=UsefulAppsDraft)
    weather: WeatherDraft = Field(default_factory=WeatherDraft)
    localContext: LocalContextDraft = Field(default_factory=LocalContextDraft)


class SafetyDraft(StrictModel):
    status: str = ""
    notes: str = ""


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
    safety: SafetyDraft = Field(default_factory=SafetyDraft)
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
    safety: SafetyDraft = Field(default_factory=SafetyDraft)
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
    countryData: CountryDataDraft = Field(default_factory=CountryDataDraft)
    localShared: LocalSharedDraft = Field(default_factory=LocalSharedDraft)
    explore: ExploreDraft = Field(default_factory=ExploreDraft)
    stay: StayDraft = Field(default_factory=StayDraft)
    move: MoveDraft = Field(default_factory=MoveDraft)


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
            if _has_meaningful_value(self.guide.localShared) or _has_meaningful_value(
                self.guide.explore
            ) or _has_meaningful_value(self.guide.stay) or _has_meaningful_value(
                self.guide.move
            ):
                raise ValueError(
                    "country locations cannot store localShared, explore, stay, or move guide data"
                )
        else:
            if _has_meaningful_value(self.guide.countryData):
                raise ValueError("city and neighborhood locations cannot store countryData")
        return self


SECTION_MODEL_BY_PATH = {
    "guide.media": GuideMediaDraft,
    "guide.countryData": CountryDataDraft,
    "guide.localShared": LocalSharedDraft,
    "guide.explore": ExploreDraft,
    "guide.stay": StayDraft,
    "guide.move": MoveDraft,
}

COMMON_FIELD_PATHS = {
    "country",
    "countryName",
    "guide.media.coverImageHint",
}

LOCAL_FIELD_PATHS = {
    "city",
    "cityName",
    "guide.localShared.headline",
    "guide.localShared.subheadline",
    "guide.localShared.timezone.label",
    "guide.localShared.timezone.notes",
    "guide.localShared.healthSafety.hospitalsEmbed",
    "guide.localShared.healthSafety.airQualitySummary",
    "guide.localShared.moneyHandling.currencyDisplay",
    "guide.localShared.moneyHandling.exchangeRateDisplay",
    "guide.localShared.moneyHandling.exchangeEmbed",
    "guide.localShared.moneyHandling.atmAvailability",
    "guide.localShared.moneyHandling.maxWithdrawal",
    "guide.localShared.moneyHandling.withdrawalFee",
    "guide.localShared.moneyHandling.cardUsage",
    "guide.localShared.weather.summary",
    "guide.localShared.localContext.vibe",
    "guide.localShared.localContext.walkability",
    "guide.explore.intro",
    "guide.explore.touristVisaStatus",
    "guide.explore.touristVisaNotes",
    "guide.explore.exchangeRateInfo",
    "guide.explore.safety.status",
    "guide.explore.safety.notes",
    "guide.explore.costOfLivingSummary",
    "guide.stay.intro",
    "guide.stay.touristVisaDuration",
    "guide.stay.touristVisaExtensionNotes",
    "guide.stay.timezoneOverlapNote",
    "guide.stay.monthlyBudgetRange",
    "guide.stay.internetSpeed",
    "guide.stay.coworking.summary",
    "guide.stay.coworking.notes",
    "guide.stay.shortTermRent",
    "guide.stay.safety.status",
    "guide.stay.safety.notes",
    "guide.move.intro",
    "guide.move.residencyVisa",
    "guide.move.residencyNotes",
    "guide.move.processingTime",
    "guide.move.familyCostOfLivingRange",
    "guide.move.propertyPricesPerSqm",
    "guide.move.incomeRequirements",
    "guide.move.safestDistricts",
    "guide.move.workPermits",
}

COUNTRY_ONLY_FIELD_PATHS = {
    "guide.countryData.currency.code",
    "guide.countryData.currency.name",
    "guide.countryData.currency.symbol",
    "guide.countryData.currency.cardUsageSummary",
    "guide.countryData.timezone.primary",
    "guide.countryData.timezone.notes",
    "guide.countryData.tapWater.notes",
    "guide.countryData.visaPolicy.touristVisaRequired",
    "guide.countryData.visaPolicy.touristVisaNotes",
    "guide.countryData.visaPolicy.residencyNotes",
    "guide.countryData.entryRequirements",
    "guide.countryData.healthNotes",
    "guide.countryData.moneyNotes",
}

NEIGHBORHOOD_ONLY_FIELD_PATHS = {
    "neighborhood",
    "neighborhoodName",
}

SECTION_PATHS_BY_LEVEL: dict[LocationLevel, set[str]] = {
    "country": {"guide.media", "guide.countryData"},
    "city": {"guide.media", "guide.localShared", "guide.explore", "guide.stay", "guide.move"},
    "neighborhood": {
        "guide.media",
        "guide.localShared",
        "guide.explore",
        "guide.stay",
        "guide.move",
    },
}

FIELD_PATHS_BY_LEVEL: dict[LocationLevel, set[str]] = {
    "country": COMMON_FIELD_PATHS | COUNTRY_ONLY_FIELD_PATHS,
    "city": COMMON_FIELD_PATHS | LOCAL_FIELD_PATHS | {"city", "cityName"},
    "neighborhood": COMMON_FIELD_PATHS
    | LOCAL_FIELD_PATHS
    | {"city", "cityName"}
    | NEIGHBORHOOD_ONLY_FIELD_PATHS,
}


def is_section_path_allowed(level: LocationLevel, section_path: str) -> bool:
    return section_path in SECTION_PATHS_BY_LEVEL[level]


def is_field_path_allowed(level: LocationLevel, field_path: str) -> bool:
    return field_path in FIELD_PATHS_BY_LEVEL[level]
