import type { ImageVariant, ImageVariantType } from "@questurian/lm-shared";
import { renderToStaticMarkup } from "react-dom/server";
import type { LocationResponse, Upload } from "../../../shared/services/api/types";
import { DiningHomepageCardPreview } from "./DiningHomepageCardPreview";
import { mapLocationToDiningHomepageCardPreview } from "./dining-homepage-card-preview.utils";

declare const describe: (name: string, callback: () => void) => void;
declare const test: (name: string, callback: () => void) => void;
declare const expect: (value: unknown) => {
  toBe: (expected: unknown) => void;
};

function buildLocation(overrides: Partial<LocationResponse> = {}): LocationResponse {
  return {
    id: 1,
    title: "Central Restaurante",
    category: "dining",
    type: "fine-dining",
    locationKey: "peru|lima|barranco",
    district: "Barranco",
    ianaTimeId: "America/Lima",
    placeId: "ChIJ123",
    tripadvisorUrl: null,
    tripadvisorLocationId: null,
    menuUrl: null,
    bookingUrl: null,
    payload_location_ref: null,
    selectedPayloadMediaSetIds: null,
    tourIds: null,
    tours: [],
    nightlifeDetails: null,
    accommodationsDetails: null,
    attractionsDetails: null,
    keyLocationsDetails: null,
    neighborhoodDescription: null,
    idealFor: null,
    operationHours: null,
    tripadvisorMealTypes: null,
    tripadvisorCuisines: null,
    tripadvisorFeatures: null,
    priceLevel: null,
    contact: {
      countryCode: null,
      phoneNumber: null,
      phoneUnavailable: false,
      website: null,
      email: null,
      contactAddress: null,
      url: "",
    },
    coordinates: { lat: null, lng: null },
    source: { name: "Central", address: "Av. Pedro de Osma 301" },
    instagram_embeds: [],
    uploads: [],
    slug: null,
    provenance: null,
    pendingSuggestions: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function variant(type: ImageVariantType, path: string): ImageVariant {
  return {
    type,
    aspectRatio: "1:1",
    dimensions: { width: 100, height: 100 },
    path,
    size: 100,
    format: "webp",
  };
}

function upload(variants: ImageVariant[]): Upload {
  return {
    id: 10,
    location_id: 1,
    format: "imageset",
    imageSet: {
      id: "set-1",
      sourceImage: {
        path: "source.webp",
        dimensions: { width: 100, height: 100 },
        size: 100,
        format: "webp",
      },
      variants,
      created_at: "2026-01-01T00:00:00.000Z",
    },
  };
}

describe("dining homepage card preview", () => {
  test("uses source name when title is missing", () => {
    const preview = mapLocationToDiningHomepageCardPreview(
      buildLocation({ title: " ", source: { name: "Maito", address: "Lima" } })
    );

    expect(preview.title).toBe("Maito");
    expect(preview.alt).toBe("Maito");
  });

  test("picks wide image variant before square", () => {
    const preview = mapLocationToDiningHomepageCardPreview(
      buildLocation({
        uploads: [
          upload([
            variant("square", "data/images/central-square.webp"),
            variant("wide", "data/images/central-wide.webp"),
          ]),
        ],
      })
    );

    expect(preview.imageUrl).toBe("/api/images/central-wide.webp");
  });

  test("returns missing-image state when no upload variant exists", () => {
    const preview = mapLocationToDiningHomepageCardPreview(buildLocation({ uploads: [upload([])] }));

    expect(preview.imageUrl).toBe(null);
  });

  test("returns missing-image state when upload variants have no path", () => {
    const preview = mapLocationToDiningHomepageCardPreview(
      buildLocation({ uploads: [upload([variant("wide", "   ")])] })
    );

    expect(preview.imageUrl).toBe(null);
  });

  test("builds image API path through location media utility", () => {
    const preview = mapLocationToDiningHomepageCardPreview(
      buildLocation({
        uploads: [
          upload([
            variant(
              "wide",
              "apps/location-manager/packages/server/data/images/nested/central-wide.webp"
            ),
          ]),
        ],
      })
    );

    expect(preview.imageUrl).toBe("/api/images/nested/central-wide.webp");
  });

  test("renders missing image placeholder in card frame", () => {
    const html = renderToStaticMarkup(<DiningHomepageCardPreview location={buildLocation()} />);

    expect(html.includes("Missing image")).toBe(true);
    expect(html.includes("Central Restaurante")).toBe(true);
  });
});
