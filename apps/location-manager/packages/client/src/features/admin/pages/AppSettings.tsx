import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import {
  useAppSettings,
  useUpdateIntegrationToggle,
} from "@client/shared/services/api/hooks";
import { Breadcrumbs } from "@client/shared/components/layout";

export function AppSettings() {
  const { data: toggles, isLoading, error } = useAppSettings();
  const updateToggle = useUpdateIntegrationToggle();
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const handleToggle = async (key: string, enabled: boolean) => {
    setSavingKey(key);
    try {
      await updateToggle.mutateAsync({ key, enabled });
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: "Admin" }, { label: "Settings" }]} />

      <div className="bg-card border border-border rounded-xl p-6">
        <div className="mb-6">
          <h2 className="text-[24px] font-bold mb-2 text-foreground">Integration Toggles</h2>
          <p className="text-muted-foreground">
            Turn paid third-party integrations on or off. Changes apply immediately — no
            restart needed.
          </p>
        </div>

        {isLoading && <p className="text-sm text-muted-foreground">Loading settings…</p>}
        {error && (
          <p className="text-sm text-destructive">
            Failed to load settings: {error instanceof Error ? error.message : "unknown error"}
          </p>
        )}

        <div className="space-y-4">
          {toggles?.map((toggle) => {
            const saving = savingKey === toggle.key;
            return (
              <div
                key={toggle.key}
                className="flex items-start justify-between gap-4 rounded-lg border border-border p-4"
              >
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-foreground">{toggle.label}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{toggle.description}</p>
                  {!toggle.available && (
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-600">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      API key not configured — the integration stays disabled even when
                      toggled on.
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={toggle.enabled}
                  aria-label={`${toggle.label} ${toggle.enabled ? "on" : "off"}`}
                  disabled={saving}
                  onClick={() => void handleToggle(toggle.key, !toggle.enabled)}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
                    toggle.enabled ? "bg-green-600" : "bg-muted-foreground/30"
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                      toggle.enabled ? "translate-x-5" : "translate-x-0.5"
                    }`}
                  />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
