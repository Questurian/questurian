import { apiGet } from "./client";
import { API_ENDPOINTS } from "./config";
import type { LeadsApiHealthResponse } from "./types";

export const healthApi = {
  async checkLeadsApiHealth(): Promise<LeadsApiHealthResponse["data"]> {
    return apiGet<LeadsApiHealthResponse["data"]>(API_ENDPOINTS.LEADS_API_HEALTH);
  },
};
