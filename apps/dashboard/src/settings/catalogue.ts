/**
 * Every model call the repo makes, read from the gateway's own registry.
 *
 * The dashboard owns which model a job runs on, so it has to render a screen
 * listing the jobs -- and the jobs are defined in a Python package. Keeping a
 * TypeScript copy of that list would rebuild, in a new place, exactly the
 * drift the gateway was written to end: a job added in Python and missing
 * here would simply never appear as something an operator could change.
 *
 * So the registry is JSON, both runtimes read it, and this is the TypeScript
 * reader. Read at runtime rather than imported, for the same reason as the
 * rate table: the gateway sits outside this app's `rootDir`.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface JobRecord {
  id: string;
  app: string;
  call: string;
  summary: string;
  site: string;
  /** What it runs on with nothing overriding it. Null for the Places lookups. */
  defaultModel: string | null;
}

export const CATALOGUE_PATH = join(
  import.meta.dir,
  "../../../../packages/model-gateway/src/model_gateway/jobs.json",
);

interface CatalogueFile {
  version: number;
  jobs: JobRecord[];
}

function readCatalogue(): JobRecord[] {
  // Unguarded on purpose. A missing registry is a broken install, not a
  // runtime condition to degrade through, and a settings screen that silently
  // lists nothing is worse than one that fails loudly at boot.
  const parsed = JSON.parse(readFileSync(CATALOGUE_PATH, "utf8")) as CatalogueFile;
  if (!Array.isArray(parsed.jobs) || parsed.jobs.length === 0) {
    throw new Error(`${CATALOGUE_PATH} lists no jobs`);
  }
  return parsed.jobs;
}

// Read once per process. The registry is checked into the repo, so within one
// run of this server it cannot change -- but it very much changes while the
// server is running, because editing jobs.json is how a model gets moved. This
// dashboard then keeps serving the table it read at boot, the apps keep asking
// it, and a jobs.json edit looks like it did nothing. `bun --watch` reloads on
// a TypeScript change, not a JSON one, so restart the dashboard after editing
// the registry and check GET /api/settings/v1/models before believing a move
// took effect.
let cached: JobRecord[] | undefined;

export function allJobs(): JobRecord[] {
  cached ??= readCatalogue();
  return cached;
}

export function jobById(id: string): JobRecord | undefined {
  return allJobs().find((job) => job.id === id);
}

/**
 * Jobs whose model can be changed at all.
 *
 * The two Places lookups reach an API with no model behind them. Offering a
 * model picker for those would be offering a choice that does nothing.
 */
export function configurableJobs(): JobRecord[] {
  return allJobs().filter((job) => job.defaultModel !== null);
}
