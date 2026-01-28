import { apiGet } from "./client";

export interface TypeOption {
  label: string;
  value: string;
}

export const typesApi = {
  async getDiningTypes(): Promise<TypeOption[]> {
    const response = await apiGet<{ options: TypeOption[] }>("/api/dining-types");
    return response.options;
  },

  async getAccommodationsTypes(): Promise<TypeOption[]> {
    const response = await apiGet<{ options: TypeOption[] }>("/api/accommodations-types");
    return response.options;
  },

  async getAttractionsTypes(): Promise<TypeOption[]> {
    const response = await apiGet<{ options: TypeOption[] }>("/api/attractions-types");
    return response.options;
  },

  async getNightlifeTypes(): Promise<TypeOption[]> {
    const response = await apiGet<{ options: TypeOption[] }>("/api/nightlife-types");
    return response.options;
  },
};
