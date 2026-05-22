import { EnvConfig } from "@server/shared/config/env.config";

export interface GoogleAuthorAttribution {
  displayName: string;
  uri?: string;
  photoUri?: string;
}

export interface GooglePlacePhoto {
  name: string;
  widthPx: number | null;
  heightPx: number | null;
  authorAttributions: GoogleAuthorAttribution[];
}

interface RawAuthorAttribution {
  displayName?: string;
  uri?: string;
  photoUri?: string;
}

interface RawPlacePhoto {
  name?: string;
  widthPx?: number;
  heightPx?: number;
  authorAttributions?: RawAuthorAttribution[];
}

interface RawPlace {
  id?: string;
  photos?: RawPlacePhoto[];
}

const PLACE_FIELDS = "id,photos";
const PLACES_BASE = "https://places.googleapis.com/v1";
const DEFAULT_PHOTO_MAX_WIDTH = 1600;

export class GooglePlacesPhotosClient {
  private readonly apiKey: string;

  constructor(config: EnvConfig) {
    this.apiKey = config.GOOGLE_MAPS_API_KEY || "";
  }

  isConfigured(): boolean {
    return this.apiKey.trim().length > 0;
  }

  async getPhotosForPlace(placeId: string): Promise<GooglePlacePhoto[]> {
    this.requireConfigured();
    const resource = placeId.startsWith("places/") ? placeId : `places/${placeId}`;
    const url = `${PLACES_BASE}/${resource}?fields=${encodeURIComponent(PLACE_FIELDS)}`;

    const response = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": this.apiKey,
      },
    });

    if (!response.ok) {
      const body = await this.safeJson(response);
      const message = body?.error?.message || `Google Places lookup failed (${response.status})`;
      throw new Error(message);
    }

    const data = (await response.json()) as RawPlace;
    const photos = data.photos ?? [];

    return photos
      .filter((photo): photo is RawPlacePhoto & { name: string } => typeof photo.name === "string" && photo.name.length > 0)
      .map((photo) => ({
        name: photo.name,
        widthPx: typeof photo.widthPx === "number" ? photo.widthPx : null,
        heightPx: typeof photo.heightPx === "number" ? photo.heightPx : null,
        authorAttributions: (photo.authorAttributions ?? [])
          .filter((author): author is RawAuthorAttribution & { displayName: string } =>
            typeof author.displayName === "string" && author.displayName.trim().length > 0
          )
          .map((author) => ({
            displayName: author.displayName.trim(),
            ...(author.uri ? { uri: author.uri } : {}),
            ...(author.photoUri ? { photoUri: author.photoUri } : {}),
          })),
      }));
  }

  async getPhotoUri(photoName: string, maxWidthPx: number = DEFAULT_PHOTO_MAX_WIDTH): Promise<string> {
    this.requireConfigured();
    const url = `${PLACES_BASE}/${photoName}/media?maxWidthPx=${maxWidthPx}&skipHttpRedirect=true`;

    const response = await fetch(url, {
      headers: {
        "X-Goog-Api-Key": this.apiKey,
      },
    });

    if (!response.ok) {
      const body = await this.safeJson(response);
      const message = body?.error?.message || `Google photo URI lookup failed (${response.status})`;
      throw new Error(message);
    }

    const data = (await response.json()) as { photoUri?: string };
    if (!data.photoUri) {
      throw new Error("Google photo response missing photoUri");
    }
    return data.photoUri;
  }

  async fetchPhotoBytes(photoName: string, maxWidthPx: number = DEFAULT_PHOTO_MAX_WIDTH): Promise<Buffer> {
    const photoUri = await this.getPhotoUri(photoName, maxWidthPx);
    const response = await fetch(photoUri);
    if (!response.ok) {
      throw new Error(`Failed to download Google photo bytes (${response.status})`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  private requireConfigured(): void {
    if (!this.isConfigured()) {
      throw new Error("GOOGLE_MAPS_API_KEY is not set; Google Places photo import disabled");
    }
  }

  private async safeJson(response: Response): Promise<{ error?: { message?: string } } | null> {
    try {
      return (await response.json()) as { error?: { message?: string } };
    } catch {
      return null;
    }
  }
}
