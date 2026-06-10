import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { GOOGLE_PHOTO_IMPORT_TOGGLE_KEY } from "@questurian/lm-shared";
import { appSettingsApi } from "../app-settings.api";

export const APP_SETTINGS_QUERY_KEY = ["admin", "settings"] as const;

/** Integration Toggles with current values (see LM CONTEXT.md "Integration Toggle"). */
export function useAppSettings() {
  return useQuery({
    queryKey: APP_SETTINGS_QUERY_KEY,
    queryFn: () => appSettingsApi.getSettings(),
  });
}

export function useUpdateIntegrationToggle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ key, enabled }: { key: string; enabled: boolean }) =>
      appSettingsApi.updateToggle(key, enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: APP_SETTINGS_QUERY_KEY });
    },
  });
}

/**
 * Whether Google Photo Import is usable right now: toggle on AND API key present.
 * `isLoading` lets flows that hide/skip UI avoid flashing the wrong state.
 */
export function useGooglePhotoImportEnabled(): { enabled: boolean; isLoading: boolean } {
  const { data: toggles, isLoading } = useAppSettings();
  const toggle = toggles?.find((t) => t.key === GOOGLE_PHOTO_IMPORT_TOGGLE_KEY);
  return { enabled: !!toggle && toggle.enabled && toggle.available, isLoading };
}
