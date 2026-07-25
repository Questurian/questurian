export interface PayloadLocationQueryResponse {
  docs: Array<{
    id: string;
    locationKey?: string;
  }>;
  totalDocs?: number;
}

export type PayloadLocationCreateData =
  | {
      level: "country";
      country: string;
      countryName: string;
    }
  | {
      level: "city";
      country: string;
      city: string;
      countryName: string;
      cityName: string;
    }
  | {
      level: "neighborhood";
      country: string;
      city: string;
      neighborhood: string;
      countryName: string;
      cityName: string;
      neighborhoodName: string;
    };

export interface PayloadLocationCreateResponse {
  message: string;
  doc: {
    id: string;
    level: string;
    locationKey?: string;
  };
}
