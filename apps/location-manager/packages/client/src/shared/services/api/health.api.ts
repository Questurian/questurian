import { apiGet } from "./client";
import { API_ENDPOINTS } from "./config";
import type { TranslationApiHealthResponse } from "./types";

export const healthApi = {
  async checkTranslationApiHealth(): Promise<TranslationApiHealthResponse["data"]> {
    return apiGet<TranslationApiHealthResponse["data"]>(API_ENDPOINTS.TRANSLATION_API_HEALTH);
  },
};
