/**
 * Which jobs an operator has moved off their default, and to what.
 *
 * Only the changes are stored, never the whole table. A job nobody has touched
 * follows the registry's default, so adding a job in code makes it appear here
 * on the right model without anybody re-saving anything, and a default changed
 * in code reaches every untouched job immediately. Storing the full table
 * would freeze all 42 jobs at whatever they were the first time this file was
 * written, and the freeze would be invisible.
 *
 * A plain JSON file rather than a table in the usage database. The usage store
 * holds an append-only history that grows without bound and gets swept; this
 * is a handful of lines someone should be able to read, diff and delete by
 * hand when a model change needs explaining.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { jobById } from "./catalogue";

export interface ModelOverride {
  model: string;
  /** When it was changed, so the dashboard can say "since when". */
  changedAt: string;
  /** Optional free text, for why. */
  note?: string;
}

export type OverrideMap = Record<string, ModelOverride>;

interface OverrideFile {
  version: number;
  overrides: OverrideMap;
}

const FILE_VERSION = 1;

export function settingsPath(): string {
  return (
    process.env.MODEL_SETTINGS_PATH?.trim() ||
    join(process.cwd(), "data", "model-settings.json")
  );
}

export interface SettingsStore {
  overrides(): OverrideMap;
  set(jobId: string, model: string, note?: string): ModelOverride;
  clear(jobId: string): boolean;
}

export class UnknownJobError extends Error {}
export class NotConfigurableError extends Error {}

export function createSettingsStore(path = settingsPath()): SettingsStore {
  let cache: OverrideMap | undefined;

  function read(): OverrideMap {
    if (cache) return cache;
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8")) as OverrideFile;
      // Entries for jobs that no longer exist are dropped on read rather than
      // deleted from disk: a job id can come back when a branch is switched,
      // and silently discarding somebody's setting because they changed branch
      // would be worse than carrying a line nothing reads.
      cache = Object.fromEntries(
        Object.entries(parsed.overrides ?? {}).filter(
          ([jobId, value]) => jobById(jobId) !== undefined && typeof value?.model === "string",
        ),
      );
    } catch {
      // No file yet, or an unreadable one. Either way every job is on its
      // default, which is a correct answer rather than a degraded one.
      cache = {};
    }
    return cache;
  }

  function write(next: OverrideMap): void {
    cache = next;
    mkdirSync(dirname(path), { recursive: true });
    // Written beside and renamed, so a crash mid-write cannot leave a
    // half-parsed file that would reset every job to its default at once.
    const scratch = `${path}.writing`;
    writeFileSync(
      scratch,
      `${JSON.stringify({ version: FILE_VERSION, overrides: next }, null, 2)}\n`,
      "utf8",
    );
    renameSync(scratch, path);
  }

  return {
    overrides: () => ({ ...read() }),

    set(jobId, model, note) {
      const job = jobById(jobId);
      if (!job) throw new UnknownJobError(`No job named '${jobId}'`);
      if (job.defaultModel === null) {
        throw new NotConfigurableError(
          `'${jobId}' reaches an API with no model behind it`,
        );
      }
      const trimmed = model.trim();
      if (!trimmed) throw new NotConfigurableError("A model name is required");

      const entry: ModelOverride = {
        model: trimmed,
        changedAt: new Date().toISOString(),
        ...(note?.trim() ? { note: note.trim() } : {}),
      };
      write({ ...read(), [jobId]: entry });
      return entry;
    },

    clear(jobId) {
      const current = read();
      if (!(jobId in current)) return false;
      const next = { ...current };
      delete next[jobId];
      write(next);
      return true;
    },
  };
}

let shared: SettingsStore | undefined;

export function getSettingsStore(): SettingsStore {
  shared ??= createSettingsStore();
  return shared;
}
