/**
 * The job-to-model table, served to the apps and editable by an operator.
 *
 * This is the one place in the dashboard that decides something rather than
 * observing it, and ADR 0001 draws the line carefully: the dashboard *owns*
 * the setting, but never sits in the path of a call. It publishes a table; the
 * gateway inside each app reads it, caches it, and falls back to its own
 * checked-in defaults when this is unreachable. Nothing here can stop a model
 * call, or slow one down, or be on the critical path of one.
 *
 * Two shapes are served, for two readers:
 *
 * `GET /v1/models`  the flat table the gateway fetches. Defaults merged with
 *                   overrides, so a job nobody has touched follows the code.
 * `GET /v1/jobs`    the same thing plus what the screen needs to explain it --
 *                   which app, what the job does, where the call is made, what
 *                   it would run on if the override were removed.
 */

import { Hono } from "hono";
import { allJobs, configurableJobs, jobById } from "../settings/catalogue";
import {
  getSettingsStore,
  NotConfigurableError,
  UnknownJobError,
  type SettingsStore,
} from "../settings/store";
import { listenerStatuses } from "../settings/listeners";
import { servedBy } from "../settings/substitution";
import { modelRates } from "../usage/rates";

export const SETTINGS_SCHEMA_VERSION = 1;

export interface SettingsRouteOptions {
  store?: SettingsStore;
}

export function createSettingsRoutes(options: SettingsRouteOptions = {}): Hono {
  const settings = new Hono();
  const store = () => options.store ?? getSettingsStore();

  settings.onError((error, c) => {
    if (error instanceof UnknownJobError) return c.json({ error: error.message }, 404);
    if (error instanceof NotConfigurableError) return c.json({ error: error.message }, 400);
    console.error("[settings] request failed:", error);
    return c.json({ error: "internal error" }, 500);
  });

  settings.get("/v1", (c) =>
    c.json({
      schemaVersion: SETTINGS_SCHEMA_VERSION,
      table: "GET /api/settings/v1/models",
      jobs: "GET /api/settings/v1/jobs",
      listeners: "GET /api/settings/v1/listeners",
      change: "PUT /api/settings/v1/models/:jobId",
      reset: "DELETE /api/settings/v1/models/:jobId",
    }),
  );

  // What the gateway fetches. Deliberately the smallest useful shape: a job id
  // and a model, nothing the apps would have to understand to keep running.
  settings.get("/v1/models", (c) => {
    const overrides = store().overrides();
    const jobs: Record<string, { model: string | null }> = {};
    for (const job of allJobs()) {
      jobs[job.id] = { model: overrides[job.id]?.model ?? job.defaultModel };
    }
    return c.json({ version: SETTINGS_SCHEMA_VERSION, jobs });
  });

  // What the screen needs, which is more: an operator changing a model should
  // be able to see what the job is and what they are moving it away from.
  settings.get("/v1/jobs", (c) => {
    const overrides = store().overrides();
    return c.json({
      version: SETTINGS_SCHEMA_VERSION,
      // Offered rather than enforced. A model with no rate is still callable
      // -- it just reports unpriced -- so this is the list worth suggesting,
      // not a whitelist.
      offeredModels: modelRates()
        .filter((rate) => rate.inUse)
        .map((rate) => rate.model),
      jobs: allJobs().map((job) => {
        const override = overrides[job.id];
        const model = override?.model ?? job.defaultModel;
        return {
          ...job,
          model,
          // A job asking for Claude is really running on Gemini. Saying so
          // here is the difference between a readable table and the invisible
          // rewrite this whole piece of work exists to end.
          servedBy: servedBy(model),
          overridden: override !== undefined,
          changedAt: override?.changedAt ?? null,
          note: override?.note ?? null,
          configurable: job.defaultModel !== null,
        };
      }),
    });
  });

  settings.put("/v1/models/:jobId", async (c) => {
    const jobId = c.req.param("jobId");
    const body = (await c.req.json().catch(() => null)) as
      | { model?: unknown; note?: unknown }
      | null;
    if (!body || typeof body.model !== "string") {
      return c.json({ error: "body must be { model: string, note?: string }" }, 400);
    }
    const entry = store().set(
      jobId,
      body.model,
      typeof body.note === "string" ? body.note : undefined,
    );
    return c.json({ jobId, ...entry });
  });

  settings.delete("/v1/models/:jobId", (c) => {
    const jobId = c.req.param("jobId");
    const job = jobById(jobId);
    if (!job) return c.json({ error: `No job named '${jobId}'` }, 404);
    const cleared = store().clear(jobId);
    return c.json({ jobId, cleared, model: job.defaultModel });
  });

  // Asked of the apps rather than of this dashboard's own state, because
  // serving a table and having it read are different facts and only the first
  // was ever visible here.
  settings.get("/v1/listeners", async (c) => c.json({ apps: await listenerStatuses() }));

  // Named separately because "how many of these can actually be changed" is
  // the first question a settings screen has to answer honestly.
  settings.get("/v1/configurable", (c) =>
    c.json({ jobs: configurableJobs().map((job) => job.id) }),
  );

  return settings;
}

export default createSettingsRoutes();
