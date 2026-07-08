/**
 * Concurrency-limited runner for the client-orchestrated add-time AI
 * suggestion batch (ADR-0008 §2).
 *
 * `run` resolves true when the suggestion was applied to the form and false
 * when the response was unusable (server-reported error, failed client
 * validation); a thrown error also counts as failed. Callbacks fire per field
 * so callers can drive pending badges and progress overlays.
 */
export type SuggestionBatchOutcome = "applied" | "rejected" | "error";

export interface SuggestionBatchProgress {
  total: number;
  completed: number;
  applied: number;
  failed: number;
}

export interface SuggestionBatchResult {
  total: number;
  applied: number;
  failed: number;
}

export async function runSuggestionBatch<TField>(options: {
  fields: readonly TField[];
  concurrency: number;
  run: (field: TField) => Promise<boolean>;
  onFieldStart?: (field: TField) => void;
  onFieldSettled?: (
    field: TField,
    outcome: SuggestionBatchOutcome,
    error: unknown,
    progress: SuggestionBatchProgress
  ) => void;
}): Promise<SuggestionBatchResult> {
  const { fields, concurrency, run, onFieldStart, onFieldSettled } = options;
  const total = fields.length;
  let cursor = 0;
  let completed = 0;
  let applied = 0;
  let failed = 0;

  const worker = async () => {
    while (cursor < total) {
      const field = fields[cursor++];
      onFieldStart?.(field);
      let outcome: SuggestionBatchOutcome;
      let error: unknown;
      try {
        outcome = (await run(field)) ? "applied" : "rejected";
      } catch (err) {
        outcome = "error";
        error = err;
      }
      if (outcome === "applied") applied += 1;
      else failed += 1;
      completed += 1;
      onFieldSettled?.(field, outcome, error, { total, completed, applied, failed });
    }
  };

  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(concurrency, total)) }, () => worker())
  );
  return { total, applied, failed };
}
