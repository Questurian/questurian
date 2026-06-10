/**
 * Integration Toggle wire types (see LM CONTEXT.md "Integration Toggle"):
 * operator-controlled runtime switches over paid third-party integrations.
 */

export const GOOGLE_PHOTO_IMPORT_TOGGLE_KEY = "google-photo-import";

export interface IntegrationToggleState {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
  /** False when the integration's API key is missing — hard-disabled regardless of `enabled`. */
  available: boolean;
}

export interface AppSettingsResponse {
  toggles: IntegrationToggleState[];
}

export interface UpdateIntegrationToggleRequest {
  enabled: boolean;
}
