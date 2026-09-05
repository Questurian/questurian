/**
 * What a Claude model name is actually served with.
 *
 * Three Prompt2Blog jobs ask for a Claude model and none has run on Claude for
 * months: both Claude paths are off, so every one of those requests is
 * rewritten to Gemini before it reaches a provider. The rewrite was real and
 * invisible, and a settings screen showing `claude-sonnet-5-medium` next to a
 * job without saying what runs would rebuild exactly that invisibility in a
 * new place.
 *
 * Read from the gateway's own map, so what an operator reads here is the map
 * that runs.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

export const SUBSTITUTION_PATH = join(
  import.meta.dir,
  "../../../../packages/model-gateway/src/model_gateway/substitution.json",
);

interface SubstitutionFile {
  enabledBy: string[];
  defaultSubstitute: string;
  substitutes: Record<string, string>;
}

let cached: SubstitutionFile | undefined;

function map(): SubstitutionFile {
  cached ??= JSON.parse(readFileSync(SUBSTITUTION_PATH, "utf8")) as SubstitutionFile;
  return cached;
}

/** Whether any Claude path is switched on for the processes reading this. */
export function claudeReachable(): boolean {
  const truthy = new Set(["1", "true", "yes", "on"]);
  return map().enabledBy.some((name) =>
    truthy.has((process.env[name] ?? "").trim().toLowerCase()),
  );
}

/**
 * The model that will really serve a request for this name, or null when the
 * name is served as asked.
 */
export function servedBy(model: string | null): string | null {
  if (!model || !model.toLowerCase().startsWith("claude")) return null;
  if (claudeReachable()) return null;
  const table = map();
  const substitute = table.substitutes[model.trim().toLowerCase()] ?? table.defaultSubstitute;
  return substitute === model ? null : substitute;
}
