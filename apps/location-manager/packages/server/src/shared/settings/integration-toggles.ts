import { GOOGLE_PHOTO_IMPORT_TOGGLE_KEY } from "@questurian/lm-shared";
import { EnvConfig } from "@server/shared/config/env.config";
import { getBooleanSetting, setBooleanSetting } from "./app-settings.repository";

/**
 * Registry of Integration Toggles (see LM CONTEXT.md): operator-controlled
 * runtime switches over paid third-party integrations. A toggle being on is
 * necessary but not sufficient — a missing API key hard-disables the
 * integration regardless (`available: false`).
 */

export interface IntegrationToggleDefinition {
  key: string;
  label: string;
  description: string;
  defaultEnabled: boolean;
  /** Key-presence check; false hard-disables the integration regardless of the toggle. */
  isAvailable: () => boolean;
}

const INTEGRATION_TOGGLES: IntegrationToggleDefinition[] = [
  {
    key: GOOGLE_PHOTO_IMPORT_TOGGLE_KEY,
    label: "Google Photo Import",
    description:
      "Pull location photos from Google Places (paid Places API media calls). When off, the Add flow skips its photo phase and the edit surface hides Pull from Google.",
    defaultEnabled: false,
    isAvailable: () => EnvConfig.getInstance().hasGoogleMapsKey(),
  },
];

export function listIntegrationToggles(): IntegrationToggleDefinition[] {
  return INTEGRATION_TOGGLES;
}

export function getIntegrationToggle(key: string): IntegrationToggleDefinition | undefined {
  return INTEGRATION_TOGGLES.find((t) => t.key === key);
}

export function isIntegrationEnabled(key: string): boolean {
  const toggle = getIntegrationToggle(key);
  if (!toggle) return false;
  return getBooleanSetting(toggle.key, toggle.defaultEnabled);
}

export function setIntegrationEnabled(key: string, enabled: boolean): void {
  setBooleanSetting(key, enabled);
}
