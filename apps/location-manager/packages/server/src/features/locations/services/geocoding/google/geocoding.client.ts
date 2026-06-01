interface GeocodeResponse {
  status: string;
  results?: Array<{
    address_components?: Array<{
      long_name: string;
      short_name: string;
      types: string[];
    }>;
    geometry: {
      location: {
        lat: number;
        lng: number;
      };
    };
  }>;
}

export type GeocodeResult = {
  lat: number;
  lng: number;
  countryCode?: string;
  sublocality?: string;
};

export async function geocode(address: string, apiKey?: string): Promise<GeocodeResult | null> {
  if (!apiKey) return null;

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json() as GeocodeResponse;

    if (data.status !== "OK" || !data.results?.length) return null;

    const result = data.results[0];
    if (!result?.geometry?.location) return null;

    const countryComponent = result.address_components?.find((component) =>
      component.types?.includes("country")
    );
    const sublocalityComponent = result.address_components?.find((component) =>
      component.types?.includes("sublocality_level_1") || component.types?.includes("sublocality")
    );

    return {
      lat: result.geometry.location.lat,
      lng: result.geometry.location.lng,
      countryCode: countryComponent?.short_name,
      sublocality: sublocalityComponent?.long_name,
    };
  } catch (error) {
    console.error("Error fetching coordinates:", error);
    return null;
  }
}
