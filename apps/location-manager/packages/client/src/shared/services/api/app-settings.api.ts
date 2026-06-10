import { apiGet, apiPut } from "./client";
import type { AppSettingsResponse, IntegrationToggleState } from "@questurian/lm-shared";

export const appSettingsApi = {
  async getSettings(): Promise<IntegrationToggleState[]> {
    const response = await apiGet<AppSettingsResponse>("/api/admin/settings");
    return response.toggles;
  },

  async updateToggle(key: string, enabled: boolean): Promise<IntegrationToggleState> {
    return apiPut<IntegrationToggleState>(`/api/admin/settings/${key}`, { enabled });
  },
};
